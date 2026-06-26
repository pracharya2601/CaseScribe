"""In-memory job store + the pipeline import seam.

This module owns:
  - the AgentBox job status object (in-memory, no DB),
  - the typed `process_session` seam that the real pipeline (built by the
    `casescribe-pipeline` agent) drops in behind unchanged,
  - `STUB_TRINITY`, a hardcoded Trinity so the spine runs end-to-end today.

Ownership: casescribe-backend. Do not import from app.py here (one-way dep).
"""

from __future__ import annotations

import asyncio
import time
import uuid
from typing import Any, Callable, Dict, List, Optional, Protocol

# --------------------------------------------------------------------------- #
# Trinity stub — matches the platform-skill Trinity contract exactly.
# The real pipeline returns this same shape; until it lands we serve this so
# the frontend + container can be built and demoed against a live spine.
# --------------------------------------------------------------------------- #

STUB_TRINITY: Dict[str, Any] = {
    "student_token": "[PERSON_A]",
    "session_date": "2026-06-26",
    "elapsed_ms": 0,  # filled in per-run by the executor
    "models_used": [
        {
            "step": "classifier",
            "model": "nvidia/NVIDIA-Nemotron-3-Nano-Omni",
            "latency_ms": 120,
            "input_tokens": 480,
            "output_tokens": 60,
        },
        {
            "step": "reporter",
            "model": "Qwen/Qwen3-Next-80B-A3B-Instruct",
            "latency_ms": 340,
            "input_tokens": 520,
            "output_tokens": 110,
        },
        {
            "step": "medicaid",
            "model": "Qwen/Qwen3-Coder-480B-A35B-Instruct-FP8",
            "latency_ms": 410,
            "input_tokens": 500,
            "output_tokens": 90,
        },
        {
            "step": "casenote",
            "model": "anthropic/claude-sonnet-4.6",
            "latency_ms": 1300,
            "input_tokens": 640,
            "output_tokens": 320,
        },
    ],
    "case_note": {
        "format": "SOAP",
        "fields": {
            "subjective": (
                "[PERSON_A] reported feeling overwhelmed by upcoming exams and "
                "described difficulty sleeping over the past two weeks."
            ),
            "objective": (
                "Student presented with flat affect and reduced eye contact. "
                "Engaged cooperatively once rapport was established. 30-minute "
                "individual session."
            ),
            "assessment": (
                "Academic-stress-related anxiety with mild sleep disruption. No "
                "current safety concerns identified. Coping skills emerging."
            ),
            "plan": (
                "Continue weekly individual counseling. Introduce structured "
                "relaxation and sleep-hygiene strategies. Re-assess in two weeks."
            ),
        },
    },
    "reporter_flag": {
        "triggered": False,
        "category": "none",
        "confidence": 0.04,
        "snippet": "",
        "state": "CA",
        "timeline_hours": 36,
        "draft_filing": None,
        "regex_hit": False,
        "llm_hit": False,
    },
    "medicaid": {
        "billable": True,
        "cpt_code": "90832",
        "code_type": "CPT",
        "description": "Psychotherapy, 30 minutes with patient",
        "units": None,
        "estimated_reimbursement_usd": 65.42,
        "justification": (
            "Individual psychotherapy session, ~30 minutes face-to-face, "
            "medically necessary for diagnosed anxiety. LEA-BOP billable."
        ),
    },
}

# Stage order for the progressive UI (matches the four-stage pipeline graph).
STAGES: List[str] = ["scrubbing", "classifying", "drafting", "done"]


# --------------------------------------------------------------------------- #
# Pipeline seam — typed contract the real pipeline implements.
# --------------------------------------------------------------------------- #

# `progress(stage, models)` lets the pipeline push live updates into the job
# status object as each artifact completes. Either arg may be omitted.
ProgressFn = Callable[..., None]


class ProcessSession(Protocol):
    """The seam `backend/pipeline.py` (casescribe-pipeline) implements.

    Synchronous and potentially blocking (LLM calls); the executor runs it in
    a worker thread so the event loop stays free.
    """

    def __call__(
        self,
        payload: Dict[str, Any],
        progress: Optional[ProgressFn] = None,
    ) -> Dict[str, Any]:  # returns a Trinity dict
        ...


def _stub_process_session(
    payload: Dict[str, Any],
    progress: Optional[ProgressFn] = None,
) -> Dict[str, Any]:
    """Fallback pipeline: walks the stages, returns the hardcoded Trinity.

    Replaced transparently once `backend/pipeline.py` exists.
    """
    started = time.time()
    trinity = {k: v for k, v in STUB_TRINITY.items()}  # shallow copy
    models = trinity["models_used"]

    # Emit progressive stages so the polling UI has something to render.
    for stage in ("scrubbing", "classifying", "drafting"):
        if progress is not None:
            progress(stage=stage, models=models)
        time.sleep(0.05)  # token gesture so stages are observable in the demo

    trinity["elapsed_ms"] = int((time.time() - started) * 1000)
    if progress is not None:
        progress(stage="done", models=models)
    return trinity


# Import seam: prefer the real pipeline, fall back to the stub in dev / Wave 1.
try:  # pragma: no cover - depends on parallel agent's file existing
    from pipeline import process_session as _real_process_session

    process_session: ProcessSession = _real_process_session
    PIPELINE_SOURCE = "pipeline.process_session"
except Exception:  # ImportError today; broaden so a half-built pipeline can't crash the spine
    process_session = _stub_process_session
    PIPELINE_SOURCE = "stub"


# --------------------------------------------------------------------------- #
# In-memory job store.
# --------------------------------------------------------------------------- #


class JobStore:
    """Dict-backed job store. No persistence — hackathon scope (SPEC §4)."""

    def __init__(self) -> None:
        self._jobs: Dict[str, Dict[str, Any]] = {}
        self._lock = asyncio.Lock()

    def create(self) -> str:
        job_id = str(uuid.uuid4())
        self._jobs[job_id] = {
            "job_id": job_id,
            "status": "pending",
            "result": None,
            "error": None,
            "stage": None,
            "models": [],
        }
        return job_id

    def get(self, job_id: str) -> Optional[Dict[str, Any]]:
        return self._jobs.get(job_id)

    def update(self, job_id: str, **fields: Any) -> None:
        job = self._jobs.get(job_id)
        if job is not None:
            job.update(fields)


async def run_job(store: JobStore, job_id: str, payload: Dict[str, Any]) -> None:
    """Background task: run the pipeline and fold results into the job object."""
    store.update(job_id, status="running", stage="scrubbing")

    def progress(stage: Optional[str] = None, models: Optional[List[Any]] = None) -> None:
        fields: Dict[str, Any] = {}
        if stage is not None:
            fields["stage"] = stage
        if models is not None:
            fields["models"] = models
        if fields:
            store.update(job_id, **fields)

    try:
        # process_session may block (LLM calls); keep the event loop free.
        trinity = await asyncio.to_thread(process_session, payload, progress)
        store.update(
            job_id,
            status="completed",
            stage="done",
            result=trinity,
            models=trinity.get("models_used", []),
        )
    except Exception as exc:  # never let a worker crash take down the service
        store.update(job_id, status="failed", stage=None, error=str(exc))
