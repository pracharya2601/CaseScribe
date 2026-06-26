"""California mandated-reporter law (CANRA) + the belt-and-suspenders regex net.

Embedded verbatim from the ``casescribe-domain`` skill. The reporter agent
combines LLM judgment with this hand-coded keyword net (T=0); if EITHER signal
trips, the corresponding ``*_hit`` flag is set and the UI prompts the social
worker to verify. False negatives are the worst failure; false positives are
correctable.

CANRA = Cal. Penal Code §§11164-11174.3. Timeline (§11166(a)): phone report
immediately / as soon as practicable, THEN a written report within **36 hours**
on DOJ form **SS 8572**. -> ``timeline_hours = 36``.
"""

from __future__ import annotations

import re
from typing import Dict, List, Tuple

TIMELINE_HOURS = 36
STATE = "CA"
DOJ_FORM = "SS 8572"
CANRA_CITE = "Cal. Penal Code §§11164-11174.3"

# Trinity ``category`` enum (platform contract).
CATEGORY_CHILD_ABUSE = "child_abuse_neglect"
CATEGORY_SI = "suicidal_ideation"
CATEGORY_SELF_HARM = "self_harm"
CATEGORY_DV = "domestic_violence"
CATEGORY_TITLE_IX = "title_ix"
CATEGORY_NONE = "none"

VALID_CATEGORIES: Tuple[str, ...] = (
    CATEGORY_CHILD_ABUSE,
    CATEGORY_SI,
    CATEGORY_SELF_HARM,
    CATEGORY_DV,
    CATEGORY_TITLE_IX,
    CATEGORY_NONE,
)

# Categories that REQUIRE a CANRA child-abuse report (-> child_abuse_neglect):
#   physical abuse (§§11165.3/.6), sexual abuse (§11165.1), neglect severe+general
#   (§11165.2), willful cruelty / unjustifiable punishment (§11165.3), abuse in
#   out-of-home care (§11165.5). These are the only categories that get a SCAR.
CANRA_REPORTABLE = {CATEGORY_CHILD_ABUSE}

# CRITICAL non-triggers — the agent MUST get these right:
#   * Suicidal ideation / self-harm -> NOT a CANRA report. Triggers school
#     suicide-prevention protocol / WIC §5150 / (clinicians) Tarasoff. Surface
#     SAFETY-PLANNING language, never a SCAR.
#   * Adult domestic violence with no child harm -> NOT reportable. A child
#     merely WITNESSING DV is not, by itself, neglect (AB 2085; which also
#     excludes conditions caused by POVERTY ALONE). Report only if the child
#     suffered or was at substantial risk of physical harm.
NON_CANRA = {CATEGORY_SI, CATEGORY_SELF_HARM, CATEGORY_DV}


def is_canra_reportable(category: str) -> bool:
    """True only for categories that get a CANRA/SCAR child-abuse filing."""
    return category in CANRA_REPORTABLE


# --------------------------------------------------------------------------- #
# Regex / keyword safety net (verbatim keyword lists from the skill)          #
# --------------------------------------------------------------------------- #

# Abuse / neglect triggers -> child_abuse_neglect.
ABUSE_NEGLECT_KEYWORDS: List[str] = [
    "hit", "bruise", "welt", "burn", "left alone", "no food", "missed meals",
    "inappropriate touch", "disclosed", "hungry", "unsupervised",
]

# SI / self-harm triggers -> safety plan, NOT CPS.
SI_SELF_HARM_KEYWORDS: List[str] = [
    "kill myself", "suicid", "end it", "cut myself", "self-harm",
    "don't want to be here",
]


def _compile(keywords: List[str]) -> List[Tuple[str, "re.Pattern[str]"]]:
    out: List[Tuple[str, re.Pattern[str]]] = []
    for kw in keywords:
        # Word-ish boundary that tolerates apostrophes / hyphens in the keyword.
        pat = re.compile(re.escape(kw), re.IGNORECASE)
        out.append((kw, pat))
    return out


_ABUSE_PATTERNS = _compile(ABUSE_NEGLECT_KEYWORDS)
_SI_PATTERNS = _compile(SI_SELF_HARM_KEYWORDS)


def _scan(text: str, patterns) -> List[str]:
    hits: List[str] = []
    for kw, pat in patterns:
        if pat.search(text):
            hits.append(kw)
    return hits


def regex_scan(text: str) -> Dict[str, object]:
    """Run the keyword net over the (scrubbed) dictation.

    Returns:
        {
          "abuse_neglect_hits": [...],  # matched abuse/neglect keywords
          "si_self_harm_hits": [...],   # matched SI/self-harm keywords
          "abuse_hit": bool,
          "si_hit": bool,
          "any_hit": bool,
          "suggested_category": "child_abuse_neglect" | "suicidal_ideation" | "none",
        }

    Abuse/neglect outranks SI for the suggested category only when BOTH fire and
    abuse keywords are present (a child-abuse report is the higher-stakes duty);
    the reporter agent still records both hit lists so nothing is masked.
    """
    text = text or ""
    abuse = _scan(text, _ABUSE_PATTERNS)
    si = _scan(text, _SI_PATTERNS)

    if abuse:
        suggested = CATEGORY_CHILD_ABUSE
    elif si:
        suggested = CATEGORY_SI
    else:
        suggested = CATEGORY_NONE

    return {
        "abuse_neglect_hits": abuse,
        "si_self_harm_hits": si,
        "abuse_hit": bool(abuse),
        "si_hit": bool(si),
        "any_hit": bool(abuse or si),
        "suggested_category": suggested,
    }


def rules_for_prompt() -> str:
    """Compact rules summary injected into the reporter agent's system prompt."""
    return (
        f"California CANRA ({CANRA_CITE}). Written report within {TIMELINE_HOURS} "
        f"hours on DOJ form {DOJ_FORM} after an immediate phone report.\n"
        "REQUIRES a report (category=child_abuse_neglect): physical abuse, sexual "
        "abuse/exploitation, neglect (severe+general), willful cruelty / "
        "unjustifiable punishment, abuse in out-of-home care.\n"
        "CRITICAL NON-TRIGGERS:\n"
        " - Suicidal ideation / self-harm is NOT a CANRA report (category="
        "suicidal_ideation or self_harm). Route to suicide-prevention protocol / "
        "WIC §5150 / Tarasoff and surface SAFETY-PLANNING language. NO SCAR.\n"
        " - Adult domestic violence with no child harm is NOT reportable "
        "(category=domestic_violence). A child merely witnessing DV is not, by "
        "itself, neglect (AB 2085). Poverty alone is never a basis (AB 2085).\n"
        "Report ONLY on reasonable suspicion in professional capacity."
    )


if __name__ == "__main__":  # pragma: no cover
    r = regex_scan("he hasn't eaten, says he is hungry, left alone after school")
    assert r["abuse_hit"] and r["suggested_category"] == CATEGORY_CHILD_ABUSE, r
    r2 = regex_scan("he said he doesn't want to be here and suicide prevention")
    assert r2["si_hit"] and r2["suggested_category"] == CATEGORY_SI, r2
    r3 = regex_scan("good session, zones of regulation, no safety concerns")
    assert not r3["any_hit"], r3
    assert is_canra_reportable(CATEGORY_CHILD_ABUSE)
    assert not is_canra_reportable(CATEGORY_SI)
    print("reporter_rules self-test OK")
