"""CaseScribe demo scenarios.

Three pre-canned dictations + their expected Trinity outcomes. Used two ways:

  1. Demo warm-up — run each once before stage time so the first live demo
     isn't a cold start (SPEC.md s11).
  2. Pipeline fixtures — `expected` documents the intended Trinity so the
     pipeline / regex safety net can be sanity-checked against known-good output.

Authoritative sources for the `expected` blocks:
  - Reporter law / SCAR timeline: casescribe-domain skill (CANRA, Penal Code
    ss11164-11174.3; written report within 36h on DOJ form SS 8572).
  - Code table + unit logic: casescribe-domain skill (CYBHI Statewide
    Multi-Payer Fee Schedule, CY2025, "est.").
  - Trinity shape: casescribe-platform skill.

PII note: every name, phone, address, DOB and ID below is OBVIOUSLY synthetic
on purpose, so the Presidio scrubbing layer (backend/pii.py) has something to
catch on stage. None of this is a real person.
"""

# ---------------------------------------------------------------------------
# Scenario 1 — Tier-1 concern, possible neglect
#   parent substance use + student distress + missed meals
#   -> child_abuse_neglect, timeline_hours=36, draft SCAR, billable
# ---------------------------------------------------------------------------
NEGLECT = {
    "id": "neglect",
    "label": "Possible neglect (Tier-1 concern)",
    "dictation": (
        "ok this is for Marcus Bellweather-Quigley, fourth grade, Lincoln "
        "Meadows Elementary, DOB uh 3/14/2016, student ID LMES-00417. came to "
        "my office third period self-referred says his stomach hurts but I "
        "think he's hungry, told me he hasn't had breakfast since like Tuesday "
        "and last night there was no dinner again, said mom Tina Bellweather "
        "was quote sleeping and wouldn't wake up unquote, this is the third "
        "time in two weeks. flat affect, kid's exhausted, fell asleep at the "
        "table in art per Ms Okonkwo. he mentioned theres beer cans and quote "
        "the orange bottles unquote all over the kitchen and mom's boyfriend "
        "Dwayne keeps quote weird hours unquote, Marcus is watching his little "
        "sister Lily who's 3 by himself after school, that's the part that "
        "gets me, no adult home til late. mom's cell is 555-0142 i think, they "
        "live over on 88 Sycamore Court apt 6. did some grounding with him, "
        "gave him crackers from my drawer. -- oh also separate note remind me "
        "to email about Priya's reassessment that's unrelated. back to Marcus, "
        "spent good chunk of the period with him maybe 45 min, worked on the "
        "stomachache the worry the whole thing. gonna need to call this one in "
        "I think, parent substance use plus the supervision plus missed meals, "
        "yeah. session was at Lincoln Meadows today."
    ),
    "expected": {
        "student_token": "[PERSON_A]",  # Marcus Bellweather-Quigley
        "case_note": {
            "format": "SOAP",
            "fields": {
                "subjective": (
                    "Self-referred student reports abdominal pain; on interview "
                    "describes not having eaten breakfast since ~Tuesday and no "
                    "dinner the prior night. States caregiver was 'sleeping and "
                    "wouldn't wake up'; reports third such occurrence in two "
                    "weeks. Reports beer cans and 'orange bottles' in the home "
                    "and that he supervises a 3-year-old sibling alone after "
                    "school until a caregiver returns late."
                ),
                "objective": (
                    "Flat affect, appears fatigued; staff report student fell "
                    "asleep during class earlier today. No visible injuries "
                    "observed. ~45-minute individual session."
                ),
                "assessment": (
                    "Presentation consistent with food insecurity and possible "
                    "general neglect / inadequate supervision in the context of "
                    "suspected caregiver substance use. Meets reasonable-"
                    "suspicion threshold for a mandated report. Somatic "
                    "complaints likely stress-linked."
                ),
                "plan": (
                    "Provided food and grounding/coping support in session. "
                    "File mandated report (see reporter flag). Coordinate with "
                    "school nurse and connect family to food resources. Continue "
                    "weekly individual check-ins."
                ),
            },
        },
        "reporter_flag": {
            "triggered": True,
            "category": "child_abuse_neglect",
            "confidence": 0.86,
            "snippet": (
                "hasn't had breakfast since like Tuesday and last night there "
                "was no dinner again ... watching his little sister Lily who's "
                "3 by himself after school"
            ),
            "state": "CA",
            "timeline_hours": 36,
            "draft_filing": (
                "SUSPECTED CHILD ABUSE REPORT (CANRA, Cal. Penal Code "
                "ss11164-11174.3; general neglect per ss11165.2). DOJ form "
                "SS 8572. Telephone report to county child welfare to be placed "
                "immediately / as soon as practicable; written report due within "
                "36 hours.\n\n"
                "Reporting party: [PERSON_REPORTER], school social worker, "
                "[ORG_SCHOOL]. Reported in professional capacity.\n\n"
                "Victim: [PERSON_A], age 9, [ORG_SCHOOL]. Narrative: Student "
                "self-referred with somatic complaints and disclosed recurrent "
                "lack of meals (no breakfast since ~Tuesday, no dinner prior "
                "night), third such episode in ~two weeks. Disclosed caregiver "
                "[PERSON_B] was unrousable ('sleeping and wouldn't wake up'); "
                "described alcohol and unidentified 'orange bottles' (possible "
                "medication) accessible in the home and an adult [PERSON_C] "
                "keeping irregular hours. Student reports being left to "
                "supervise a 3-year-old sibling [PERSON_D] alone after school "
                "until late. Concerns: general neglect, inadequate supervision, "
                "and suspected caregiver substance use. NOTE: per AB 2085, "
                "poverty alone is not a basis; this report rests on lack of "
                "supervision and caregiver impairment, not economic status "
                "alone.\n\n"
                "Observations: flat affect, fatigue, fell asleep in class; no "
                "visible injuries. Reporter has not contacted the family prior "
                "to filing. [Draft for social-worker review before submission.]"
            ),
            "regex_hit": True,   # "no dinner", "hasn't had breakfast" ~ missed meals; supervision
            "llm_hit": True,
        },
        "medicaid": {
            "billable": True,
            "cpt_code": "90834",
            "code_type": "CPT",
            "description": "Individual psychotherapy, 38-52 min",
            "units": None,  # time-banded per-encounter; NOT minutes/15
            "estimated_reimbursement_usd": 89.64,
            "justification": (
                "~45-minute individual psychotherapy encounter (somatic/anxiety "
                "focus, coping work) falls in the 38-52 min band -> 90834. "
                "Time-banded per-encounter code: units=1/null, not minutes/15. "
                "Est. CY2025 CYBHI Statewide Multi-Payer rate $89.64. Append U4 "
                "(and applicable LEA modifiers) at submission."
            ),
        },
    },
}

# ---------------------------------------------------------------------------
# Scenario 2 — Routine IEP check-in
#   calm emotional-regulation session -> NO flag, billable w/ unit math
#   H2027 psychoeducation, 30 min individual -> units=ceil(30/15)=2
# ---------------------------------------------------------------------------
IEP_CHECKIN = {
    "id": "iep_checkin",
    "label": "Routine IEP check-in (emotional regulation)",
    "dictation": (
        "weekly IEP counseling check-in, this is Aanya Featherstone-Park, "
        "seventh grade, Rosewood Junction Middle, student ID RJMS-21188. goal "
        "is emotional regulation, the IEP counseling minutes 30 a week. good "
        "session honestly, she's been using the zones of regulation chart, "
        "showed me she logged two times this week she felt herself going to "
        "the red zone before a math test and used the box breathing instead of "
        "walking out, that's huge, last quarter she was eloping like twice a "
        "week. we practiced the 4-7-8 breathing, did a feelings check-in she "
        "rated herself a 3 out of 5 calm. no safety concerns at all, no flags "
        "here, just steady progress on the reg goal. -- side thing her case "
        "manager is Mr Halloran wants the progress note by Friday, his email "
        "is r.halloran at rosewood dot k12 dot example. full 30 minutes "
        "individual, pull-out in my office. next week keep building the "
        "pre-test routine. that's it for Aanya."
    ),
    "expected": {
        "student_token": "[PERSON_A]",  # Aanya Featherstone-Park
        "case_note": {
            "format": "GIRP",
            "fields": {
                # GIRP mapped onto the shared SOAP-shaped fields dict:
                # goal/intervention/response/plan
                "subjective": (
                    "GOAL: IEP counseling goal — emotional regulation; reduce "
                    "elopement and build self-regulation strategies."
                ),
                "objective": (
                    "INTERVENTION: 30-min individual pull-out. Reviewed Zones of "
                    "Regulation tracking; practiced 4-7-8 / box breathing; "
                    "completed a feelings check-in."
                ),
                "assessment": (
                    "RESPONSE: Student self-reported two instances of using "
                    "breathing to de-escalate before testing rather than "
                    "eloping; rated self 3/5 on calm. Marked improvement vs. "
                    "prior quarter (~2 elopements/week). No safety concerns."
                ),
                "plan": (
                    "PLAN: Continue weekly counseling minutes; build a "
                    "pre-test regulation routine next session. Provide progress "
                    "note to case manager."
                ),
            },
        },
        "reporter_flag": {
            "triggered": False,
            "category": "none",
            "confidence": 0.0,
            "snippet": "",
            "state": "CA",
            "timeline_hours": 36,
            "draft_filing": None,
            "regex_hit": False,
            "llm_hit": False,
        },
        "medicaid": {
            "billable": True,
            "cpt_code": "H2027",
            "code_type": "HCPCS",
            "description": (
                "Psychoeducation / health behavior intervention, individual "
                "(HA)"
            ),
            "units": 2,  # ceil(30 min / 15) = 2
            "estimated_reimbursement_usd": 40.22,  # 2 units x $20.11 indiv
            "justification": (
                "30-min individual psychoeducational counseling toward an IEP "
                "emotional-regulation goal -> H2027 (skills/strategy teaching, "
                "not psychotherapy). Per-15-min code: units = ceil(30/15) = 2; "
                "reimbursement = 2 x $20.11 = $40.22 (est. CY2025 CYBHI "
                "individual rate). Append HA (individual) + U4 modifiers."
            ),
        },
    },
}

# ---------------------------------------------------------------------------
# Scenario 3 — Crisis session, suicidal ideation
#   explicit SI + safety plan completed + parent contacted
#   -> suicidal_ideation flag, SAFETY PLANNING not CPS, NON-billable
# ---------------------------------------------------------------------------
SI_CRISIS = {
    "id": "si_crisis",
    "label": "Crisis session, suicidal ideation (safety plan, NOT CPS)",
    "dictation": (
        "crisis, pulled out of fifth period, this is Devon Marsh-Underhill, "
        "tenth grade, Castle Pines High, student ID CPHS-94203, DOB 9/2/2009. "
        "teacher flagged a journal entry. sat with him, he disclosed directly "
        "quote sometimes I just don't want to be here anymore unquote and when "
        "I asked he admitted to thoughts of killing himself this past week, no "
        "plan no means he says, denied any access to firearms at home. this is "
        "NOT a CPS thing, no abuse no neglect disclosed, this is suicide "
        "prevention protocol. did a full safety plan with him, the Stanley-"
        "Brown, identified warning signs, his coping is music and his dog, "
        "support person is his older cousin Jordan, we restricted means talked "
        "through it, crisis line 988 written on the card he took it. called "
        "mom Brenda Underhill at 555-0177 she's coming to pick him up now, "
        "she's engaged, agreed to remove the quote sharp stuff unquote and "
        "store the one medication locked. warm handoff to her in person. "
        "no formal therapy happened here this was crisis stabilization and "
        "safety planning so do NOT bill this one. follow up first thing "
        "tomorrow morning and loop the school psych Dr Adekunle. that's Devon."
    ),
    "expected": {
        "student_token": "[PERSON_A]",  # Devon Marsh-Underhill
        "case_note": {
            "format": "SOAP",
            "fields": {
                "subjective": (
                    "Student seen on a crisis basis after a teacher flagged a "
                    "journal entry. Disclosed passive ideation ('sometimes I "
                    "just don't want to be here anymore') and, on assessment, "
                    "active suicidal thoughts within the past week. Denied a "
                    "plan or means; denied access to firearms at home."
                ),
                "objective": (
                    "Crisis interview and risk assessment conducted. No abuse "
                    "or neglect disclosed. Completed a Stanley-Brown safety "
                    "plan: warning signs, internal coping (music, pet), support "
                    "person identified, means restriction discussed, 988 crisis "
                    "line provided in writing."
                ),
                "assessment": (
                    "Suicidal ideation without current plan or means; "
                    "stabilized in session. Risk addressed via safety planning "
                    "and means restriction, NOT a child-abuse report — SI is "
                    "outside CANRA and is handled under school "
                    "suicide-prevention protocol."
                ),
                "plan": (
                    "Parent contacted and completed an in-person warm handoff; "
                    "caregiver agreed to restrict means (remove sharps, lock "
                    "medication). Follow up first thing next morning; loop in "
                    "school psychologist. No formal therapy delivered — crisis "
                    "stabilization only."
                ),
            },
        },
        "reporter_flag": {
            "triggered": True,
            "category": "suicidal_ideation",
            "confidence": 0.94,
            "snippet": (
                "sometimes I just don't want to be here anymore ... admitted to "
                "thoughts of killing himself this past week"
            ),
            "state": "CA",
            "timeline_hours": 36,  # field present per contract; not a CANRA timeline here
            # KEY DISTINCTION: SI is NOT a CANRA/CPS filing. No draft SCAR.
            # Surface safety-planning guidance instead of a child-abuse report.
            "draft_filing": (
                "NOT A CPS REPORT. Suicidal ideation does not trigger a CANRA "
                "child-abuse filing (Penal Code ss11164-11174.3). Route to "
                "school suicide-prevention protocol; consider WIC s5150 / "
                "Tarasoff thresholds only if criteria are met.\n\n"
                "ACTIONS DOCUMENTED: (1) Safety plan completed (Stanley-Brown) "
                "— warning signs, coping strategies, support contacts, 988 "
                "provided. (2) Means restriction discussed with student and "
                "caregiver. (3) Parent notified and completed in-person warm "
                "handoff; agreed to remove sharps and lock medication. "
                "(4) Follow-up scheduled next morning; school psychologist to "
                "be looped in. [Safety-planning guidance, not a mandated "
                "abuse report.]"
            ),
            "regex_hit": True,   # "don't want to be here", "killing himself"
            "llm_hit": True,
        },
        "medicaid": {
            "billable": False,
            "cpt_code": None,
            "code_type": None,
            "description": "Crisis stabilization / safety planning — no formal therapy",
            "units": None,
            "estimated_reimbursement_usd": 0.0,
            "justification": (
                "Encounter was crisis assessment, safety planning, and a parent "
                "warm handoff — no formal psychotherapy or billable "
                "psychoeducational service was delivered. Non-billable; no code "
                "selected."
            ),
        },
    },
}

# Order matches the demo flow / SPEC.md s11.
SCENARIOS = [NEGLECT, IEP_CHECKIN, SI_CRISIS]


def _selftest():
    """Cheap structural assertions so this doubles as a fixture sanity check."""
    assert len(SCENARIOS) == 3, "expected exactly 3 scenarios"
    assert [s["id"] for s in SCENARIOS] == ["neglect", "iep_checkin", "si_crisis"]
    for s in SCENARIOS:
        assert set(s) >= {"id", "label", "dictation", "expected"}
        assert s["dictation"].strip(), f"{s['id']} has empty dictation"

    # Scenario 1 — neglect: CANRA flag, 36h, draft SCAR present, billable.
    n = NEGLECT["expected"]
    assert n["reporter_flag"]["triggered"] is True
    assert n["reporter_flag"]["category"] == "child_abuse_neglect"
    assert n["reporter_flag"]["timeline_hours"] == 36
    assert n["reporter_flag"]["draft_filing"]
    assert n["medicaid"]["billable"] is True

    # Scenario 2 — IEP: no flag; H2027 unit math 30min -> 2 units -> $40.22.
    i = IEP_CHECKIN["expected"]
    assert i["reporter_flag"]["triggered"] is False
    assert i["reporter_flag"]["category"] == "none"
    assert i["medicaid"]["billable"] is True
    assert i["medicaid"]["units"] == 2
    assert round(i["medicaid"]["estimated_reimbursement_usd"], 2) == round(2 * 20.11, 2)

    # Scenario 3 — SI crisis: SI flag, NOT CPS (no SCAR), non-billable.
    c = SI_CRISIS["expected"]
    assert c["reporter_flag"]["triggered"] is True
    assert c["reporter_flag"]["category"] == "suicidal_ideation"
    assert "NOT A CPS REPORT" in c["reporter_flag"]["draft_filing"]
    assert c["medicaid"]["billable"] is False
    assert c["medicaid"]["cpt_code"] is None


if __name__ == "__main__":
    _selftest()
    for s in SCENARIOS:
        print("=" * 72)
        print(f"[{s['id']}] {s['label']}")
        print("-" * 72)
        print(s["dictation"])
        print()
    print("=" * 72)
    print("OK — 3 scenarios, structural self-test passed.")
