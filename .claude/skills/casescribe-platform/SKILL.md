---
name: casescribe-platform
description: The CaseScribe build constitution — the container/service architecture, the AgentBox async job contract, env-var conventions, the Trinity data contract, module/file ownership map, and scope discipline. Load this before building ANY CaseScribe component so every parallel builder agrees on the same interfaces.
---

# CaseScribe — Platform Contract

This is the single source of truth for the shared interfaces. Every builder agent reads this so independently-built modules snap together. Rationale lives in `SPEC.md` at repo root; this skill is the binding contract.

## Architecture

Two services, **one Docker container**, deployed to GMI **AgentBox**:

- **Backend** — Python + FastAPI. Implements the AgentBox async job pattern (below). Job state is **in-memory** (a dict); no database. Listens on **port 8080**.
- **Frontend** — React + Vite, built to static assets, **served by the same FastAPI app** (mount the built `dist/` as static files). Submits jobs, polls, renders the Trinity progressively.

## AgentBox async job contract (VERIFIED — do not invent your own)

Cloud gateways 504 on long-open connections, so processing is submit-then-poll:

| Route | Method | Returns |
|---|---|---|
| `/health` | GET | `200 {"status":"ok"}` |
| `/run` | POST | `202 {"job_id": "<uuid>"}` — enqueue, return immediately |
| `/jobs/{job_id}` | GET | job status object (below) |

Job status object:
```json
{
  "job_id": "uuid",
  "status": "pending | running | completed | failed",
  "result": { /* Trinity object, present only when completed */ },
  "error": "string, present only when failed",
  "stage": "scrubbing | classifying | drafting | done",  // for progressive UI
  "models": [ {"step": "...", "model": "...", "latency_ms": 0, "input_tokens": 0, "output_tokens": 0} ]
}
```
The frontend polls `/jobs/{id}` (~750ms) and renders each artifact as it appears. The `stage` and `models` fields drive the progress UI, the model-attribution panel, and the live cost meter.

## Environment variables (VERIFIED — AgentBox auto-injects these; never hardcode)

- `GMI_MAAS_API_KEY` — bearer token for MaaS.
- `GMI_MAAS_BASE_URL` — OpenAI-compatible endpoint (defaults to `https://api.gmi-serving.com/v1`).
- `GMI_MODELS` — target model ID(s) from the listing wizard.
- Local dev: read the same vars from a `.env` (gitignored). Provide a `.env.example`.

## Trinity data contract (frontend + backend MUST agree)

```jsonc
{
  "student_token": "[PERSON_A]",
  "session_date": "2026-06-26",
  "elapsed_ms": 47000,
  "models_used": [ {"step":"classifier","model":"...","latency_ms":0,"input_tokens":0,"output_tokens":0} ],

  "case_note": {
    "format": "SOAP | GIRP",
    // SOAP: subjective/objective/assessment/plan  |  GIRP: goal/intervention/response/plan
    "fields": { "subjective": "...", "objective": "...", "assessment": "...", "plan": "..." }
  },

  "reporter_flag": {
    "triggered": false,
    "category": "child_abuse_neglect | suicidal_ideation | self_harm | domestic_violence | title_ix | none",
    "confidence": 0.0,
    "snippet": "exact quoted text that triggered",
    "state": "CA",
    "timeline_hours": 36,
    "draft_filing": "narrative, present only for abuse/neglect categories",
    "regex_hit": false,        // belt-and-suspenders: did the keyword net also fire?
    "llm_hit": false
  },

  "medicaid": {
    "billable": true,
    "cpt_code": "90834",
    "code_type": "CPT | HCPCS",
    "description": "...",
    "units": 1,                // null for time-banded per-encounter CPT codes
    "estimated_reimbursement_usd": 89.64,
    "justification": "billing rationale"
  }
}
```

The flywheel edit-capture record (recorded on sign):
```jsonc
{ "artifact_type": "case_note|reporter_flag|medicaid", "model_used": "...",
  "draft": {...}, "final": {...}, "edit_distance": 0, "input_tokens": 0 }
```

## Module / file ownership (so parallel builders don't collide)

| Owner agent | Files it owns |
|---|---|
| `casescribe-backend` | `backend/app.py`, `backend/jobs.py`, `Dockerfile`, `.env.example`, `requirements.txt` |
| `casescribe-gmi-client` | `backend/gmi.py` (MaaS client + routing + token/cost tracking) |
| `casescribe-pii` | `backend/pii.py` |
| `casescribe-pipeline` | `backend/pipeline.py`, `backend/agents/*.py` (classifier, reporter, medicaid, casenote) |
| `casescribe-demo` | `backend/demo/scenarios.py` |
| `casescribe-frontend` | `frontend/**` |

Shared data tables (CPT, reporter rules) live in `backend/domain/` and come from the `casescribe-domain` skill — `casescribe-pipeline` writes them.

## Scope discipline (do NOT build)

No auth, no database, no streaming, no 4th sub-agent, no model training (build the flywheel *capture* only), no multi-state reporter law (California only). Working ugly beats broken pretty: ship `/health` + `/run` + `/jobs` returning a hardcoded Trinity stub FIRST, then fill in real logic. See `SPEC.md` §16.
