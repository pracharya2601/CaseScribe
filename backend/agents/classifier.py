"""Classifier sub-agent — cheap/fast triage (Nemotron Nano tier).

Runs FIRST. Its small structured output feeds the reporter, medicaid, and
casenote agents, so the expensive agents don't each re-derive session metadata.

Output (internal classification shape — not a Trinity sub-shape directly):
    {
      "session_type": "individual|group|crisis|intake|consultation",
      "note_format": "SOAP|GIRP",
      "modality": "CBT|MI|SFBT|psychoeducation|case_management|mixed|crisis",
      "duration_minutes": int,
      "candidate_triggers": [str, ...],   # hints for the reporter check
    }
"""

from __future__ import annotations

from typing import Any, Dict, List

from . import _common as C

STEP = "classifier"
TEMPERATURE = 0.2  # cheap triage; a little latitude is fine

_SESSION_TYPES = {"individual", "group", "crisis", "intake", "consultation"}
_FORMATS = {"SOAP", "GIRP"}

SYSTEM = (
    "You are a fast clinical-session TRIAGE classifier for a school social "
    "worker's dictation. The text is PII-scrubbed (names appear as tokens like "
    "[PERSON_A]). Decide, tersely and structurally:\n"
    " - session_type: individual | group | crisis | intake | consultation\n"
    " - note_format: SOAP for clinical/therapy/crisis sessions; GIRP for IEP / "
    "case-management / goal-tracking sessions\n"
    " - modality: CBT | MI | SFBT | psychoeducation | case_management | crisis | "
    "mixed\n"
    " - duration_minutes: integer estimate of face-to-face minutes\n"
    " - candidate_triggers: short phrases that MIGHT indicate a mandated-reporter "
    "concern (abuse, neglect, supervision, suicidal ideation, self-harm); empty "
    "list if none.\n"
    "Reply with ONLY a JSON object with exactly these keys. No prose."
)


def _validate(obj: Any) -> Dict[str, Any]:
    if not isinstance(obj, dict):
        raise ValueError("classifier output is not an object")

    session_type = C.as_str(obj.get("session_type"), "individual").strip().lower()
    if session_type not in _SESSION_TYPES:
        session_type = "individual"

    note_format = C.as_str(obj.get("note_format"), "SOAP").strip().upper()
    if note_format not in _FORMATS:
        note_format = "SOAP"

    modality = C.as_str(obj.get("modality"), "mixed").strip()

    duration = C.as_int(obj.get("duration_minutes"), None)
    if duration is None or duration <= 0:
        duration = 30  # sane default the coder can still bill

    raw_triggers = obj.get("candidate_triggers", [])
    triggers: List[str] = []
    if isinstance(raw_triggers, list):
        triggers = [C.as_str(t).strip() for t in raw_triggers if C.as_str(t).strip()]
    elif isinstance(raw_triggers, str) and raw_triggers.strip():
        triggers = [raw_triggers.strip()]

    return {
        "session_type": session_type,
        "note_format": note_format,
        "modality": modality,
        "duration_minutes": duration,
        "candidate_triggers": triggers,
    }


def _fallback() -> Dict[str, Any]:
    # Safe, neutral triage so downstream agents still have something to work on.
    return {
        "session_type": "individual",
        "note_format": "SOAP",
        "modality": "mixed",
        "duration_minutes": 30,
        "candidate_triggers": [],
    }


def classify(scrubbed_text: str):
    """Run the classifier. Returns ``(classification_dict, ModelCall)``."""
    user = f"Dictation (PII-scrubbed):\n\n{scrubbed_text}"
    return C.call_json(
        STEP,
        SYSTEM,
        user,
        temperature=TEMPERATURE,
        validate=_validate,
        fallback=_fallback,
        max_tokens=300,
    )
