# CaseScribe — Build Specification

> **Hackathon**: Beta Fund "AI Agents for Hire"
> **Time budget**: 6 hours, solo, full-stack
> **Hard deadline**: 4:30 PM submission, 3-min demo
> **Target prize**: Beta Fund $100K seed investment
> **Mandatory**: AgentBox deployment via GMI Cloud

This document is a specification, not an implementation. It tells you *what* to build, *in what order*, and *why each decision was made the way it was*. Implementation choices are yours.

---

## 1. Product definition

CaseScribe is an AI worker that replaces ~90 minutes of post-session paperwork for K–12 school social workers with a sub-60-second pipeline. It accepts a messy session input (dictated notes, a referral PDF, or a student information system export) and produces three documents the social worker is legally required to generate after every contact:

1. **A structured case note** in SOAP or GIRP format.
2. **A mandated-reporter flag** indicating whether the session contains content (suspected abuse, suicidal ideation, domestic violence, Title IX) that triggers a state-specific reporting requirement, and if so, a draft filing.
3. **A Medicaid CPT code** for school-based mental health billing, with a billable/non-billable judgment and an estimated reimbursement amount.

These three outputs are the entire product. Together they constitute the **Holy Trinity**: case note covers time saved, reporter flag covers safety/liability, Medicaid code covers district revenue recovery. Each addresses a different judge in the room.

Anything beyond the trinity — parent letters, calendar sync, IEP drafts — is out of scope for this build.

## 2. Strategic constraints

These are the bars CaseScribe must clear to win the $100K, not just place in the audience vote:

- **Container-deployable to AgentBox**, using the GMI-mandated async job pattern: submission returns a job ID immediately, status is polled. Long-running LLM pipelines die behind HTTP gateways; we do not hold the connection open.
- **Multi-model routing through GMI's MaaS endpoint**. Use a cheap model for triage/classification, a mid-tier model for structured tasks, and a frontier model only for clinical drafting. This is the narrative GMI wants on stage, and it produces real unit economics (target: ~$0.04 per session).
- **Local PII scrubbing before any LLM call**. Names, dates of birth, addresses, phone numbers are replaced with deterministic tokens locally. The LLM only ever sees `[PERSON_A]`, never `Jordan`. Originals stay in the user's session for display purposes. This is non-negotiable for any K–12 deployment story.
- **Demo-realistic synthetic data**. Inputs must look like a stressed professional dictating in a parking lot — abbreviations, comma splices, switching between students mid-thought. If the demo input reads like a polished essay, every domain expert in the room writes the team off in seconds.
- **Liability framing throughout the UI**. Every artifact is stamped as a draft requiring licensed social worker signature. This is the honest product position and it preempts the "what if it hallucinates a CPS report" objection.
- **All three Focus Tracks claimed on stage**: Agents for Hire, Workflow & Operations, and Marketplace-Ready MVP. Skip Wildcard.

## 3. Time-boxed roadmap

| Hour | Phase | Verifiable deliverable |
|---|---|---|
| 0:00 – 0:30 | **Phase 1**: AgentBox skeleton | Container deployed to AgentBox; health endpoint returns 200; submission endpoint returns a job ID; status endpoint returns the hardcoded stub trinity |
| 0:30 – 1:15 | **Phase 2**: End-to-end ugly path | A single prompt to one frontier model returns the trinity as structured JSON; basic page can submit input and render the output |
| 1:15 – 1:45 | **Phase 3**: PII scrubbing | Presidio (or equivalent) sits in front of every LLM call; LLM never sees raw names; output rendering re-injects originals client-side only |
| 1:45 – 3:00 | **Phase 4**: Multi-model split | The single prompt is decomposed into four specialized sub-agents routed to four different models on GMI MaaS |
| 3:00 – 4:30 | **Phase 5**: Production UI | Before/after split layout, hero timer ("47s vs 90 min"), per-artifact animated reveal, model-attribution panel, signature-required stamps |
| 4:30 – 5:00 | **Phase 6**: AgentBox listing | Dockerized, pushed, deployed via wizard, listing fields filled and submitted |
| 5:00 – 5:30 | **Phase 7**: Demo data and warm-up | Three pre-canned scenarios installed; cache warmed; backup recording captured |
| 5:30 – 6:00 | **Phase 8**: Pitch rehearsal | 3-minute demo run aloud four times; Q&A one-liners memorized |

**Slip rule**: if a phase runs long, cut the next phase's scope. Never push AgentBox deployment to the last hour — if Docker breaks at 3:30 PM, you're cooked.

## 4. Architecture overview

Two services in one container:

- **A backend HTTP service** in Python (FastAPI), exposing the async job pattern: submit endpoint returns 202 + job ID; status endpoint returns pending/running/completed/failed plus the result when ready. Job state lives in-memory for the hackathon; persistent store is a post-event concern.
- **A static frontend** in React (Vite), served from the same container, that submits jobs, polls status, and renders the trinity into the before/after layout.

The backend's pipeline is a four-stage graph:

```
                   ┌──────────────────┐
   raw dictation → │  PII scrubber    │ → scrubbed text + token map (token map never leaves server memory for this request)
                   └──────────────────┘
                            │
                            ▼
                   ┌──────────────────┐
                   │  Classifier      │  cheap model
                   │  - session type  │  decides: SOAP vs GIRP, candidate triggers,
                   │  - modality      │  approximate duration, modality
                   │  - flags         │
                   └──────────────────┘
                            │
              ┌─────────────┼─────────────┐
              ▼             ▼             ▼
       ┌─────────────┐ ┌──────────┐ ┌──────────────┐
       │ Reporter    │ │ Medicaid │ │ Case note    │
       │ check       │ │ coder    │ │ drafter      │
       │ mid-tier    │ │ mid-tier │ │ frontier     │
       │ T=0 + rules │ │          │ │ clinical     │
       └─────────────┘ └──────────┘ └──────────────┘
              │             │             │
              └─────────────┼─────────────┘
                            ▼
                   ┌──────────────────┐
                   │  Trinity object  │
                   └──────────────────┘
```

The classifier runs first because the downstream agents depend on its decisions (SOAP vs GIRP, billable session type, candidate triggers). The other three sub-agents run in parallel where possible — the case note drafter takes the reporter flag as input so the note's risk language stays consistent with the flag, so it waits for that one result.

## 5. The four sub-agents

### 5.1 Classifier
- **Purpose**: lightweight triage. Decides session type (individual / group / crisis / intake / consultation), preferred note format (SOAP for clinical sessions, GIRP for case management), modality (CBT, MI, SFBT, psychoeducation, mixed), approximate duration in minutes, and a list of candidate triggers for the reporter check.
- **Model tier**: cheapest available on GMI MaaS — something in the DeepSeek Flash / Qwen small range. Output is structured, ~10 tokens of decision data, no clinical language required.
- **Why a separate stage**: the downstream agents need its decisions, and running them all blind on the raw input means duplicating this classification work three times in three frontier-model contexts. Doing it once up front is the entire reason multi-model routing has good unit economics.

### 5.2 Mandated reporter check
- **Purpose**: determine whether the session contains content requiring a mandated report under state law, identify the category, quote the triggering snippet, and (if triggered for abuse/neglect) draft a filing narrative ready for the social worker to review.
- **Model tier**: mid-tier with strong instruction-following and structured output. Temperature **zero**. This is a safety-critical step — false negatives are the worst possible failure, false positives are correctable.
- **Belt and suspenders**: combine the LLM judgment with a hand-coded keyword/regex trigger list as a redundant safety net. If either signal trips, the flag triggers and the downstream UI prompts the social worker to verify.
- **State scoping**: hardcode California for the demo. California Penal Code 11164–11174.3 governs the timeline (24–36 hours depending on category). Mention "state-configurable" as a roadmap item but don't try to build multi-state in 6 hours.
- **Important boundary**: suicidal ideation is *not* mandated reporting; it triggers safety planning. Domestic violence between adults is not mandated reporting unless a minor witnessed it. The agent must know these distinctions — surfacing wrong triggers makes the demo look careless to anyone in the room who knows the law.

### 5.3 Medicaid coder
- **Purpose**: assign the correct CPT code from California's LEA-BOP (Local Educational Agency Billing Option Program), judge billable vs non-billable, count units (most school codes bill in 15-minute units), estimate reimbursement, and draft a billing-justification note.
- **Model tier**: a code-strong mid-tier model. CPT assignment is essentially a structured lookup task with judgment.
- **Required reference data**: a small embedded table of school-Medicaid CPT codes (H2027, T1017, 90832, 90834, 90837, 96112, H0036 are the core set) with their rates and unit definitions. The model picks from the table — don't ask it to invent codes.
- **Why this matters financially**: school districts nationally leave an estimated $4B+ per year in unbilled school Medicaid because social workers don't have time to file. A $0.04 agent that recovers $22 of reimbursement per session is the cleanest unit economics story you can tell a VC.

### 5.4 Case note drafter
- **Purpose**: write the SOAP- or GIRP-formatted clinical case note. This is the artifact the social worker actually reads first and signs, so quality of clinical language matters most here.
- **Model tier**: frontier. This is where the spend is justified. The output is short (1–3 sentences per SOAP field) but the language has to read like a real LCSW wrote it — trauma-informed, strengths-based, framework-aware (CBT, MI, ACEs, attachment theory references where relevant).
- **Inputs**: the scrubbed dictation, the classifier's decisions, and the reporter flag (so the risk language in the case note is consistent with the flag — if the flag is triggered, the assessment field must reflect that, not contradict it).

## 6. The PII scrubbing layer

- **Tool**: Microsoft Presidio (Python). Default analyzers cover PERSON, PHONE_NUMBER, EMAIL_ADDRESS, LOCATION, DATE_TIME — sufficient for the demo. Don't build custom NER.
- **Tokenization**: deterministic per-conversation. The first detected person becomes `[PERSON_A]`, the second `[PERSON_B]`, and so on. Same original name in the same dictation always maps to the same token. The token map is held server-side for the duration of the request only.
- **Round-trip**: the LLM sees and writes tokens. The token-to-original map is returned to the frontend alongside the trinity, and the frontend re-renders originals for display. **Server-side persistence is tokenized only.**
- **What to say on stage** (verbatim is fine): *"All PII is scrubbed locally with Microsoft Presidio before any text touches a model. Claude sees `[PERSON_A]`, not Jordan. The reverse mapping lives only in the social worker's browser session. That's how you do AI in K–12 without violating FERPA."*

## 7. Model selection on GMI MaaS

GMI's MaaS endpoint is OpenAI-compatible — base URL `https://api.gmi-serving.com`, bearer-token auth, the standard chat-completions interface. The API key is injected into your AgentBox container at runtime via the `GMI_MAAS_API_KEY` environment variable; do not hardcode keys.

Pick four models, one per sub-agent. The exact IDs vary by what's available on the GMI catalog at hackathon time, but the tiers should be:

- **Classifier**: a DeepSeek Flash or Qwen-small class model
- **Reporter check**: a Qwen3-Next or DeepSeek-V4 class model
- **Medicaid coder**: a coder-tuned model (Qwen3 Coder is the obvious pick)
- **Case note**: Claude Sonnet 4.6 or Claude Opus

The exact split doesn't matter as long as you can defend the spread on stage. The talking point: ~70% of tokens go to the cheaper models; the frontier model only sees the final drafting step. That's how you hit $0.04 per session.

When the listing wizard asks which models you'll call (Step 2 of Register an Agent), select **all four** so GMI's MaaS layer is authorized to route to each.

## 8. Data contracts (the trinity output)

The frontend and the listing description both depend on the trinity having a stable shape. The fields are:

- **Case note**: format (SOAP or GIRP) and the corresponding field set — SOAP gets subjective/objective/assessment/plan, GIRP gets goal/intervention/response/plan.
- **Mandated reporter flag**: triggered (boolean), category (one of: child_abuse_neglect, suicidal_ideation, self_harm, domestic_violence, title_ix, none), confidence (0–1), the exact quoted snippet that triggered, the state code, the timeline in hours, and (when triggered for an abuse category) a draft filing narrative.
- **Medicaid coding**: billable (boolean), CPT code string, code description, units (integer), estimated reimbursement in USD, billing justification note.

Wrap all three in a parent object with the student token, session date, total elapsed milliseconds, and the list of models that contributed. The elapsed time and models-used fields are what feed the hero counter and the model-attribution panel in the UI.

## 9. Frontend layout

Single page, two columns under a hero band.

- **Hero band (top, full width)**: a large counter — current run time on the left, the "vs ~90 minutes manual" baseline in muted text on the right. This is your most-watched number during the demo.
- **Left column (input)**: a large textarea, three quick-load buttons (one per pre-canned scenario), a file drop zone (txt/pdf), and the run button.
- **Right column (artifacts)**: three cards, top to bottom — Case Note, Mandated Reporter, Medicaid. Cards fade in with a checkmark as each sub-agent completes (the frontend polls the job status and renders progressively). Underneath the cards, a small panel listing each model used and its per-step latency — the *visible* multi-model story.
- **Footer of each artifact**: a watermark stamp ("DRAFT — Requires [name], LCSW signature").

Visual rules: two accent colors only (one calm green for success, one alert red for the reporter trigger), system sans-serif, neutral grays for everything else, generous padding. The aesthetic gap between the left "raw input" pane and the right "structured artifacts" pane must be obvious at a glance — that contrast *is* the demo.

## 10. AgentBox listing fields

When you submit through the four-step register wizard:

- **Title**: `CaseScribe — Documentation Co-pilot for School Social Workers`
- **Short description**: one sentence on the time saved and the three outputs.
- **Long description**: paste from your README; cover what it does, how it works, the multi-model architecture, and the FERPA-safe PII handling.
- **Category**: Workflow & Operations.
- **Pricing**: usage-based, $0.04/run. (Stating a real number is more credible than "TBD".)
- **Tags**: K-12, education, social work, healthcare, compliance, FERPA, Medicaid, multi-agent.
- **Deployment path**: GMI CE Deployment + MaaS integration ON. This is the combination eligible for the Verified badge.
- **Region**: US West (closest to the AWS Loft venue, lowest demo-time latency).
- **Compute tier**: Standard (2 vCPU, 4 GB RAM).

Submit for review before 4:30. Even a "pending review" status counts as marketplace-ready — screenshot it for the demo.

## 11. Demo data

Build three pre-canned scenarios designed to demonstrate range:

1. **Tier-1 concern, possible neglect**: a session where the dictation mentions a parent's substance use, the student's distress, and missed meals. Should trigger the child_abuse_neglect flag with a 36-hour timeline and a draft SCAR narrative.
2. **Routine IEP check-in**: a calm, billable session on emotional regulation goals. No flag triggered. Medicaid coded (likely H2027 or 90832).
3. **Crisis session, suicidal ideation**: explicit SI disclosure, completed safety plan, parent contact made. Reporter flag for SI (not CPS — important distinction the demo must show), no Medicaid billing because no formal therapy occurred.

Each dictation must read like real notes — abbreviations, partial sentences, switching between students mid-stream. If you can text one real school social worker before the hackathon and ask for a redacted example, do it. "I texted a practicing school SW this morning to validate the format" is the strongest line you can drop in Q&A.

Plus a fourth mode: a blank textarea for judges to paste their own. Have a fallback if they don't.

Warm the cache by running each scenario once before stage time so the first live demo run isn't a cold start.

## 12. Pitch script (3 minutes, timed)

**[0:00–0:20] Hook**. Open on Sarah — a named, specific school social worker with 187 students and a stack of unfinished paperwork at 4 PM Friday. Make her quitting in June. Anchor the problem in a person, not a market size.

**[0:20–2:10] Live demo**. Load Scenario 1. Click Run. While the agents work, narrate the multi-model story: "Four sub-agents running in parallel through GMI's API. Triage on DeepSeek. Reporter detection on Qwen. Medicaid coding on Qwen Coder. The case note draft on Claude. PII scrubbed locally before any model sees the text." The output renders, the timer freezes around 47 seconds. Walk through the three artifacts — case note, the reporter flag with the California Penal Code citation and draft SCAR, the Medicaid code with the reimbursement number. Then load Scenario 3 (SI crisis) and call out the key distinction: "Different case. Suicidal ideation. The agent flagged safety planning, not CPS — it knows the difference. Didn't bill Medicaid because no formal therapy occurred."

**[2:10–2:40] Marketplace beat**. Switch tab to the AgentBox listing. "Deployed right now. Any district can hit Deploy and have it running this afternoon. Four-cent agent recovers an average twenty-two dollars of Medicaid per run, plus eighty-nine minutes of social worker time."

**[2:40–3:00] Close**. "Fifty thousand school social workers in the US, never enough of them. We're hiring out a worker that does the part of the job nobody wants to do. We'd like to talk to Beta Fund about the seed round." Stop talking.

## 13. Q&A prep

The four questions you will get, with one-line answers:

- *"What about FERPA?"* — "Local Presidio scrubbing. No PII ever leaves the social worker's browser session unprotected. Architecture is on the slide."
- *"What if the agent hallucinates a CPS report?"* — "Every artifact is stamped as a draft pending licensed signature. We're a co-pilot, not an autopilot. The mandated-reporter agent runs at temperature zero with a redundant keyword trigger as a safety net."
- *"How is this not just GPT?"* — "Four models routed through GMI. California-specific reporter law. School-Medicaid CPT mapping not in any LLM's training data. The cheap models do the triage so we hit four-cent unit economics."
- *"Who pays?"* — "Districts. They already spend $90K/year per social worker and lose $4B nationally in unbilled school Medicaid. We're $4 per student per month — pays for itself many times over in recovered Medicaid alone."

## 14. What to NOT build

- A fourth sub-agent of any kind. Trinity only.
- Authentication or user management. Public endpoint with simple rate-limiting is fine for the demo.
- Real database persistence. In-memory job store is correct for hackathon scope; mention Redis as the production answer.
- Streaming responses. The job-and-poll pattern is what AgentBox is built for and it's simpler to demo reliably.
- A *trained or fine-tuned* model during the hackathon. The whole point is showing GMI's hosted-model routing — and you have neither the data nor the hours. (You **do** build the *capture* layer for the flywheel — see §18 — just not the training run.)
- Multi-state reporter law. California only.

## 15. Final checklist before submission

- Health endpoint returns 200 on the AgentBox public URL.
- Submission endpoint returns a job ID; status endpoint returns the completed trinity within 60 seconds.
- All three pre-canned demo scenarios run end-to-end through the deployed instance.
- AgentBox listing submitted (even if review is pending).
- 90-second backup demo video recorded (in case the venue WiFi dies — it will).
- Pitch rehearsed aloud four times under 3:00.
- Laptop charged, phone hotspot tested as failover.
- One real school social worker contacted (any reply, however brief, is gold for Q&A).

## 16. One rule above all

Working ugly beats broken pretty. Ship the spine in the first 90 minutes — deployed container, end-to-end happy path, single fat prompt returning the trinity. Improve from there. If at any point you're tempted to refactor before the demo runs end-to-end, don't.

Go win the hundred grand.

---

## 17. Standout layer

The base Trinity wins respect; this layer wins the **room**. None of it adds product surface area — it makes what already exists *legible* to each judge. Build it only after the spine (§16) runs end-to-end. Slot Tier 1 into Phase 5 (Production UI); Tier 0 happens before the hackathon; Tier 2 is stretch.

### Tier 0 — near-zero cost, do regardless

- **Text one real LCSW before the event.** Highest credibility-per-effort move in the whole project. Any reply, however brief, earns the Q&A line: *"I texted a practicing school social worker this morning to validate the note format."* The spec already flagged this (§11); it is promoted here to a named deliverable.

### Tier 1 — commit to all three (~2 hours total, hits every judge)

1. **Live cost meter — "$0.04 this run vs $0.19 all-frontier."** Beside the hero timer, show what this run *would* have cost on a single frontier model, computed from real token counts × per-model MaaS prices. This is the single best move for the **GMI judges**: it turns multi-model routing from a passive list of model names into *money saved on screen*. Talking point it sets up: "70% of tokens on the cheap models, same output, one-fifth the cost." (~30 min.)
2. **Employee timecard — reframe a tool as a hire.** The hackathon is *Agents for Hire*; give CaseScribe a name/persona and a small aggregate panel: *"This week: 34 sessions documented · $740 Medicaid recovered · 49 hours saved."* Hardcoded aggregates are fine for the demo. This converts a one-shot demo into "an employee you onboard and it keeps working" — the framing **Beta Fund** is buying. Highest theme-alignment per minute in the project.
3. **Visible PII scrubbing — show, don't assert.** Render three states live: raw input → `[PERSON_A]` tokenized (what the model sees) → result with originals re-injected client-side. FERPA stops being a claim in the pitch and becomes a two-second visual the room remembers; it pre-empts the FERPA objection before it is asked.

### Tier 2 — stretch, only if Tier 1 lands with time to spare

4. **Confidence-based escalation on the reporter check.** Answers the sharpest attack ("why is the safety-critical step on a *cheap* model?"). Show the reporter agent **escalating to the frontier model when any trigger fires** — cheap when the session is clearly safe, expensive only when it matters. Converts the routing story from cost-cutting into *intelligent triage*. Pairs with the §5.2 belt-and-suspenders (regex net stays the floor; escalation raises the ceiling).
5. **Surface the proprietary data asset.** The moat is not the prompts — it is the **CA reporter-law ruleset + the LEA-BOP CPT mapping table**, neither of which is in any LLM's training data. Flash the embedded CPT table for one beat and say "this is data we built." That is the visual answer to "how is this not just GPT."

## 18. Model improvement — the data flywheel

**The question:** can the model get better over time? Yes — but not by training *during* the hackathon (see §14). The investable, demoable version is a **feedback flywheel** you build the *capture* for now and frame the *training* as roadmap.

### What to build now (cheap, ~30–45 min)

- **Edit capture.** The social worker reviews and edits each draft before signing (the liability model in §6 *requires* a human in the loop — turn that obligation into an asset). When they sign, diff `draft → final` per artifact and record the pair: `{input_tokens, model_used, draft, final, edit_distance, artifact_type}`. In-memory for the demo; the *shape* is what matters.
- **Surface it.** One line in the UI after signing — *"✎ 3 edits captured — these train the next version."* Optionally a roadmap-slide counter: *"12,400 LCSW-corrected notes and counting."* (Aspirational on the slide is fine; label it as the target, not a current number.)

### Why this is the strongest VC story in the deck

Every signature produces a **proprietary, expert-labeled preference pair** that no foundation-model lab has — corrected school-clinical documentation. That dataset compounds: more districts → more signed edits → better drafts → fewer edits → stickier product. It is a *data* moat, which is the only kind that survives the next model release.

### The roadmap (what the captured data feeds)

- **Distill / fine-tune Nemotron on the captured edits.** GMI's Nemotron family ships **open weights, training recipes, datasets, and environments for customization** — so the case-note drafter migrates over time from a frontier model down to a *fine-tuned Nemotron Super (~49B)* that matches LCSW-edited quality at a fraction of the cost and latency. That is also the GMI-aligned punchline: the flywheel *lowers* your per-run cost over time instead of holding it flat.
- **Sequencing:** (1) hackathon — frontier model + edit capture; (2) collect N thousand signed edits across pilot districts; (3) distill onto Nemotron via GMI recipes; (4) the $0.04/run drifts *down* and the draft quality drifts *up* — both visible in the timecard.

### Pitch line (one sentence)

*"Every signature makes the next draft better. We're not renting a model — we're building the only school-clinical documentation dataset that exists, and it compounds with every district we add."*
