"""Medicaid coder sub-agent — code-strong mid tier (Qwen3-Coder).

CPT/HCPCS assignment is a structured lookup-with-judgment task. The model
SELECTS a code from the embedded table (``domain.cpt_table``) and judges
billable vs non-billable; the platform then enforces the UNIT MATH and
reimbursement so a mis-counting model can never emit a wrong invoice:

  * 90832/90834/90837 time-banded per-encounter -> units = None (1 encounter).
  * H2027/T1017/H0036 per-15-min            -> units = ceil(minutes/15).
  * Non-billable (e.g. crisis-only)         -> billable False, no code.
"""

from __future__ import annotations

from typing import Any, Dict, Optional

from domain import cpt_table as T
from . import _common as C

STEP = "medicaid"
TEMPERATURE = 0.1  # near-deterministic structured selection

SYSTEM = (
    "You are a California school-Medicaid (LEA-BOP) billing coder. The dictation "
    "is PII-scrubbed. SELECT the single best billing code from THIS table "
    "(never invent a code):\n\n"
    + T.table_for_prompt()
    + "\n\nRules:\n"
    " - Individual psychotherapy is time-banded: 90832 (16-37 min), 90834 "
    "(38-52), 90837 (53+). Pick by session length.\n"
    " - Psychoeducation / skills teaching toward an IEP goal (not psychotherapy) "
    "-> H2027 (per 15 min). Case management -> T1017 (per 15 min).\n"
    " - A crisis-stabilization / safety-planning session with NO formal therapy "
    "or psychoeducational service is NON-billable: billable=false, cpt_code=null.\n\n"
    "Return ONLY a JSON object with keys:\n"
    "  billable (bool)\n"
    "  cpt_code (string or null) — one of the table codes\n"
    "  group (bool) — true only for a group service (affects H2027 rate)\n"
    "  duration_minutes (integer) — face-to-face minutes\n"
    "  justification (string) — billing rationale; cite the code + unit logic.\n"
    "Do NOT compute units or dollars yourself; just pick the code and duration."
)


def _validate(obj: Any) -> Dict[str, Any]:
    if not isinstance(obj, dict):
        raise ValueError("medicaid output is not an object")
    billable = C.as_bool(obj.get("billable"), False)
    code = obj.get("cpt_code")
    code = code.strip().upper() if isinstance(code, str) and code.strip() else None
    group = C.as_bool(obj.get("group"), False)
    minutes = C.as_int(obj.get("duration_minutes"), None)
    justification = C.as_str(obj.get("justification"), "")
    return {
        "billable": billable,
        "cpt_code": code,
        "group": group,
        "duration_minutes": minutes,
        "justification": justification,
    }


def _non_billable(justification: str = "") -> Dict[str, Any]:
    return {
        "billable": False,
        "cpt_code": None,
        "code_type": None,
        "description": (
            "Crisis stabilization / safety planning — no formal therapy"
        ),
        "units": None,
        "estimated_reimbursement_usd": 0.0,
        "justification": justification or (
            "No formal psychotherapy or psychoeducational service delivered; "
            "non-billable. No code selected."
        ),
    }


def _assemble(raw: Dict[str, Any], default_minutes: Optional[int]) -> Dict[str, Any]:
    """Turn the model's selection into the Trinity medicaid sub-shape with the
    enforced unit math."""
    if not raw["billable"]:
        return _non_billable(raw.get("justification", ""))

    minutes = raw["duration_minutes"] or default_minutes or 30
    code = raw["cpt_code"]

    # If the model picked an invalid/empty code but called it billable, try to
    # recover an individual-psychotherapy code from the duration; else degrade.
    if code not in T.CODE_TABLE:
        recovered = T.select_time_banded(minutes)
        if recovered is None:
            return _non_billable(
                "Model marked billable but selected no valid code and duration "
                "is below the psychotherapy floor; defaulting to non-billable."
            )
        code = recovered

    priced = T.price_session(code, minutes, group=raw["group"])
    reimb = priced["estimated_reimbursement_usd"]

    justification = raw["justification"] or (
        f"{minutes}-min encounter -> {code}. "
        + (
            "Time-banded per-encounter code; units=1/null, not minutes/15."
            if T.CODE_TABLE[code].billing_model == "time_banded"
            else f"Per-15-min code; units = ceil({minutes}/15) = {priced['units']}."
        )
        + " Est. CY2025 CYBHI Statewide Multi-Payer rate. Append U4 "
        "(and applicable LEA/HA/HQ) modifiers at submission."
    )

    return {
        "billable": True,
        "cpt_code": code,
        "code_type": priced["code_type"],
        "description": priced["description"],
        "units": priced["units"],
        "estimated_reimbursement_usd": reimb,
        "justification": justification,
    }


def code(
    scrubbed_text: str,
    classification: Optional[Dict[str, Any]] = None,
):
    """Run the Medicaid coder. Returns ``(medicaid_subshape, ModelCall)``."""
    default_minutes = None
    hint = ""
    if classification:
        default_minutes = classification.get("duration_minutes")
        st = classification.get("session_type")
        mod = classification.get("modality")
        hint = f"\n\nClassifier: session_type={st}, modality={mod}, duration≈{default_minutes} min."

    user = f"Dictation (PII-scrubbed):{hint}\n\n{scrubbed_text}"

    raw, call = C.call_json(
        STEP, SYSTEM, user,
        temperature=TEMPERATURE,
        validate=_validate,
        fallback=lambda: {
            "billable": False, "cpt_code": None, "group": False,
            "duration_minutes": default_minutes, "justification": "",
        },
        max_tokens=400,
    )
    return _assemble(raw, default_minutes), call
