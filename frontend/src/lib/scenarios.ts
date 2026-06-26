// Demo fixtures — the three dictations + their full Trinity outcomes, ported
// from backend/demo/scenarios.py (do NOT import Python). These drive the mock
// poller so the whole app demos with zero backend (SPEC.md §15). Every name,
// phone, address and DOB is OBVIOUSLY synthetic on purpose so the scrub layer
// has something to catch on stage.

import type { ModelUsage, Stage, TokenMap, Trinity } from "./types";

export interface MockScenario {
  id: string;
  label: string;
  /** Short label for the quick-load buttons. */
  short: string;
  /** Raw dictation (the real-PII transcript the social worker pastes). */
  dictation: string;
  /** token -> original; the reverse map that lives only in the browser. */
  tokenMap: TokenMap;
  /** Full Trinity (tokenized, exactly as the pipeline would emit it). */
  trinity: Trinity;
  /** Per-step model calls in completion order (sliced by stage while polling). */
  models: ModelUsage[];
}

/** Which pipeline stage each model step belongs to (for staggered reveal). */
export const STEP_STAGE: Record<string, Stage> = {
  scrub: "scrubbing",
  classifier: "classifying",
  reporter: "classifying",
  reporter_escalation: "classifying",
  medicaid: "drafting",
  casenote: "done",
};

// --------------------------------------------------------------------------- //
// Scenario 1 — Tier-1 concern, possible neglect
// --------------------------------------------------------------------------- //
const NEGLECT: MockScenario = {
  id: "neglect",
  label: "Possible neglect (Tier-1 concern)",
  short: "Possible neglect",
  dictation:
    "ok this is for Marcus Bellweather-Quigley, fourth grade, Lincoln " +
    "Meadows Elementary, DOB uh 3/14/2016, student ID LMES-00417. came to " +
    "my office third period self-referred says his stomach hurts but I " +
    "think he's hungry, told me he hasn't had breakfast since like Tuesday " +
    "and last night there was no dinner again, said mom Tina Bellweather " +
    "was quote sleeping and wouldn't wake up unquote, this is the third " +
    "time in two weeks. flat affect, kid's exhausted, fell asleep at the " +
    "table in art per Ms Okonkwo. he mentioned theres beer cans and quote " +
    "the orange bottles unquote all over the kitchen and mom's boyfriend " +
    "Dwayne keeps quote weird hours unquote, Marcus is watching his little " +
    "sister Lily who's 3 by himself after school, that's the part that " +
    "gets me, no adult home til late. mom's cell is 555-0142 i think, they " +
    "live over on 88 Sycamore Court apt 6. did some grounding with him, " +
    "gave him crackers from my drawer. -- oh also separate note remind me " +
    "to email about Priya's reassessment that's unrelated. back to Marcus, " +
    "spent good chunk of the period with him maybe 45 min, worked on the " +
    "stomachache the worry the whole thing. gonna need to call this one in " +
    "I think, parent substance use plus the supervision plus missed meals, " +
    "yeah. session was at Lincoln Meadows today.",
  tokenMap: {
    "[PERSON_A]": "Marcus Bellweather-Quigley",
    "[PERSON_B]": "Tina Bellweather",
    "[PERSON_C]": "Dwayne",
    "[PERSON_D]": "Lily",
    "[PERSON_E]": "Ms Okonkwo",
    "[PERSON_F]": "Priya",
    "[PERSON_REPORTER]": "Maria Reyes, LCSW",
    "[ORG_SCHOOL]": "Lincoln Meadows Elementary",
    "[LOCATION_A]": "88 Sycamore Court apt 6",
    "[PHONE_A]": "555-0142",
    "[DATE_A]": "3/14/2016",
    "[ID_A]": "LMES-00417",
  },
  trinity: {
    student_token: "[PERSON_A]",
    session_date: "2026-06-26",
    elapsed_ms: 47200,
    models_used: [], // filled below
    case_note: {
      format: "SOAP",
      fields: {
        subjective:
          "Self-referred student reports abdominal pain; on interview " +
          "describes not having eaten breakfast since ~Tuesday and no dinner " +
          "the prior night. States caregiver was 'sleeping and wouldn't wake " +
          "up'; reports third such occurrence in two weeks. Reports beer cans " +
          "and 'orange bottles' in the home and that he supervises a " +
          "3-year-old sibling alone after school until a caregiver returns late.",
        objective:
          "Flat affect, appears fatigued; staff report student fell asleep " +
          "during class earlier today. No visible injuries observed. " +
          "~45-minute individual session.",
        assessment:
          "Presentation consistent with food insecurity and possible general " +
          "neglect / inadequate supervision in the context of suspected " +
          "caregiver substance use. Meets reasonable-suspicion threshold for a " +
          "mandated report. Somatic complaints likely stress-linked.",
        plan:
          "Provided food and grounding/coping support in session. File " +
          "mandated report (see reporter flag). Coordinate with school nurse " +
          "and connect family to food resources. Continue weekly individual " +
          "check-ins.",
      },
    },
    reporter_flag: {
      triggered: true,
      category: "child_abuse_neglect",
      confidence: 0.86,
      snippet:
        "hasn't had breakfast since like Tuesday and last night there was no " +
        "dinner again ... watching his little sister Lily who's 3 by himself " +
        "after school",
      state: "CA",
      timeline_hours: 36,
      draft_filing:
        "SUSPECTED CHILD ABUSE REPORT (CANRA, Cal. Penal Code §§11164-11174.3; " +
        "general neglect per §11165.2). DOJ form SS 8572. Telephone report to " +
        "county child welfare to be placed immediately / as soon as " +
        "practicable; written report due within 36 hours.\n\n" +
        "Reporting party: [PERSON_REPORTER], school social worker, " +
        "[ORG_SCHOOL]. Reported in professional capacity.\n\n" +
        "Victim: [PERSON_A], age 9, [ORG_SCHOOL]. Narrative: Student " +
        "self-referred with somatic complaints and disclosed recurrent lack " +
        "of meals (no breakfast since ~Tuesday, no dinner prior night), third " +
        "such episode in ~two weeks. Disclosed caregiver [PERSON_B] was " +
        "unrousable ('sleeping and wouldn't wake up'); described alcohol and " +
        "unidentified 'orange bottles' (possible medication) accessible in the " +
        "home and an adult [PERSON_C] keeping irregular hours. Student reports " +
        "being left to supervise a 3-year-old sibling [PERSON_D] alone after " +
        "school until late. Concerns: general neglect, inadequate supervision, " +
        "and suspected caregiver substance use. NOTE: per AB 2085, poverty " +
        "alone is not a basis; this report rests on lack of supervision and " +
        "caregiver impairment, not economic status alone.\n\n" +
        "Observations: flat affect, fatigue, fell asleep in class; no visible " +
        "injuries. Reporter has not contacted the family prior to filing. " +
        "[Draft for social-worker review before submission.]",
      regex_hit: true,
      llm_hit: true,
    },
    medicaid: {
      billable: true,
      cpt_code: "90834",
      code_type: "CPT",
      description: "Individual psychotherapy, 38-52 min",
      units: null,
      estimated_reimbursement_usd: 89.64,
      justification:
        "~45-minute individual psychotherapy encounter (somatic/anxiety focus, " +
        "coping work) falls in the 38-52 min band → 90834. Time-banded " +
        "per-encounter code: units=1/null, not minutes/15. Est. CY2025 CYBHI " +
        "Statewide Multi-Payer rate $89.64. Append U4 (and applicable LEA " +
        "modifiers) at submission.",
    },
  },
  models: [
    { step: "scrub", model: "presidio-analyzer (local)", latency_ms: 18, input_tokens: 0, output_tokens: 0 },
    { step: "classifier", model: "nvidia/NVIDIA-Nemotron-3-Nano-Omni", latency_ms: 372, input_tokens: 3050, output_tokens: 140 },
    { step: "reporter", model: "Qwen/Qwen3-Next-80B-A3B-Instruct", latency_ms: 1140, input_tokens: 3420, output_tokens: 520 },
    { step: "reporter_escalation", model: "anthropic/claude-sonnet-4.6", latency_ms: 1880, input_tokens: 1620, output_tokens: 340 },
    { step: "medicaid", model: "Qwen/Qwen3-Coder-480B-A35B-Instruct-FP8", latency_ms: 642, input_tokens: 2810, output_tokens: 300 },
    { step: "casenote", model: "anthropic/claude-sonnet-4.6", latency_ms: 1980, input_tokens: 2040, output_tokens: 700 },
  ],
};

// --------------------------------------------------------------------------- //
// Scenario 2 — Routine IEP check-in (no flag, billable w/ unit math)
// --------------------------------------------------------------------------- //
const IEP_CHECKIN: MockScenario = {
  id: "iep_checkin",
  label: "Routine IEP check-in (emotional regulation)",
  short: "Routine IEP check-in",
  dictation:
    "weekly IEP counseling check-in, this is Aanya Featherstone-Park, " +
    "seventh grade, Rosewood Junction Middle, student ID RJMS-21188. goal " +
    "is emotional regulation, the IEP counseling minutes 30 a week. good " +
    "session honestly, she's been using the zones of regulation chart, " +
    "showed me she logged two times this week she felt herself going to " +
    "the red zone before a math test and used the box breathing instead of " +
    "walking out, that's huge, last quarter she was eloping like twice a " +
    "week. we practiced the 4-7-8 breathing, did a feelings check-in she " +
    "rated herself a 3 out of 5 calm. no safety concerns at all, no flags " +
    "here, just steady progress on the reg goal. -- side thing her case " +
    "manager is Mr Halloran wants the progress note by Friday, his email " +
    "is r.halloran at rosewood dot k12 dot example. full 30 minutes " +
    "individual, pull-out in my office. next week keep building the " +
    "pre-test routine. that's it for Aanya.",
  tokenMap: {
    "[PERSON_A]": "Aanya Featherstone-Park",
    "[PERSON_B]": "Mr Halloran",
    "[ORG_SCHOOL]": "Rosewood Junction Middle",
    "[EMAIL_A]": "r.halloran at rosewood dot k12 dot example",
    "[ID_A]": "RJMS-21188",
  },
  trinity: {
    student_token: "[PERSON_A]",
    session_date: "2026-06-26",
    elapsed_ms: 31800,
    models_used: [],
    case_note: {
      format: "GIRP",
      fields: {
        subjective:
          "GOAL: IEP counseling goal — emotional regulation; reduce elopement " +
          "and build self-regulation strategies.",
        objective:
          "INTERVENTION: 30-min individual pull-out. Reviewed Zones of " +
          "Regulation tracking; practiced 4-7-8 / box breathing; completed a " +
          "feelings check-in.",
        assessment:
          "RESPONSE: Student self-reported two instances of using breathing to " +
          "de-escalate before testing rather than eloping; rated self 3/5 on " +
          "calm. Marked improvement vs. prior quarter (~2 elopements/week). No " +
          "safety concerns.",
        plan:
          "PLAN: Continue weekly counseling minutes; build a pre-test " +
          "regulation routine next session. Provide progress note to case " +
          "manager.",
      },
    },
    reporter_flag: {
      triggered: false,
      category: "none",
      confidence: 0.0,
      snippet: "",
      state: "CA",
      timeline_hours: 36,
      regex_hit: false,
      llm_hit: false,
    },
    medicaid: {
      billable: true,
      cpt_code: "H2027",
      code_type: "HCPCS",
      description: "Psychoeducation / health behavior intervention, individual (HA)",
      units: 2,
      estimated_reimbursement_usd: 40.22,
      justification:
        "30-min individual psychoeducational counseling toward an IEP " +
        "emotional-regulation goal → H2027 (skills/strategy teaching, not " +
        "psychotherapy). Per-15-min code: units = ceil(30/15) = 2; " +
        "reimbursement = 2 × $20.11 = $40.22 (est. CY2025 CYBHI individual " +
        "rate). Append HA (individual) + U4 modifiers.",
    },
  },
  models: [
    { step: "scrub", model: "presidio-analyzer (local)", latency_ms: 15, input_tokens: 0, output_tokens: 0 },
    { step: "classifier", model: "nvidia/NVIDIA-Nemotron-3-Nano-Omni", latency_ms: 348, input_tokens: 2780, output_tokens: 90 },
    { step: "reporter", model: "Qwen/Qwen3-Next-80B-A3B-Instruct", latency_ms: 520, input_tokens: 2810, output_tokens: 70 },
    { step: "medicaid", model: "Qwen/Qwen3-Coder-480B-A35B-Instruct-FP8", latency_ms: 604, input_tokens: 2640, output_tokens: 280 },
    { step: "casenote", model: "anthropic/claude-sonnet-4.6", latency_ms: 1720, input_tokens: 1860, output_tokens: 540 },
  ],
};

// --------------------------------------------------------------------------- //
// Scenario 3 — Crisis session, suicidal ideation (safety plan, NOT CPS)
// --------------------------------------------------------------------------- //
const SI_CRISIS: MockScenario = {
  id: "si_crisis",
  label: "Crisis session — suicidal ideation (safety plan, NOT CPS)",
  short: "Crisis (suicidal ideation)",
  dictation:
    "crisis, pulled out of fifth period, this is Devon Marsh-Underhill, " +
    "tenth grade, Castle Pines High, student ID CPHS-94203, DOB 9/2/2009. " +
    "teacher flagged a journal entry. sat with him, he disclosed directly " +
    "quote sometimes I just don't want to be here anymore unquote and when " +
    "I asked he admitted to thoughts of killing himself this past week, no " +
    "plan no means he says, denied any access to firearms at home. this is " +
    "NOT a CPS thing, no abuse no neglect disclosed, this is suicide " +
    "prevention protocol. did a full safety plan with him, the Stanley-" +
    "Brown, identified warning signs, his coping is music and his dog, " +
    "support person is his older cousin Jordan, we restricted means talked " +
    "through it, crisis line 988 written on the card he took it. called " +
    "mom Brenda Underhill at 555-0177 she's coming to pick him up now, " +
    "she's engaged, agreed to remove the quote sharp stuff unquote and " +
    "store the one medication locked. warm handoff to her in person. " +
    "no formal therapy happened here this was crisis stabilization and " +
    "safety planning so do NOT bill this one. follow up first thing " +
    "tomorrow morning and loop the school psych Dr Adekunle. that's Devon.",
  tokenMap: {
    "[PERSON_A]": "Devon Marsh-Underhill",
    "[PERSON_B]": "Brenda Underhill",
    "[PERSON_C]": "Jordan",
    "[PERSON_D]": "Dr Adekunle",
    "[ORG_SCHOOL]": "Castle Pines High",
    "[PHONE_A]": "555-0177",
    "[DATE_A]": "9/2/2009",
    "[ID_A]": "CPHS-94203",
  },
  trinity: {
    student_token: "[PERSON_A]",
    session_date: "2026-06-26",
    elapsed_ms: 52400,
    models_used: [],
    case_note: {
      format: "SOAP",
      fields: {
        subjective:
          "Student seen on a crisis basis after a teacher flagged a journal " +
          "entry. Disclosed passive ideation ('sometimes I just don't want to " +
          "be here anymore') and, on assessment, active suicidal thoughts " +
          "within the past week. Denied a plan or means; denied access to " +
          "firearms at home.",
        objective:
          "Crisis interview and risk assessment conducted. No abuse or neglect " +
          "disclosed. Completed a Stanley-Brown safety plan: warning signs, " +
          "internal coping (music, pet), support person identified, means " +
          "restriction discussed, 988 crisis line provided in writing.",
        assessment:
          "Suicidal ideation without current plan or means; stabilized in " +
          "session. Risk addressed via safety planning and means restriction, " +
          "NOT a child-abuse report — SI is outside CANRA and is handled under " +
          "school suicide-prevention protocol.",
        plan:
          "Parent contacted and completed an in-person warm handoff; caregiver " +
          "agreed to restrict means (remove sharps, lock medication). Follow up " +
          "first thing next morning; loop in school psychologist. No formal " +
          "therapy delivered — crisis stabilization only.",
      },
    },
    reporter_flag: {
      triggered: true,
      category: "suicidal_ideation",
      confidence: 0.94,
      snippet:
        "sometimes I just don't want to be here anymore ... admitted to " +
        "thoughts of killing himself this past week",
      state: "CA",
      timeline_hours: 36,
      draft_filing:
        "NOT A CPS REPORT. Suicidal ideation does not trigger a CANRA " +
        "child-abuse filing (Penal Code §§11164-11174.3). Route to school " +
        "suicide-prevention protocol; consider WIC §5150 / Tarasoff thresholds " +
        "only if criteria are met.\n\n" +
        "ACTIONS DOCUMENTED: (1) Safety plan completed (Stanley-Brown) — " +
        "warning signs, coping strategies, support contacts, 988 provided. " +
        "(2) Means restriction discussed with student and caregiver. " +
        "(3) Parent notified and completed in-person warm handoff; agreed to " +
        "remove sharps and lock medication. (4) Follow-up scheduled next " +
        "morning; school psychologist to be looped in. [Safety-planning " +
        "guidance, not a mandated abuse report.]",
      regex_hit: true,
      llm_hit: true,
    },
    medicaid: {
      billable: false,
      cpt_code: "—",
      code_type: "CPT",
      description: "Crisis stabilization / safety planning — no formal therapy",
      units: null,
      estimated_reimbursement_usd: 0.0,
      justification:
        "Encounter was crisis assessment, safety planning, and a parent warm " +
        "handoff — no formal psychotherapy or billable psychoeducational " +
        "service was delivered. Non-billable; no code selected.",
    },
  },
  models: [
    { step: "scrub", model: "presidio-analyzer (local)", latency_ms: 21, input_tokens: 0, output_tokens: 0 },
    { step: "classifier", model: "nvidia/NVIDIA-Nemotron-3-Nano-Omni", latency_ms: 366, input_tokens: 3180, output_tokens: 150 },
    { step: "reporter", model: "Qwen/Qwen3-Next-80B-A3B-Instruct", latency_ms: 1080, input_tokens: 3520, output_tokens: 480 },
    { step: "reporter_escalation", model: "anthropic/claude-sonnet-4.6", latency_ms: 1760, input_tokens: 1700, output_tokens: 360 },
    { step: "medicaid", model: "Qwen/Qwen3-Coder-480B-A35B-Instruct-FP8", latency_ms: 540, input_tokens: 2720, output_tokens: 110 },
    { step: "casenote", model: "anthropic/claude-sonnet-4.6", latency_ms: 2040, input_tokens: 2120, output_tokens: 720 },
  ],
};

// Attach full models_used to each trinity (single source of truth).
for (const s of [NEGLECT, IEP_CHECKIN, SI_CRISIS]) {
  s.trinity.models_used = s.models;
}

export const MOCK_SCENARIOS: MockScenario[] = [NEGLECT, IEP_CHECKIN, SI_CRISIS];

/** Default standalone Trinity (the neglect case) for zero-input demos/tests. */
export const MOCK_TRINITY: Trinity = NEGLECT.trinity;

/** Pick the scenario a transcript came from (exact match → name match → default). */
export function matchScenario(text: string): MockScenario {
  const t = text.trim();
  const exact = MOCK_SCENARIOS.find((s) => s.dictation.trim() === t);
  if (exact) return exact;
  const byName = MOCK_SCENARIOS.find((s) =>
    Object.values(s.tokenMap).some((orig) => orig && t.includes(orig)),
  );
  return byName ?? NEGLECT;
}
