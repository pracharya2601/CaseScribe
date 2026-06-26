# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**CaseScribe** — a hackathon build (Beta Fund "AI Agents for Hire", 6-hour solo full-stack sprint). It is an AI worker that turns a school social worker's messy session input (dictated notes, referral PDF, SIS export) into three legally-required post-session documents in under 60 seconds:

1. **Case note** — SOAP or GIRP format.
2. **Mandated-reporter flag** — whether session content triggers a state reporting requirement, with a draft filing when it does.
3. **Medicaid CPT code** — billable/non-billable judgment + estimated reimbursement (California LEA-BOP).

These three outputs are called the **Trinity** and are the *entire* product. Do not add features beyond them (no IEP drafts, parent letters, calendar sync). The full build specification lives in [`SPEC.md`](./SPEC.md) at the repo root — read it for the rationale behind any decision; this file is the working summary.

> The repo is currently empty. Phase 1 is to scaffold the container skeleton. There is no build/test tooling yet — establish the commands below as you create the project.

## Parallel build — skills + subagents

This repo ships custom **skills** (shared, verified knowledge every builder reads) and **subagents** (module-owning workers that build concurrently without file conflicts). Use them to parallelize the build.

**Skills** (`.claude/skills/`): `casescribe-platform` (the binding contract — async job routes, env vars, Trinity shape, file-ownership map, scope), `casescribe-gmi` (verified MaaS facts + model-ID routing + cost meter), `casescribe-domain` (verified CA reporter law + CPT table — the proprietary asset), `casescribe-pii` (Presidio tokenization), `casescribe-ui` (the frontend design system — tokens, 3-layer `ui`→`blocks`→`features` architecture, reusable component inventory, motion, polish bar).

**Subagents** (`.claude/agents/`) and their owned files:
| Agent | Owns | Wave |
|---|---|---|
| `casescribe-backend` | `backend/app.py`, `jobs.py`, `Dockerfile`, `requirements.txt`, `.env.example` | 1 |
| `casescribe-gmi-client` | `backend/gmi.py` | 1 |
| `casescribe-pii` | `backend/pii.py` | 1 |
| `casescribe-ui-kit` | `frontend/` scaffold + `src/ui`, `src/blocks`, `src/theme`, `/gallery` | 1 |
| `casescribe-demo` | `backend/demo/scenarios.py` | 1 |
| `casescribe-pipeline` | `backend/pipeline.py`, `agents/*`, `domain/*` | 2 (needs gmi+pii+domain) |
| `casescribe-frontend` | `frontend/src/features`, `src/lib`, `App.tsx` (composes the kit) | 2 (needs ui-kit) |

**Frontend is two layers, two waves:** `casescribe-ui-kit` builds the reusable design system (primitives → blocks → `/gallery` preview) in Wave 1; `casescribe-frontend` composes the actual screens + data/polling layer on top in Wave 2. Layer import rule: `features → blocks → ui → theme`, never the reverse — that's what keeps the UI DRY and lets features be built in parallel against stable primitives.

**Wave 1**: spawn `backend`, `gmi-client`, `pii`, `ui-kit`, `demo` in a *single message* (disjoint files → no conflict; backend exposes a `process_session` stub + `STUB_TRINITY`, ui-kit ships a runnable `/gallery`, so nothing blocks). **Wave 2**: `pipeline` wires the real brain behind the stub seam and `frontend` composes screens on the kit. Then integrate + deploy.

## Verified facts (from research, 2026-06-26 — these correct the spec)

- **GMI MaaS**: base URL `https://api.gmi-serving.com/v1`, Bearer auth, OpenAI-compatible, `GET /v1/models` to discover. AgentBox auto-injects `GMI_MAAS_API_KEY` / `GMI_MAAS_BASE_URL` / `GMI_MODELS`; container listens on **8080**; async = `POST /run`→`202 {job_id}` then `GET /jobs/{id}`. Model spread: classifier `nvidia/NVIDIA-Nemotron-3-Nano-Omni`, reporter `Qwen/Qwen3-Next-80B-A3B-Instruct` (T=0), medicaid `Qwen/Qwen3-Coder-480B-A35B-Instruct-FP8`, case note `anthropic/claude-sonnet-4.6`. **Nemotron Super (~49B) is NOT in the catalog** — that spec reference is dropped.
- **Reporter timeline**: phone immediately + **written report within 36h** (DOJ form SS 8572) → `timeline_hours: 36`. SI and adult-DV-without-child-harm confirmed as **non-triggers** for CANRA.
- **CPT units**: `90832/90834/90837` are **time-banded per-encounter** (NOT 15-min units); `H2027/T1017/H0036` are per-15-min. Real CY2025 rates are in the `casescribe-domain` skill.
- Two items to confirm with GMI organizers: hackathon credit amount, and exact env-var name in the listing wizard.

## Architecture (read before coding)

Two services in **one container**, deployed to **GMI Cloud AgentBox**:

- **Backend**: Python + FastAPI. Exposes the GMI **async job pattern** — submit returns `202` + job ID immediately; status endpoint is polled (`pending`/`running`/`completed`/`failed` + result). **Never hold the HTTP connection open** for the LLM pipeline; long requests die behind the gateway. Job state is **in-memory** (Redis is the post-hackathon answer — do not build persistence).
- **Frontend**: React + Vite, static, served from the same container. Submits jobs, polls status, renders the Trinity progressively.

### Pipeline (4-stage graph)

```
raw dictation → PII scrubber → Classifier (cheap) ─┬→ Reporter check (mid-tier, T=0)
                                                    ├→ Medicaid coder (mid-tier, code-tuned)
                                                    └→ Case note drafter (frontier)
                                                       → Trinity object
```

- **Classifier runs first** — its decisions (SOAP vs GIRP, session type, candidate triggers, modality, duration) feed the three downstream agents. Running it once up front instead of three times in frontier-model contexts is *the* reason the multi-model unit economics work.
- The three sub-agents run in parallel **except**: the case note drafter waits for the reporter flag, so the note's risk language stays consistent with the flag.

### The two non-negotiable constraints

1. **Local PII scrubbing before ANY LLM call.** Use Microsoft Presidio (PERSON, PHONE_NUMBER, EMAIL_ADDRESS, LOCATION, DATE_TIME — no custom NER). Tokenize deterministically per request: first person → `[PERSON_A]`, etc. The LLM only ever sees tokens. The token→original map stays **server-side for the request only**, is returned to the frontend with the Trinity, and originals are re-rendered **client-side only**. This is the FERPA story; it is mandatory for any K–12 framing.
2. **Multi-model routing through GMI MaaS.** One model per sub-agent, cheap→frontier. ~70% of tokens go to cheap models; the frontier model only does the final case-note draft. Target unit economics: **~$0.04/session**.

## Sub-agent specifics

- **Reporter check** runs at **temperature 0** and is backed by a redundant hand-coded keyword/regex trigger list (belt-and-suspenders — if either signal trips, flag triggers). It is safety-critical: false negatives are the worst failure. **Hardcode California** (Penal Code 11164–11174.3, 24–36h timelines). Critical legal distinctions the agent must respect: **suicidal ideation is NOT mandated reporting** (it triggers safety planning); **DV between adults is not reportable** unless a minor witnessed it. Getting these wrong looks careless to domain experts.
- **Medicaid coder** picks from a small **embedded CPT table** (core set: H2027, T1017, 90832, 90834, 90837, 96112, H0036) with rates and 15-minute unit definitions — do **not** let the model invent codes.
- **Case note drafter** is the only frontier-model call. Output is short (1–3 sentences/field) but must read like a real LCSW wrote it (trauma-informed, strengths-based). Takes scrubbed dictation + classifier decisions + reporter flag as input.

## GMI MaaS integration

- OpenAI-compatible API. Base URL `https://api.gmi-serving.com`, bearer-token auth, standard chat-completions.
- **API key comes from the `GMI_MAAS_API_KEY` env var** injected into the AgentBox container at runtime. Never hardcode it.
- Suggested tiers (exact IDs vary by catalog at hackathon time): classifier → DeepSeek Flash / Qwen-small; reporter → Qwen3-Next / DeepSeek-V4 class; Medicaid → Qwen3 Coder; case note → Claude Sonnet 4.6 / Opus. The exact split matters less than being able to defend the spread on stage.

## Trinity data contract

Frontend and the AgentBox listing both depend on a stable shape:

- **case_note**: `format` (SOAP|GIRP) + matching fields (SOAP: subjective/objective/assessment/plan; GIRP: goal/intervention/response/plan).
- **reporter_flag**: `triggered` (bool), `category` (child_abuse_neglect|suicidal_ideation|self_harm|domestic_violence|title_ix|none), `confidence` (0–1), quoted triggering `snippet`, `state`, `timeline_hours`, and a draft filing narrative when triggered for abuse.
- **medicaid**: `billable` (bool), `cpt_code`, `description`, `units` (int), `estimated_reimbursement_usd`, justification note.
- **Parent object** also carries: student token, session date, total elapsed ms, and list of models used (with per-model token counts — needed for the live cost meter). Elapsed-ms + models-used feed the hero timer and the model-attribution panel.
- **Edit capture** (flywheel): on sign, diff `draft → final` per artifact and record `{input_tokens, model_used, draft, final, edit_distance, artifact_type}`. In-memory for the demo; the shape is what matters. See "Model improvement" below.

## Standout layer (build AFTER the spine runs end-to-end)

This layer makes the existing Trinity *legible* to each judge — it adds no product surface area. Full detail in `SPEC.md` §17–18.

- **Tier 0** — text one real LCSW before the event (credibility for Q&A).
- **Tier 1 (do all three, ~2h, slot into the Production-UI phase):** (1) **live cost meter** — "$0.04 this run vs $0.19 all-frontier", from real token counts × MaaS prices (the GMI-judge move); (2) **employee timecard** — aggregate "sessions documented · $ recovered · hours saved" panel that reframes a tool as a *hire* (the theme); (3) **visible PII scrubbing** — show raw → `[PERSON_A]` → re-injected, so FERPA is a visual not a claim.
- **Tier 2 (stretch):** (4) reporter check **escalates to the frontier model when a trigger fires** (answers "why is the safety step on a cheap model?"); (5) flash the embedded **CPT table / CA ruleset** — the real moat is the data, not the prompts.

## Model improvement — the data flywheel

Do **not** train/fine-tune during the hackathon (no data, no time, and it undercuts the GMI hosted-routing story). Instead build the **capture**: the human-signature step (required for liability anyway) becomes labeled training data — every `draft → final` edit is a proprietary, LCSW-corrected preference pair no foundation lab has. Roadmap: distill/fine-tune **Nemotron** (ships open weights + recipes) on the accumulated edits so the case-note drafter migrates from a frontier model down to a fine-tuned Nemotron Super at lower cost/latency over time — the $0.04/run *drifts down* as quality drifts up. This is the compounding-moat pitch; capture is cheap (~30–45 min), the training is roadmap.

## Frontend layout

Single page: hero band (run-time counter vs "~90 min manual" baseline) over two columns. Left = input (textarea, 3 quick-load scenario buttons, txt/pdf drop zone, run button). Right = three artifact cards (Case Note / Reporter / Medicaid) that fade in with a checkmark as each sub-agent completes (poll-driven progressive render), plus a model+latency attribution panel below. Every artifact footer carries a **"DRAFT — Requires [name], LCSW signature"** stamp. Two accent colors only: calm green (success), alert red (reporter trigger).

## Scope discipline (do NOT build)

Authentication/user management, real DB persistence, streaming responses, a 4th sub-agent, a *trained/fine-tuned* model (build the flywheel *capture* only — see below), or multi-state reporter law. **Working ugly beats broken pretty** — ship the deployed container + end-to-end happy path first; never refactor before the demo runs end-to-end; never push AgentBox deployment to the last hour.

## Demo data

Three pre-canned scenarios designed for range: (1) possible neglect → child_abuse_neglect flag + draft SCAR; (2) routine IEP check-in → no flag, billable; (3) SI crisis → SI flag with safety planning **not** CPS, no Medicaid. Inputs must read like a stressed professional dictating (abbreviations, partial sentences, switching students mid-thought) — polished prose loses the room. Warm the cache by running each once before stage time.
