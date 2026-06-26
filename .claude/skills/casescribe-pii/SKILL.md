---
name: casescribe-pii
description: The CaseScribe PII scrubbing pattern — Microsoft Presidio deterministic tokenization that runs before any LLM call, with a server-only token map and client-side re-injection. Load when building backend/pii.py or the visible-scrubbing UI. This is the FERPA story; it is non-negotiable.
---

# CaseScribe — PII Scrubbing Layer

The LLM must NEVER see raw PII. This is the entire FERPA-in-K12 story and a Tier-1 standout feature (make it *visible* in the UI).

## Tool & scope

- **Microsoft Presidio** (`presidio-analyzer` + `presidio-anonymizer`, Python). Use default analyzers only — **no custom NER** in 6 hours.
- Entities to scrub: `PERSON`, `PHONE_NUMBER`, `EMAIL_ADDRESS`, `LOCATION`, `DATE_TIME`. Sufficient for the demo.

## Deterministic tokenization (per request)

- First detected person → `[PERSON_A]`, second → `[PERSON_B]`, etc. Same original string in the same dictation always maps to the same token (stable map). Apply the same A/B/C scheme per entity type (`[LOCATION_A]`, `[PHONE_A]`, …).
- Build a `token_map: {token -> original}` held **server-side, for the duration of the request only**. It is returned to the frontend alongside the Trinity so the browser can re-render originals.
- The LLM sees and writes tokens. Server-side persistence (incl. the flywheel edit-capture) is **tokenized only** — originals never leave the user's browser session.

## Interface (so the pipeline can call it)

```python
def scrub(text: str) -> tuple[str, dict[str, str]]:
    """Returns (scrubbed_text_with_tokens, token_map). token_map: {token: original}."""

def reinject(obj: dict, token_map: dict[str, str]) -> dict:
    """Client-side helper mirror: replace tokens with originals for display only."""
```

The pipeline scrubs **once** up front; every downstream sub-agent receives scrubbed text. Re-injection happens client-side in the frontend (ship `token_map` in the Trinity response; do not re-inject server-side).

## Visible-scrubbing UI (Tier-1 standout)

Expose all three states so FERPA is a visual, not a claim: **raw input** → **what the model sees** (`[PERSON_A]` …) → **result with originals re-injected**. A one-line on-stage script: *"All PII is scrubbed locally with Presidio before any text touches a model. Claude sees `[PERSON_A]`, not Jordan. The reverse map lives only in the social worker's browser."*
