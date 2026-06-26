"""CaseScribe pipeline — the orchestration seam ``backend/jobs.py`` imports.

Contract (Wave-1, honored exactly):

    process_session(payload: dict, progress: Callable[..., None] | None = None) -> dict

``payload`` is the POST /run body (carries the dictation under any of
``dictation`` / ``text`` / ``raw_text`` / ``input``). The optional
``progress(stage=..., models=...)`` callback pushes live stage/model updates to
the polling UI; it is invoked as each sub-agent completes.

Order (the seam):  scrub  ->  classify  ->  (reporter ∥ medicaid)  ->  casenote
The case note waits on the reporter flag so risk language stays consistent.

PII is scrubbed ONCE up front; scrubbed text is passed to every sub-agent; the
``token_map`` rides back in the Trinity (re-injection is client-side only — we
never re-inject server-side).

Every model's JSON is validated against its Trinity sub-shape, retried once on
malformed output, and degrades gracefully — one bad field never 500s the run.
"""

from __future__ import annotations

import logging
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from typing import Any, Callable, Dict, List, Optional

import gmi
import pii

from agents import casenote as casenote_agent
from agents import classifier as classifier_agent
from agents import medicaid as medicaid_agent
from agents import reporter as reporter_agent

logger = logging.getLogger("casescribe.pipeline")

ProgressFn = Callable[..., None]

# Stage labels match the platform contract's progressive-UI states.
STAGE_SCRUBBING = "scrubbing"
STAGE_CLASSIFYING = "classifying"
STAGE_DRAFTING = "drafting"
STAGE_DONE = "done"

_DICTATION_KEYS = ("dictation", "text", "raw_text", "input", "transcript")


def _extract_dictation(payload: Dict[str, Any]) -> str:
    if not isinstance(payload, dict):
        return ""
    for key in _DICTATION_KEYS:
        val = payload.get(key)
        if isinstance(val, str) and val.strip():
            return val
    # Last resort: a lone string value in the payload.
    for val in payload.values():
        if isinstance(val, str) and val.strip():
            return val
    return ""


def _student_token(token_map: Dict[str, str]) -> str:
    """First PERSON token in the dictation (the student), or "" if none."""
    persons = sorted(t for t in token_map if t.startswith("[PERSON_"))
    return persons[0] if persons else ""


def _emit(progress: Optional[ProgressFn], *, stage: Optional[str] = None,
          models: Optional[List[Dict[str, Any]]] = None) -> None:
    if progress is None:
        return
    try:
        kwargs: Dict[str, Any] = {}
        if stage is not None:
            kwargs["stage"] = stage
        if models is not None:
            kwargs["models"] = models
        if kwargs:
            progress(**kwargs)
    except Exception as exc:  # progress is best-effort; never break the run
        logger.debug("progress callback raised (ignored): %r", exc)


# --------------------------------------------------------------------------- #
# Main entry                                                                   #
# --------------------------------------------------------------------------- #


def process_session(
    payload: Dict[str, Any],
    progress: Optional[ProgressFn] = None,
) -> Dict[str, Any]:
    started = time.perf_counter()
    calls: List[Any] = []          # ModelCall objects, in logical order
    models_used: List[Dict[str, Any]] = []

    def push_models() -> List[Dict[str, Any]]:
        nonlocal models_used
        models_used = [c.as_dict() if hasattr(c, "as_dict") else dict(c) for c in calls]
        return models_used

    raw_text = _extract_dictation(payload)

    # 1) SCRUB (once, up front) ------------------------------------------------
    _emit(progress, stage=STAGE_SCRUBBING, models=[])
    try:
        scrubbed, token_map = pii.scrub(raw_text)
    except Exception as exc:  # scrubbing must never crash the run
        logger.warning("scrub failed (%r); proceeding with raw text", exc)
        scrubbed, token_map = raw_text, {}

    # 2) CLASSIFY (cheap; feeds everyone) -------------------------------------
    _emit(progress, stage=STAGE_CLASSIFYING, models=push_models())
    classification, c_call = classifier_agent.classify(scrubbed)
    if c_call is not None:
        calls.append(c_call)
    _emit(progress, models=push_models())

    # 3) REPORTER ∥ MEDICAID (independent; run concurrently) ------------------
    _emit(progress, stage=STAGE_DRAFTING, models=push_models())
    with ThreadPoolExecutor(max_workers=2) as ex:
        fut_reporter = ex.submit(reporter_agent.check, scrubbed, classification)
        fut_medicaid = ex.submit(medicaid_agent.code, scrubbed, classification)
        reporter_flag, reporter_calls = fut_reporter.result()
        medicaid_block, m_call = fut_medicaid.result()

    calls.extend([c for c in reporter_calls if c is not None])
    if m_call is not None:
        calls.append(m_call)
    _emit(progress, models=push_models())

    # 4) CASENOTE (frontier; waits on the reporter flag) ----------------------
    case_note, n_call = casenote_agent.draft(scrubbed, classification, reporter_flag)
    if n_call is not None:
        calls.append(n_call)
    _emit(progress, models=push_models())

    elapsed_ms = int((time.perf_counter() - started) * 1000)

    trinity = {
        "student_token": _student_token(token_map),
        "session_date": _session_date(payload),
        "elapsed_ms": elapsed_ms,
        "models_used": push_models(),
        "case_note": case_note,
        "reporter_flag": reporter_flag,
        "medicaid": medicaid_block,
        # Contract #3: token_map rides back so the browser re-injects originals.
        "token_map": token_map,
        # Cost meter convenience (actual vs all-frontier counterfactual).
        "cost": gmi.cost_summary(models_used),
    }

    trinity = _validate_trinity(trinity)
    _emit(progress, stage=STAGE_DONE, models=trinity["models_used"])
    return trinity


def _session_date(payload: Dict[str, Any]) -> str:
    if isinstance(payload, dict):
        val = payload.get("session_date")
        if isinstance(val, str) and val.strip():
            return val.strip()
    return date.today().isoformat()


# --------------------------------------------------------------------------- #
# Trinity-shape validation (final safety net; coerce, never crash)            #
# --------------------------------------------------------------------------- #


def _validate_trinity(t: Dict[str, Any]) -> Dict[str, Any]:
    """Last-line guard: guarantee the top-level Trinity shape so the frontend
    never hits an undefined field, even if a sub-agent degraded badly."""

    # models_used -> list of well-formed dicts
    mu: List[Dict[str, Any]] = []
    for m in t.get("models_used") or []:
        d = m if isinstance(m, dict) else {}
        mu.append({
            "step": str(d.get("step", "")),
            "model": str(d.get("model", "")),
            "latency_ms": int(d.get("latency_ms", 0) or 0),
            "input_tokens": int(d.get("input_tokens", 0) or 0),
            "output_tokens": int(d.get("output_tokens", 0) or 0),
        })
    t["models_used"] = mu

    # case_note
    cn = t.get("case_note") or {}
    fmt = cn.get("format") if cn.get("format") in ("SOAP", "GIRP") else "SOAP"
    fields = cn.get("fields") if isinstance(cn.get("fields"), dict) else {}
    keys = casenote_agent.GIRP_KEYS if fmt == "GIRP" else casenote_agent.SOAP_KEYS
    t["case_note"] = {
        "format": fmt,
        "fields": {k: str(fields.get(k, "") or "") for k in keys},
    }

    # reporter_flag
    rf = t.get("reporter_flag") or {}
    t["reporter_flag"] = {
        "triggered": bool(rf.get("triggered", False)),
        "category": rf.get("category", "none"),
        "confidence": float(rf.get("confidence", 0.0) or 0.0),
        "snippet": str(rf.get("snippet", "") or ""),
        "state": str(rf.get("state", "CA") or "CA"),
        "timeline_hours": int(rf.get("timeline_hours", 36) or 36),
        "draft_filing": rf.get("draft_filing"),  # may be None
        "regex_hit": bool(rf.get("regex_hit", False)),
        "llm_hit": bool(rf.get("llm_hit", False)),
    }

    # medicaid
    md = t.get("medicaid") or {}
    billable = bool(md.get("billable", False))
    units = md.get("units")
    if units is not None:
        try:
            units = int(units)
        except (TypeError, ValueError):
            units = None
    t["medicaid"] = {
        "billable": billable,
        "cpt_code": md.get("cpt_code"),
        "code_type": md.get("code_type"),
        "description": str(md.get("description", "") or ""),
        "units": units,
        "estimated_reimbursement_usd": round(
            float(md.get("estimated_reimbursement_usd", 0.0) or 0.0), 2
        ),
        "justification": str(md.get("justification", "") or ""),
    }

    # scalars
    t["student_token"] = str(t.get("student_token", "") or "")
    t["session_date"] = str(t.get("session_date", "") or date.today().isoformat())
    t["elapsed_ms"] = int(t.get("elapsed_ms", 0) or 0)
    if not isinstance(t.get("token_map"), dict):
        t["token_map"] = {}
    return t


# --------------------------------------------------------------------------- #
# Flywheel edit-capture stub (recorded on sign)                               #
# --------------------------------------------------------------------------- #


def _edit_distance(a: str, b: str) -> int:
    """Levenshtein distance — small, dependency-free; used for the flywheel
    signal (how much the human changed the draft)."""
    a, b = a or "", b or ""
    if a == b:
        return 0
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]


def capture_edit(
    artifact_type: str,
    model_used: str,
    draft: Dict[str, Any],
    final: Dict[str, Any],
    input_tokens: int = 0,
) -> Dict[str, Any]:
    """Build ONE flywheel edit-capture record (the capture, not training).

    Persistence is tokenized-only and out of scope here (SPEC: capture, don't
    train) — this returns the record the caller would store on sign.
    """
    import json as _json
    draft_s = _json.dumps(draft, sort_keys=True, ensure_ascii=False)
    final_s = _json.dumps(final, sort_keys=True, ensure_ascii=False)
    return {
        "artifact_type": artifact_type,
        "model_used": model_used,
        "draft": draft,
        "final": final,
        "edit_distance": _edit_distance(draft_s, final_s),
        "input_tokens": int(input_tokens),
    }


def record_sign(
    trinity: Dict[str, Any],
    finals: Optional[Dict[str, Dict[str, Any]]] = None,
) -> List[Dict[str, Any]]:
    """Flywheel stub: on sign, diff each drafted artifact against the social
    worker's final edited version and emit edit-capture records.

    ``finals`` maps ``{"case_note"|"reporter_flag"|"medicaid": edited_dict}``;
    any artifact the user didn't touch is captured with edit_distance 0. Returns
    the records (the demo logs them; production would enqueue for the flywheel).
    """
    finals = finals or {}
    model_by_step = {m["step"]: m["model"] for m in trinity.get("models_used", [])}
    step_for = {
        "case_note": "casenote",
        "reporter_flag": "reporter",
        "medicaid": "medicaid",
    }
    records: List[Dict[str, Any]] = []
    for artifact, step in step_for.items():
        draft = trinity.get(artifact, {})
        final = finals.get(artifact, draft)
        in_tok = next(
            (m["input_tokens"] for m in trinity.get("models_used", []) if m["step"] == step),
            0,
        )
        records.append(
            capture_edit(artifact, model_by_step.get(step, ""), draft, final, in_tok)
        )
    return records
