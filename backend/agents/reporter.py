"""Mandated-reporter sub-agent — mid tier, **temperature 0**, safety-critical.

Belt-and-suspenders: the LLM judgment is UNIONED with the hand-coded regex
keyword net (``domain.reporter_rules.regex_scan``). If EITHER fires, the flag
triggers and the UI prompts the social worker to verify. False negatives are the
worst failure; false positives are correctable.

CANRA correctness the agent must encode:
  * Suicidal ideation / self-harm -> category suicidal_ideation/self_harm,
    SAFETY-PLANNING guidance, NEVER a SCAR (not a CANRA child-abuse filing).
  * Adult DV with no child harm -> domestic_violence, non-reportable note.
  * Only child_abuse_neglect gets a draft SCAR.

``timeline_hours`` is always 36 (the §11166(a) written-report deadline). For
non-CANRA categories (e.g. SI) the field is present per the Trinity contract but
the draft text makes explicit it is NOT a CANRA timeline (safety-planning, not
CPS).

Tier-2 escalation hook: when any trigger fires and escalation is enabled (flag),
re-judge/redraft on the frontier model (step ``reporter_escalation``). Cheap when
safe, frontier when it matters. Default OFF for a deterministic, cheap demo.
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any, Dict, Optional, Tuple

import gmi

from domain import reporter_rules as R
from . import _common as C

logger = logging.getLogger("casescribe.agents.reporter")

STEP = "reporter"
ESCALATION_STEP = "reporter_escalation"
TEMPERATURE = 0.0  # safety-critical: deterministic judgment

SYSTEM = (
    "You are a California mandated-reporter screening assistant for a school "
    "social worker. The dictation is PII-scrubbed (names are tokens like "
    "[PERSON_A]). Apply CANRA precisely.\n\n"
    + R.rules_for_prompt()
    + "\n\nReturn ONLY a JSON object with keys:\n"
    "  triggered (bool): does ANY mandated-reporter or safety concern appear?\n"
    "  category (string): one of child_abuse_neglect, suicidal_ideation, "
    "self_harm, domestic_violence, title_ix, none\n"
    "  confidence (number 0..1)\n"
    "  snippet (string): the exact quoted text that triggered it (or \"\")\n"
    "  narrative (string): for child_abuse_neglect, a draft SCAR narrative for "
    "the social worker to review; for suicidal_ideation/self_harm, a brief "
    "safety-planning summary (NOT a CPS report); otherwise \"\".\n"
    "Remember: suicidal ideation and adult-only domestic violence are NOT "
    "CANRA child-abuse reports."
)


def _validate(obj: Any) -> Dict[str, Any]:
    if not isinstance(obj, dict):
        raise ValueError("reporter output is not an object")
    triggered = C.as_bool(obj.get("triggered"), False)
    category = C.as_str(obj.get("category"), R.CATEGORY_NONE).strip().lower()
    if category not in R.VALID_CATEGORIES:
        category = R.CATEGORY_NONE
    confidence = C.clamp01(C.as_float(obj.get("confidence"), 0.0))
    snippet = C.as_str(obj.get("snippet"), "")
    narrative = C.as_str(obj.get("narrative"), "")
    return {
        "triggered": triggered,
        "category": category,
        "confidence": confidence,
        "snippet": snippet,
        "narrative": narrative,
    }


def _llm_fallback() -> Dict[str, Any]:
    # Degraded LLM verdict: defer entirely to the regex net (fail safe — the net
    # can only ADD a trigger, never suppress one).
    return {
        "triggered": False,
        "category": R.CATEGORY_NONE,
        "confidence": 0.0,
        "snippet": "",
        "narrative": "",
    }


# --------------------------------------------------------------------------- #
# Draft-filing templates (deterministic scaffolds; the model fills narrative)  #
# --------------------------------------------------------------------------- #


def _scar_draft(narrative: str, snippet: str) -> str:
    body = narrative.strip() or (
        "Student disclosure and observations meet the reasonable-suspicion "
        "threshold for suspected child abuse/neglect."
    )
    return (
        "SUSPECTED CHILD ABUSE REPORT (CANRA, "
        f"{R.CANRA_CITE}; general neglect per §11165.2). DOJ form {R.DOJ_FORM}. "
        "Telephone report to county child welfare immediately / as soon as "
        f"practicable; written report due within {R.TIMELINE_HOURS} hours.\n\n"
        f"{body}\n\n"
        "NOTE (AB 2085): poverty alone is not a basis for a report. "
        "[Draft for social-worker review before submission.]"
    )


def _safety_plan_draft(narrative: str, category: str) -> str:
    label = "suicidal ideation" if category == R.CATEGORY_SI else "self-harm"
    body = narrative.strip() or (
        "Risk addressed in session via safety planning and means restriction."
    )
    return (
        "NOT A CPS REPORT. "
        f"{label.capitalize()} does not trigger a CANRA child-abuse filing "
        f"({R.CANRA_CITE}); the {R.TIMELINE_HOURS}-hour CANRA timeline does NOT "
        "apply here. Route to school suicide-prevention protocol; consider WIC "
        "§5150 / Tarasoff thresholds only if criteria are met.\n\n"
        f"{body}\n\n"
        "[Safety-planning guidance, not a mandated abuse report.]"
    )


def _dv_note() -> str:
    return (
        "NOT A CPS REPORT (per AB 2085). Adult domestic violence with no child "
        "harm is not reportable under CANRA; a child merely witnessing DV is "
        "not, by itself, neglect. File only if the child suffered or was at "
        "substantial risk of physical harm. [Review with supervisor.]"
    )


def _build_draft_filing(category: str, triggered: bool, narrative: str, snippet: str) -> Optional[str]:
    if not triggered:
        return None
    if category == R.CATEGORY_CHILD_ABUSE:
        return _scar_draft(narrative, snippet)
    if category in (R.CATEGORY_SI, R.CATEGORY_SELF_HARM):
        return _safety_plan_draft(narrative, category)
    if category == R.CATEGORY_DV:
        return _dv_note()
    # title_ix or other triggered category: generic reviewable note.
    return (
        f"FLAG ({category}). {narrative.strip() or 'Concern noted for review.'} "
        "[Draft for social-worker review.]"
    )


# --------------------------------------------------------------------------- #
# Tier-2 escalation hook (frontier) — behind a flag                            #
# --------------------------------------------------------------------------- #


def _escalation_enabled(flag: Optional[bool]) -> bool:
    if flag is not None:
        return bool(flag)
    return os.environ.get("CASESCRIBE_REPORTER_ESCALATION", "").strip().lower() in (
        "1", "true", "yes", "on",
    )


def _escalate(scrubbed_text: str, primary: Dict[str, Any]):
    """Re-judge on the frontier model when a trigger fired. Returns
    ``(merged_llm_verdict, ModelCall|None)``. Never raises."""
    system = (
        SYSTEM
        + "\n\nThis is a TIER-2 ESCALATION re-review of a flagged session. Be "
        "especially careful with the SI/self-harm and adult-DV non-triggers. "
        "Refine the category, confidence, and narrative."
    )
    user = (
        "Primary screen result:\n"
        + json.dumps({k: primary[k] for k in ("triggered", "category", "confidence", "snippet")})
        + "\n\nDictation (PII-scrubbed):\n\n"
        + scrubbed_text
    )
    try:
        out = gmi.complete(
            ESCALATION_STEP, system, user, temperature=TEMPERATURE, json_schema=True,
            max_tokens=600,
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("reporter escalation call failed: %r", exc)
        return primary, None
    content = out.get("content")
    if isinstance(content, dict):
        try:
            return _validate(content), out.get("call")
        except (ValueError, KeyError, TypeError) as exc:
            logger.warning("reporter escalation invalid output: %r", exc)
    return primary, out.get("call")


# --------------------------------------------------------------------------- #
# Public entry                                                                 #
# --------------------------------------------------------------------------- #


def check(
    scrubbed_text: str,
    classification: Optional[Dict[str, Any]] = None,
    *,
    escalate: Optional[bool] = None,
) -> Tuple[Dict[str, Any], list]:
    """Run the reporter check (LLM ∪ regex). Returns ``(reporter_flag, calls)``
    where ``calls`` is a list of ModelCall (the primary check + any escalation).
    """
    calls: list = []

    # 1) Belt: hand-coded keyword net (cannot suppress, only add a trigger).
    net = R.regex_scan(scrubbed_text)

    # 2) Suspenders: LLM judgment (T=0).
    triggers_hint = ""
    if classification and classification.get("candidate_triggers"):
        triggers_hint = (
            "\n\nClassifier candidate triggers: "
            + ", ".join(classification["candidate_triggers"])
        )
    user = f"Dictation (PII-scrubbed):{triggers_hint}\n\n{scrubbed_text}"
    llm, call = C.call_json(
        STEP, SYSTEM, user,
        temperature=TEMPERATURE,
        validate=_validate,
        fallback=_llm_fallback,
        max_tokens=700,
    )
    if call is not None:
        calls.append(call)

    llm_hit = bool(llm["triggered"])
    regex_hit = bool(net["any_hit"])

    # 3) Tier-2 escalation hook (frontier) — only when something fired & enabled.
    if (llm_hit or regex_hit) and _escalation_enabled(escalate):
        llm, esc_call = _escalate(scrubbed_text, llm)
        llm_hit = bool(llm["triggered"])
        if esc_call is not None:
            calls.append(esc_call)

    # 4) Union the two signals.
    triggered = llm_hit or regex_hit

    # Category: trust the LLM's category when IT triggered (it correctly
    # distinguishes SI from abuse, adult-DV non-triggers, etc.). Otherwise fall
    # back to the regex net's suggestion (belt catches an LLM false-negative).
    if llm_hit and llm["category"] != R.CATEGORY_NONE:
        category = llm["category"]
    elif regex_hit:
        category = net["suggested_category"]
    else:
        category = R.CATEGORY_NONE

    if not triggered:
        category = R.CATEGORY_NONE

    # Confidence: LLM's when it fired; otherwise a moderate net-only confidence.
    confidence = llm["confidence"]
    if regex_hit and not llm_hit:
        confidence = max(confidence, 0.6)
    if not triggered:
        confidence = min(confidence, 0.1)

    snippet = llm["snippet"]
    if not snippet and triggered:
        hits = net["abuse_neglect_hits"] + net["si_self_harm_hits"]
        snippet = f"keyword net matched: {', '.join(hits)}" if hits else ""

    draft_filing = _build_draft_filing(category, triggered, llm.get("narrative", ""), snippet)

    flag = {
        "triggered": triggered,
        "category": category,
        "confidence": round(C.clamp01(confidence), 3),
        "snippet": snippet,
        "state": R.STATE,
        "timeline_hours": R.TIMELINE_HOURS,
        "draft_filing": draft_filing,
        "regex_hit": regex_hit,
        "llm_hit": llm_hit,
    }
    return flag, calls
