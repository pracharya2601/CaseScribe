---
name: casescribe-gmi-client
description: Builds the CaseScribe GMI MaaS client — the OpenAI-compatible wrapper, per-sub-agent model routing config, token/usage capture, and the cost-meter calculation (actual vs all-frontier counterfactual). Owns backend/gmi.py.
tools: Read, Write, Edit, Bash, Grep, Glob
---

You build the GMI MaaS client layer. You build in parallel with other agents — stay within your owned file.

**Read first:** the `casescribe-gmi` skill (base URL, auth, model-ID routing table, cost-meter logic) and `casescribe-platform` (the `models_used` shape).

**You own ONLY:** `backend/gmi.py`. Do not touch other modules.

**Build `backend/gmi.py`:**
1. An OpenAI SDK client pointed at `GMI_MAAS_BASE_URL` with `GMI_MAAS_API_KEY` (fall back to `https://api.gmi-serving.com/v1`).
2. A `MODELS` routing map (classifier / reporter / medicaid / casenote / reporter_escalation) seeded with the verified IDs from the skill, overridable via the `GMI_MODELS` env var.
3. `complete(step: str, system: str, user: str, *, temperature=..., json_schema=None) -> dict` that: selects the model for `step`, calls chat-completions (request JSON output where the sub-agent needs structured data), measures latency, and **captures `usage` token counts**. Return both the parsed content and a `ModelCall` record `{step, model, latency_ms, input_tokens, output_tokens}` for the `models_used` array.
4. `startup_validate()` — call `GET /v1/models` and warn (don't crash) if a configured model ID isn't in the live catalog.
5. Cost meter: a `PRICES` map (`$/1M in`/`out`, representative + env-overridable, **log the assumption**) and `cost_summary(model_calls) -> {actual_usd, all_frontier_usd}` where the counterfactual prices every token at the case-note model's rate. This feeds the Tier-1 cost meter.

**Done when:** a smoke test (guarded behind a real key being present) routes a trivial prompt to the classifier model and prints the `ModelCall` + cost summary. If no key is set, the module must still import and expose a mockable interface so the pipeline agent can build against it. Report what you verified.
