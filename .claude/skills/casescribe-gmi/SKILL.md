---
name: casescribe-gmi
description: Verified GMI Cloud MaaS facts for CaseScribe — base URL, auth, OpenAI compatibility, model discovery, the concrete per-sub-agent model-ID routing table, and how to compute the live cost meter. Load when building the GMI client, choosing models, or wiring the multi-model story.
---

# CaseScribe — GMI MaaS Integration (verified 2026-06-26)

All facts below were verified against `docs.gmicloud.ai`; citations in `SPEC.md`/research notes. Anything marked **UNVERIFIED** must be confirmed against the live console at build time.

## API basics

- **Base URL**: `https://api.gmi-serving.com/v1` (note the `/v1`). At runtime read `GMI_MAAS_BASE_URL`.
- **Auth**: `Authorization: Bearer <GMI_MAAS_API_KEY>`.
- **OpenAI-compatible** — use the OpenAI Python SDK directly:
  ```python
  from openai import OpenAI
  client = OpenAI(base_url=os.environ["GMI_MAAS_BASE_URL"], api_key=os.environ["GMI_MAAS_API_KEY"])
  ```
- **Model discovery**: `GET /v1/models` returns the live catalog. **Call this at startup to validate IDs** — the catalog drifts; do not trust a hardcoded list blindly.
- **Model string format**: native API uses bare `provider/Model-Name` (e.g. `anthropic/claude-sonnet-4.6`). A `gmi/` prefix is *liteLLM-only* — strip it when calling `api.gmi-serving.com` directly.

## Model routing — one model per sub-agent (verified IDs)

The tier spread is the on-stage narrative: ~70% of tokens on cheap models, frontier only for the final draft → ~$0.04/session. Put these in a config map, overridable via `GMI_MODELS`.

| Sub-agent | Tier | Default model ID | Why |
|---|---|---|---|
| **Classifier** | cheap/fast | `nvidia/NVIDIA-Nemotron-3-Nano-Omni` | Tiny triage output; using **Nemotron** here is the GMI-judge story. Fallback: `deepseek-ai/DeepSeek-V4-Flash`. |
| **Reporter check** | mid, strong instruct, **T=0** | `Qwen/Qwen3-Next-80B-A3B-Instruct` | Structured, instruction-following, safety-critical. Fallback: `deepseek-ai/DeepSeek-V4-Pro`. |
| **Medicaid coder** | code-strong mid | `Qwen/Qwen3-Coder-480B-A35B-Instruct-FP8` | CPT assignment is a structured lookup-with-judgment task. |
| **Case note** | frontier | `anthropic/claude-sonnet-4.6` | Clinical language quality; the one justified frontier spend. Upgrade option: `anthropic/claude-opus-4.5`. |
| **Reporter escalation** (Tier 2) | frontier | `anthropic/claude-sonnet-4.6` | Reporter check escalates here when any trigger fires — cheap when safe, frontier when it matters. |

> **Nemotron Super (~49B): UNVERIFIED** — not found in the live catalog. The spec's "Super" reference is dropped; use Nano (classifier) + Ultra only if you can confirm `nvidia/NVIDIA-Nemotron-3-Ultra` is available.

## Live cost meter (Tier-1 standout feature)

Per-model token prices are **not published in docs** (they live in the console per-model card). So:

- Maintain a `PRICES` map of `{model_id: {"in": $/1M, "out": $/1M}}` seeded with representative estimates, overridable via env. **Log the assumption** so the number is defensible ("estimated at $X/M tokens").
- Track `input_tokens`/`output_tokens` per call (from the API `usage` field) into the `models_used` array.
- Cost meter shows two numbers: **this run's actual** (sum over `models_used`) vs **all-frontier counterfactual** (same token counts priced entirely at the case-note model's rate). The delta is the headline: "$0.04 vs $0.19".

## Rate limits & credits

- LLMs limited by **TPM** (tokens/min). Default **Tier 1 = 1M TPM** at $0 spend — ample for a demo.
- **$5 free credits** for new users; some models free without a card. **Hackathon-specific credits: UNVERIFIED — ask the GMI organizers.**

## AgentBox deployment (for the deploy step)

- Container listens on **8080**; default compute **2 vCPU / 4 GB / 10 GiB ephemeral**.
- Register via the 5-step wizard: Basics & Template → Infrastructure (Docker image source + tier) → Networking (expose 8080) → Env Variables (TEXT/SECRET) → Review & Register.
- In Step 2 select **all four** sub-agent models so MaaS is authorized to route to each. Deployment path: **GMI CE Deployment + MaaS ON** (eligible for the Verified badge). Region: **US West**.
- Implement `POST /run` + `GET /jobs/{id}` (see `casescribe-platform`) — required for long-running processing.
