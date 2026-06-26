"""School-Medicaid CPT/HCPCS code table — embedded verbatim from the
``casescribe-domain`` skill, with the unit semantics encoded as code (not prose)
so the Medicaid coder's math is enforced by the platform, not trusted to the LLM.

Rates are the **CYBHI Statewide Multi-Payer Fee Schedule, CY2025** (the right
benchmark for a CA school visit). LEA-BOP itself is cost-reconciled (no flat
table) — we cite CYBHI rates and label them "est. CY2025".

Unit logic (the Medicaid coder MUST encode this — the spec's blanket
"15-minute units" is WRONG for the psychotherapy codes):

* **90832 / 90834 / 90837 are time-banded per-encounter** — pick the code by
  session length; ``units`` is ``None`` (i.e. 1 encounter), NOT minutes÷15.
* **H2027 / T1017 / H0036 are per-15-minute** — ``units = ceil(minutes / 15)``,
  reimbursement = ``units × rate``.
* All CYBHI claims require modifiers (U4 on all; HA/HQ on H2027). Roadmap detail
  — not blocked on for the demo.
* Non-billable cases (e.g. crisis-only session, no formal therapy) →
  ``billable: false``, no code.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Dict, List, Optional

# UNVERIFIED rates are marked so the demo never claims a number it can't defend.
RATE_UNVERIFIED = None


@dataclass(frozen=True)
class CodeEntry:
    code: str
    code_type: str          # "CPT" | "HCPCS"
    description: str
    unit: str               # human-readable unit semantics
    # Billing model:
    #   "per_15_min"          -> units = ceil(minutes/15); reimb = units * rate
    #   "time_banded"         -> one encounter; units = None; rate fixed by band
    #   "per_first_hour"      -> one encounter; units = None
    billing_model: str
    rate: Optional[float]               # individual / default rate
    group_rate: Optional[float] = None  # only where a distinct group rate exists
    # For time-banded codes, the inclusive minute band [lo, hi]; hi None = open.
    band_min: Optional[int] = None
    band_max: Optional[int] = None


# --------------------------------------------------------------------------- #
# The table (verbatim from the domain skill)                                  #
# --------------------------------------------------------------------------- #

CODE_TABLE: Dict[str, CodeEntry] = {
    "H2027": CodeEntry(
        code="H2027",
        code_type="HCPCS",
        description="Psychoeducation / health behavior intervention (HA=indiv, HQ=group)",
        unit="per 15 min",
        billing_model="per_15_min",
        rate=20.11,        # individual
        group_rate=8.04,   # group
    ),
    "T1017": CodeEntry(
        code="T1017",
        code_type="HCPCS",
        description="Targeted Case Management",
        unit="per 15 min",
        billing_model="per_15_min",
        rate=21.34,
    ),
    "90832": CodeEntry(
        code="90832",
        code_type="CPT",
        description="Individual psychotherapy, 16-37 min",
        unit="per encounter (time-banded)",
        billing_model="time_banded",
        rate=67.83,
        band_min=16,
        band_max=37,
    ),
    "90834": CodeEntry(
        code="90834",
        code_type="CPT",
        description="Individual psychotherapy, 38-52 min",
        unit="per encounter (time-banded)",
        billing_model="time_banded",
        rate=89.64,
        band_min=38,
        band_max=52,
    ),
    "90837": CodeEntry(
        code="90837",
        code_type="CPT",
        description="Individual psychotherapy, 53+ min",
        unit="per encounter (time-banded)",
        billing_model="time_banded",
        rate=131.97,
        band_min=53,
        band_max=None,
    ),
    "96112": CodeEntry(
        code="96112",
        code_type="CPT",
        description="Developmental test administration, first hour",
        unit="per first hour",
        billing_model="per_first_hour",
        rate=RATE_UNVERIFIED,   # CA school rate UNVERIFIED (~$125 Medicare)
    ),
    "H0036": CodeEntry(
        code="H0036",
        code_type="HCPCS",
        description="Community psychiatric supportive treatment (CPST)",
        unit="per 15 min",
        billing_model="per_15_min",
        rate=RATE_UNVERIFIED,   # CA rate UNVERIFIED (state-set)
    ),
}

# Valid code set the Medicaid coder may SELECT from (it never invents codes).
VALID_CODES: List[str] = list(CODE_TABLE.keys())

# Time-banded psychotherapy codes, ordered by band for length-based selection.
TIME_BANDED_CODES: List[str] = ["90832", "90834", "90837"]


# --------------------------------------------------------------------------- #
# Selection + unit math helpers (the enforced "coder MUST encode" logic)      #
# --------------------------------------------------------------------------- #


def select_time_banded(minutes: float) -> Optional[str]:
    """Pick the time-banded psychotherapy code (90832/34/37) for a duration.

    Returns ``None`` for a duration below the 90832 floor (16 min) — too short
    to bill as individual psychotherapy.
    """
    if minutes is None:
        return None
    m = float(minutes)
    if m < 16:
        return None
    for code in TIME_BANDED_CODES:
        e = CODE_TABLE[code]
        lo = e.band_min if e.band_min is not None else 0
        hi = e.band_max if e.band_max is not None else math.inf
        if lo <= m <= hi:
            return code
    return None


def units_for(code: str, minutes: Optional[float]) -> Optional[int]:
    """Unit count per the code's billing model.

    * per_15_min  -> ceil(minutes / 15)  (min 1 if any time recorded)
    * time_banded -> None  (one encounter; NOT minutes/15)
    * per_first_hour -> None
    """
    entry = CODE_TABLE.get(code)
    if entry is None:
        return None
    if entry.billing_model == "per_15_min":
        if not minutes or minutes <= 0:
            return None
        return max(1, math.ceil(float(minutes) / 15.0))
    return None  # time_banded / per_first_hour bill as a single encounter


def reimbursement_for(
    code: str,
    minutes: Optional[float],
    *,
    group: bool = False,
) -> Optional[float]:
    """Estimated reimbursement (USD) for a code given duration.

    * per_15_min  -> units × rate  (group rate when ``group``)
    * time_banded -> the band's flat encounter rate
    Returns ``None`` when the rate is UNVERIFIED (so we never fabricate a $).
    """
    entry = CODE_TABLE.get(code)
    if entry is None:
        return None

    rate = entry.group_rate if (group and entry.group_rate is not None) else entry.rate
    if rate is None:
        return None  # UNVERIFIED rate — don't invent a number

    if entry.billing_model == "per_15_min":
        u = units_for(code, minutes)
        if not u:
            return None
        return round(u * rate, 2)

    # time_banded / per_first_hour: flat per-encounter rate
    return round(rate, 2)


def price_session(
    code: Optional[str],
    minutes: Optional[float],
    *,
    group: bool = False,
) -> Dict[str, object]:
    """One call the Medicaid agent uses: resolve units + reimbursement + the
    canonical description/type for a selected code. Enforces the unit math so a
    mis-counting model can't produce a wrong invoice.

    Returns a dict with ``code_type``, ``description``, ``units``,
    ``estimated_reimbursement_usd``, and ``billing_model``. ``code is None`` or
    an unknown code yields the non-billable shape.
    """
    if not code or code not in CODE_TABLE:
        return {
            "code_type": None,
            "description": None,
            "units": None,
            "estimated_reimbursement_usd": 0.0,
            "billing_model": None,
        }
    entry = CODE_TABLE[code]
    desc = entry.description
    if code == "H2027":
        desc = (
            "Psychoeducation / health behavior intervention, "
            + ("group (HQ)" if group else "individual (HA)")
        )
    reimb = reimbursement_for(code, minutes, group=group)
    return {
        "code_type": entry.code_type,
        "description": desc,
        "units": units_for(code, minutes),
        "estimated_reimbursement_usd": 0.0 if reimb is None else reimb,
        "billing_model": entry.billing_model,
    }


def table_for_prompt() -> str:
    """Compact, model-facing rendering of the table for the coder's prompt."""
    lines = ["code | type | description | unit | est_rate_cy2025"]
    for e in CODE_TABLE.values():
        if e.billing_model == "per_15_min" and e.group_rate is not None:
            rate = f"${e.rate:.2f} indiv / ${e.group_rate:.2f} group"
        elif e.rate is not None:
            rate = f"${e.rate:.2f}"
        else:
            rate = "UNVERIFIED"
        lines.append(f"{e.code} | {e.code_type} | {e.description} | {e.unit} | {rate}")
    return "\n".join(lines)


if __name__ == "__main__":  # pragma: no cover - quick sanity
    assert select_time_banded(45) == "90834"
    assert select_time_banded(30) == "90832"
    assert select_time_banded(60) == "90837"
    assert select_time_banded(10) is None
    assert units_for("H2027", 30) == 2
    assert units_for("90834", 45) is None
    assert reimbursement_for("H2027", 30) == round(2 * 20.11, 2)
    assert reimbursement_for("H2027", 30, group=True) == round(2 * 8.04, 2)
    assert reimbursement_for("90834", 45) == 89.64
    print("cpt_table self-test OK")
    print(table_for_prompt())
