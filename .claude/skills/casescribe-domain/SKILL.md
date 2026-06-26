---
name: casescribe-domain
description: Verified California mandated-reporter law + school-Medicaid CPT/HCPCS code table with CY2025 rates for CaseScribe. This is the proprietary data asset behind the reporter and Medicaid sub-agents. Load when building those agents, their regex safety net, or the embedded code table. Getting these wrong makes the demo look careless to domain experts.
---

# CaseScribe — Domain Data (California, verified 2026-06-26)

Sources cited in research notes / `SPEC.md`. This is the moat: rules + a code table not in any LLM's training data. The sub-agents pick FROM this data; they do not invent codes or legal conclusions.

## Mandated reporter law — CANRA (Penal Code §§11164–11174.3)

**Who reports (schools):** certificated pupil-personnel employees — **school social workers, counselors, psychologists** — plus teachers, aides, classified staff, administrators. Duty triggers on *reasonable suspicion* in professional capacity.

**Categories that REQUIRE a report** (`category` values → these map to `child_abuse_neglect`):
- Physical abuse (willful/non-accidental injury) — §§11165.3, 11165.6
- Sexual abuse — assault *and* exploitation — §11165.1
- Neglect — severe and general — §11165.2
- Willful cruelty / unjustifiable punishment — §11165.3
- Abuse in out-of-home care — §11165.5

**Timeline (§11166(a)) — CONFIRMED:** phone report **immediately / as soon as practicable**, THEN a **written report within 36 hours** on DOJ form **SS 8572**. Use `timeline_hours: 36`.

**CRITICAL non-triggers — the agent MUST get these right:**
- **Suicidal ideation / self-harm → NOT a CANRA report.** It triggers school suicide-prevention protocol / WIC §5150 / (for clinicians) Tarasoff — *not* a CPS filing. Map to `category: "suicidal_ideation"` or `"self_harm"`, `triggered: false` for CANRA purposes, and surface safety-planning language instead of a SCAR.
- **Adult domestic violence with no child harm → NOT reportable.** A child merely *witnessing* DV is not, by itself, neglect (reinforced by **AB 2085**, which also excludes conditions caused by *poverty alone*). Report only if the child suffered or was at substantial risk of physical harm.

**Regex/keyword safety net (belt-and-suspenders, runs alongside the LLM, T=0):**
- abuse/neglect triggers: `hit`, `bruise`, `welt`, `burn`, `left alone`, `no food`, `missed meals`, `inappropriate touch`, `disclosed`, `hungry`, `unsupervised`
- SI/self-harm (→ safety plan, NOT CPS): `kill myself`, `suicid`, `end it`, `cut myself`, `self-harm`, `don't want to be here`
- If either the LLM or the regex fires → set the corresponding `*_hit` flag and prompt the social worker to verify. False negatives are the worst failure; false positives are correctable.

## School-Medicaid code table (embed verbatim; agent SELECTS, never invents)

Rates are **CYBHI Statewide Multi-Payer Fee Schedule, CY2025** (the right benchmark for a CA school visit). LEA BOP itself is cost-reconciled (no flat table) — cite CYBHI rates and label them "est. CY2025". Note unit semantics carefully.

| Code | Type | Description | Unit | Est. rate (CY2025) |
|---|---|---|---|---|
| **H2027** | HCPCS | Psychoeducation / health behavior intervention (HA=indiv, HQ=group) | per **15 min** | $20.11 indiv / $8.04 group |
| **T1017** | HCPCS | Targeted Case Management | per **15 min** | $21.34 |
| **90832** | CPT | Individual psychotherapy, 16–37 min | per **encounter** (time-banded) | $67.83 |
| **90834** | CPT | Individual psychotherapy, 38–52 min | per **encounter** (time-banded) | $89.64 |
| **90837** | CPT | Individual psychotherapy, 53+ min | per **encounter** (time-banded) | $131.97 |
| **96112** | CPT | Developmental test administration, first hour | per **first hour** | CA school rate UNVERIFIED (~$125 Medicare) |
| **H0036** | HCPCS | Community psychiatric supportive treatment (CPST) | per **15 min** | CA rate UNVERIFIED (state-set) |

**Unit logic the Medicaid coder MUST encode:**
- **90832/90834/90837 are time-banded per-encounter** — pick the code by session length; `units` is `null`/1, NOT minutes÷15. (The spec's blanket "15-minute units" is wrong for these.)
- **H2027 / T1017 / H0036 are per-15-minute** — `units = ceil(minutes / 15)`, reimbursement = `units × rate`.
- All CYBHI claims require modifiers (e.g. U4 on all; HA/HQ on H2027). Mention as a roadmap detail; don't block the demo on modifier logic.
- Non-billable cases (e.g. crisis-only session with no formal therapy) → `billable: false`, no code.
