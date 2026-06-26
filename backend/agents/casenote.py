"""Case-note drafter sub-agent — frontier (Claude Sonnet 4.6).

The one justified frontier spend: this is the artifact the social worker reads
first and signs, so clinical-language quality matters most. Output is short
(1-3 sentences per field) but must read like a real LCSW wrote it —
trauma-informed, strengths-based, framework-aware.

Inputs: the scrubbed dictation, the classifier's decisions, AND the reporter
flag — so the risk language in the note stays consistent with the flag (if the
flag is triggered, the assessment must reflect that, not contradict it).

Format handling (reconciliation 4a): SOAP -> subjective/objective/assessment/
plan; GIRP -> literal goal/intervention/response/plan keys inside fields.
"""

from __future__ import annotations

from typing import Any, Dict, Optional

from . import _common as C

STEP = "casenote"
TEMPERATURE = 0.3

SOAP_KEYS = ("subjective", "objective", "assessment", "plan")
GIRP_KEYS = ("goal", "intervention", "response", "plan")

_SYSTEM_BASE = (
    "You are an experienced California school LCSW writing a clinical case note "
    "from a PII-scrubbed dictation. Names appear as tokens like [PERSON_A]; KEEP "
    "the tokens verbatim — never invent or restore names. Write concise, "
    "trauma-informed, strengths-based prose (1-3 sentences per field), aware of "
    "frameworks (CBT, MI, ACEs, attachment) where relevant. Do not fabricate "
    "facts not present in the dictation."
)


def _system(fmt: str, flag: Dict[str, Any]) -> str:
    if fmt == "GIRP":
        keys_line = (
            "Write a GIRP note. Return ONLY a JSON object: "
            '{"format":"GIRP","fields":{"goal":"...","intervention":"...",'
            '"response":"...","plan":"..."}}.'
        )
    else:
        keys_line = (
            "Write a SOAP note. Return ONLY a JSON object: "
            '{"format":"SOAP","fields":{"subjective":"...","objective":"...",'
            '"assessment":"...","plan":"..."}}.'
        )

    risk = ""
    if flag and flag.get("triggered"):
        cat = flag.get("category")
        if cat == "child_abuse_neglect":
            risk = (
                "\n\nA mandated CHILD ABUSE/NEGLECT report has been flagged. The "
                "assessment/response MUST reflect that the reasonable-suspicion "
                "threshold was met and the plan must reference filing the "
                "mandated report. Do not contradict the flag."
            )
        elif cat in ("suicidal_ideation", "self_harm"):
            risk = (
                "\n\nA SUICIDE-RISK concern was flagged. The note MUST reflect "
                "risk assessment and SAFETY PLANNING (means restriction, support "
                "contacts, 988). Make explicit this is suicide-prevention "
                "handling, NOT a child-abuse/CPS report. If the session was "
                "crisis stabilization only, say no formal therapy was delivered."
            )
        elif cat == "domestic_violence":
            risk = (
                "\n\nAdult domestic violence was noted but is NOT a CANRA report "
                "absent child harm; reflect that framing."
            )
    return _SYSTEM_BASE + "\n\n" + keys_line + risk


def _validate_factory(fmt: str):
    keys = GIRP_KEYS if fmt == "GIRP" else SOAP_KEYS

    def _validate(obj: Any) -> Dict[str, Any]:
        if not isinstance(obj, dict):
            raise ValueError("casenote output is not an object")
        fields_obj = obj.get("fields")
        if not isinstance(fields_obj, dict):
            # Some models flatten the keys to the top level — recover them.
            fields_obj = {k: obj.get(k) for k in keys if k in obj}
        if not isinstance(fields_obj, dict) or not fields_obj:
            raise ValueError("casenote has no usable fields")
        fields = {k: C.as_str(fields_obj.get(k), "").strip() for k in keys}
        if not any(fields.values()):
            raise ValueError("casenote fields are all empty")
        return {"format": fmt, "fields": fields}

    return _validate


def _fallback_factory(fmt: str):
    keys = GIRP_KEYS if fmt == "GIRP" else SOAP_KEYS

    def _fallback() -> Dict[str, Any]:
        return {
            "format": fmt,
            "fields": {
                k: "[case note unavailable — model output could not be parsed; "
                   "please draft manually]"
                for k in keys
            },
        }

    return _fallback


def draft(
    scrubbed_text: str,
    classification: Optional[Dict[str, Any]],
    reporter_flag: Dict[str, Any],
):
    """Draft the case note. Returns ``(case_note_subshape, ModelCall)``.

    Waits on the reporter flag so risk language is consistent.
    """
    fmt = "SOAP"
    if classification and classification.get("note_format") in ("SOAP", "GIRP"):
        fmt = classification["note_format"]

    meta = ""
    if classification:
        meta = (
            f"\n\nClassifier: type={classification.get('session_type')}, "
            f"modality={classification.get('modality')}, "
            f"duration≈{classification.get('duration_minutes')} min, "
            f"format={fmt}."
        )
    flag_line = (
        f"\nReporter flag: triggered={reporter_flag.get('triggered')}, "
        f"category={reporter_flag.get('category')}."
    )

    user = f"Dictation (PII-scrubbed):{meta}{flag_line}\n\n{scrubbed_text}"

    return C.call_json(
        STEP,
        _system(fmt, reporter_flag),
        user,
        temperature=TEMPERATURE,
        validate=_validate_factory(fmt),
        fallback=_fallback_factory(fmt),
        max_tokens=900,
    )
