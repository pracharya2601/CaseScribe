"""CaseScribe — GMI Cloud MaaS client.

Owns the OpenAI-compatible wrapper around GMI's MaaS endpoint, the per-sub-agent
model routing config, per-call token/latency capture, and the live cost meter
(actual spend vs. an "all-frontier" counterfactual).

Design constraints (from the casescribe-gmi + casescribe-platform skills):

* OpenAI-compatible — base URL ``GMI_MAAS_BASE_URL`` (default
  ``https://api.gmi-serving.com/v1``), bearer ``GMI_MAAS_API_KEY``.
* Native API uses bare ``provider/Model-Name`` IDs — a ``gmi/`` prefix is
  liteLLM-only and is stripped here.
* The module MUST import and be usable with **no** API key and **no** ``openai``
  SDK installed, so the pipeline agent can build/test against a mock. The
  ``openai`` import is therefore lazy, and a mock responder can be injected.

Public surface used by the pipeline:

    MODELS                       # step -> model-id routing map
    PRICES                       # model-id -> {"in": $/1M, "out": $/1M}
    ModelCall                    # dataclass -> models_used record
    complete(step, system, user, *, temperature=..., json_schema=None) -> dict
    cost_summary(model_calls) -> {"actual_usd": ..., "all_frontier_usd": ...}
    startup_validate() -> dict   # warn (don't crash) on unknown model IDs
    set_client(client)           # inject a (mock) OpenAI-compatible client
    register_mock_responder(fn)  # inject a pure-python responder (no SDK needed)
"""

from __future__ import annotations

import json
import logging
import os
import time
from dataclasses import asdict, dataclass
from typing import Any, Callable, Iterable, Optional

logger = logging.getLogger("casescribe.gmi")

# --------------------------------------------------------------------------- #
# Configuration: base URL, auth, model routing                                #
# --------------------------------------------------------------------------- #

DEFAULT_BASE_URL = "https://api.gmi-serving.com/v1"


def base_url() -> str:
    """Resolve the MaaS base URL at call time (env may be injected late)."""
    return os.environ.get("GMI_MAAS_BASE_URL", DEFAULT_BASE_URL).rstrip("/")


def api_key() -> Optional[str]:
    return os.environ.get("GMI_MAAS_API_KEY")


# Bounded networking so a reachable-but-slow endpoint (flaky venue WiFi, a bad
# key against the real api.gmi-serving.com) fails fast instead of hanging the
# demo. A connection-refused dead endpoint already degrades in ~8s; the slow
# case is what needs an explicit per-call timeout. Both env-overridable.
DEFAULT_TIMEOUT_SECONDS = 20.0
DEFAULT_MAX_RETRIES = 1


def timeout_seconds() -> float:
    """Per-call timeout (GMI_TIMEOUT_SECONDS, default 20s)."""
    raw = os.environ.get("GMI_TIMEOUT_SECONDS")
    if raw is None or not raw.strip():
        return DEFAULT_TIMEOUT_SECONDS
    try:
        val = float(raw)
        if val > 0:
            return val
        logger.warning("GMI_TIMEOUT_SECONDS must be > 0; using default %.1fs.", DEFAULT_TIMEOUT_SECONDS)
    except ValueError:
        logger.warning("Ignoring malformed GMI_TIMEOUT_SECONDS=%r; using default %.1fs.", raw, DEFAULT_TIMEOUT_SECONDS)
    return DEFAULT_TIMEOUT_SECONDS


def max_retries() -> int:
    """SDK retry count (GMI_MAX_RETRIES, default 1). Worst-case wall time for a
    single hung call is roughly timeout_seconds() * (max_retries() + 1)."""
    raw = os.environ.get("GMI_MAX_RETRIES")
    if raw is None or not raw.strip():
        return DEFAULT_MAX_RETRIES
    try:
        val = int(raw)
        if val >= 0:
            return val
        logger.warning("GMI_MAX_RETRIES must be >= 0; using default %d.", DEFAULT_MAX_RETRIES)
    except ValueError:
        logger.warning("Ignoring malformed GMI_MAX_RETRIES=%r; using default %d.", raw, DEFAULT_MAX_RETRIES)
    return DEFAULT_MAX_RETRIES


# Default model IDs aligned to the live GMI AgentBox catalog (2026-06-26). One
# model per sub-agent; the cheap->frontier spread is the on-stage cost story.
# startup_validate() logs a warning for any id missing from GET /v1/models, so
# the AgentBox container logs will flag a drifted id without crashing the run.
_DEFAULT_MODELS: dict[str, str] = {
    "classifier": "deepseek-ai/DeepSeek-V4-Flash",      # cheap triage
    "reporter": "zai-org/GLM-5.2-FP8",                  # mid, strong-instruct, T=0
    "medicaid": "Qwen/Qwen3.6-Max-Preview",             # structured coding judgment
    "casenote": "anthropic/claude-opus-4.8",            # frontier clinical draft
    # Tier-2: reporter check escalates here when a trigger fires.
    "reporter_escalation": "anthropic/claude-opus-4.8",
}

# The "frontier" step whose rate defines the all-frontier counterfactual.
FRONTIER_STEP = "casenote"


def _strip_litellm_prefix(model_id: str) -> str:
    """Native api.gmi-serving.com uses bare ``provider/Model``; drop ``gmi/``."""
    return model_id[len("gmi/"):] if model_id.startswith("gmi/") else model_id


def _parse_models_override(raw: str) -> dict[str, str]:
    """Parse ``GMI_MODELS``.

    Accepts either JSON (``{"classifier": "id", ...}``) or a compact
    ``step=id,step=id`` form. Unknown keys are kept (forward-compatible).
    """
    raw = raw.strip()
    if not raw:
        return {}
    try:
        data = json.loads(raw)
        if isinstance(data, dict):
            return {str(k): str(v) for k, v in data.items()}
        logger.warning("GMI_MODELS JSON was not an object; ignoring: %r", raw)
        return {}
    except json.JSONDecodeError:
        pass
    out: dict[str, str] = {}
    for pair in raw.split(","):
        if "=" not in pair:
            continue
        k, v = pair.split("=", 1)
        k, v = k.strip(), v.strip()
        if k and v:
            out[k] = v
    return out


def _build_models() -> dict[str, str]:
    merged = dict(_DEFAULT_MODELS)
    override = os.environ.get("GMI_MODELS", "")
    if override:
        parsed = _parse_models_override(override)
        if parsed:
            logger.info("GMI_MODELS override applied for steps: %s", sorted(parsed))
            merged.update(parsed)
    return {step: _strip_litellm_prefix(mid) for step, mid in merged.items()}


#: step -> resolved model id (env-overridable via GMI_MODELS)
MODELS: dict[str, str] = _build_models()


def model_for(step: str) -> str:
    try:
        return MODELS[step]
    except KeyError:
        raise KeyError(
            f"No model configured for step {step!r}. "
            f"Known steps: {sorted(MODELS)}"
        ) from None


def reload_models() -> dict[str, str]:
    """Re-read env (useful after late env injection / in tests)."""
    global MODELS
    MODELS = _build_models()
    return MODELS


# --------------------------------------------------------------------------- #
# Cost meter: representative prices ($/1M tokens), env-overridable             #
# --------------------------------------------------------------------------- #
#
# Per-model token prices ($/1M tokens), taken from the GMI AgentBox console
# model cards (2026-06-26) — these are the REAL published rates, so the live
# cost meter is accurate. Override via the GMI_PRICES env var (JSON:
#   {"anthropic/claude-opus-4.8": {"in": 5.0, "out": 25.0}, ...}).

_DEFAULT_PRICES: dict[str, dict[str, float]] = {
    # classifier — cheap/fast triage
    "deepseek-ai/DeepSeek-V4-Flash": {"in": 0.098, "out": 0.196},
    # reporter — mid, strong instruct (T=0)
    "zai-org/GLM-5.2-FP8": {"in": 0.979, "out": 3.08},
    # medicaid — structured coding judgment
    "Qwen/Qwen3.6-Max-Preview": {"in": 1.30, "out": 7.80},
    # casenote + reporter escalation — frontier clinical draft
    "anthropic/claude-opus-4.8": {"in": 5.00, "out": 25.00},
    # other catalog models (handy if GMI_MODELS is overridden in the wizard)
    "openai/gpt-5.5": {"in": 5.00, "out": 30.00},
    "google/gemini-3.5-flash": {"in": 1.50, "out": 9.00},
}

# Fallback rate used when a model has no entry at all (priced as frontier so we
# never under-report actual spend).
_FALLBACK_PRICE = {"in": 5.00, "out": 25.00}


def _build_prices() -> dict[str, dict[str, float]]:
    prices = {k: dict(v) for k, v in _DEFAULT_PRICES.items()}
    raw = os.environ.get("GMI_PRICES", "").strip()
    if raw:
        try:
            override = json.loads(raw)
            for mid, p in override.items():
                entry = prices.get(mid, {})
                entry.update({k: float(p[k]) for k in ("in", "out") if k in p})
                prices[mid] = entry
            logger.info("GMI_PRICES override applied for: %s", sorted(override))
        except (json.JSONDecodeError, TypeError, ValueError) as exc:
            logger.warning("Ignoring malformed GMI_PRICES (%s): %r", exc, raw)
    return prices


#: model-id -> {"in": $/1M tokens, "out": $/1M tokens}  (representative estimates)
PRICES: dict[str, dict[str, float]] = _build_prices()


def _log_price_assumption() -> None:
    parts = [
        f"{mid} est. ${p['in']:.2f}/M in, ${p['out']:.2f}/M out"
        for mid, p in PRICES.items()
    ]
    logger.info(
        "Cost-meter price ASSUMPTIONS (representative estimates, not official "
        "GMI quotes; override via GMI_PRICES): %s",
        "; ".join(parts),
    )


# Log the assumption once at import so the cost number is always traceable.
_log_price_assumption()


def price_for(model_id: str) -> dict[str, float]:
    return PRICES.get(model_id, _FALLBACK_PRICE)


def _call_cost_usd(model_id: str, input_tokens: int, output_tokens: int) -> float:
    p = price_for(model_id)
    return (input_tokens * p["in"] + output_tokens * p["out"]) / 1_000_000.0


# --------------------------------------------------------------------------- #
# ModelCall record (one entry in the Trinity `models_used` array)             #
# --------------------------------------------------------------------------- #


@dataclass
class ModelCall:
    step: str
    model: str
    latency_ms: int
    input_tokens: int
    output_tokens: int

    def as_dict(self) -> dict[str, Any]:
        return asdict(self)


def _call_to_dict(call: "ModelCall | dict[str, Any]") -> dict[str, Any]:
    return call.as_dict() if isinstance(call, ModelCall) else dict(call)


# --------------------------------------------------------------------------- #
# Client management — lazy OpenAI SDK, injectable mock                         #
# --------------------------------------------------------------------------- #

_client: Any = None  # cached live client
_mock_responder: Optional[Callable[..., str]] = None


def set_client(client: Any) -> None:
    """Inject an OpenAI-compatible client (real or mock). Pass None to reset."""
    global _client
    _client = client


def register_mock_responder(fn: Optional[Callable[..., str]]) -> None:
    """Inject a pure-python responder so the pipeline can run with no SDK/key.

    ``fn(step, system, user, *, model, json_schema, temperature) -> str`` must
    return the assistant message content (a JSON string when structured output
    was requested). Pass None to clear.
    """
    global _mock_responder
    _mock_responder = fn


def has_live_client() -> bool:
    return _client is not None or (api_key() is not None)


def _get_client() -> Any:
    """Lazily construct (and cache) the OpenAI SDK client.

    Raises a clear error if neither an injected client, a mock responder, nor a
    usable (key + SDK) live configuration is available — but only when actually
    called, never at import time.
    """
    global _client
    if _client is not None:
        return _client
    key = api_key()
    if not key:
        raise RuntimeError(
            "GMI_MAAS_API_KEY is not set and no client/mock was injected. "
            "Call set_client(...) or register_mock_responder(...) for offline use."
        )
    try:
        from openai import OpenAI  # lazy: keeps module importable without SDK
    except ImportError as exc:  # pragma: no cover - env dependent
        raise RuntimeError(
            "The `openai` package is required for live GMI calls "
            "(pip install openai)."
        ) from exc
    to = timeout_seconds()
    retries = max_retries()
    # Bounded timeout + retries so a slow/stalled endpoint fails fast (worst
    # case ~ to * (retries + 1)) instead of hanging the demo. The timeout also
    # bounds startup_validate()'s GET /v1/models, which shares this client.
    _client = OpenAI(
        base_url=base_url(),
        api_key=key,
        timeout=to,
        max_retries=retries,
    )
    logger.info(
        "GMI MaaS client initialised for base_url=%s (timeout=%.1fs, max_retries=%d)",
        base_url(), to, retries,
    )
    return _client


# --------------------------------------------------------------------------- #
# complete() — the one call the pipeline uses                                 #
# --------------------------------------------------------------------------- #


def complete(
    step: str,
    system: str,
    user: str,
    *,
    temperature: float = 0.2,
    json_schema: Any = None,
    max_tokens: Optional[int] = None,
) -> dict[str, Any]:
    """Route a prompt to the model for ``step`` and capture usage + latency.

    Parameters
    ----------
    step:
        Routing key (classifier / reporter / medicaid / casenote /
        reporter_escalation). Selects the model via ``MODELS``.
    system, user:
        System and user message contents.
    temperature:
        Sampling temperature. Reporter checks should pass ``0``.
    json_schema:
        Truthy => request structured JSON output (``response_format`` =
        ``json_object``) and parse the content with ``json.loads``. May be an
        actual JSON-schema dict (passed through for SDKs that support it) or
        simply ``True`` to request a JSON object.
    max_tokens:
        Optional output cap.

    Returns
    -------
    dict with:
        ``content`` — parsed object (dict/list) if JSON was requested and parses,
                      else the raw text string.
        ``text``    — raw assistant message text.
        ``call``    — a :class:`ModelCall` for the ``models_used`` array.
    """
    model = model_for(step)
    want_json = bool(json_schema)

    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]

    kwargs: dict[str, Any] = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
    }
    if max_tokens is not None:
        kwargs["max_tokens"] = max_tokens
    if want_json:
        # OpenAI-compatible JSON mode. GMI honours `json_object`; a full schema
        # is only used by SDKs that support `json_schema`, so we keep it simple
        # and robust here.
        kwargs["response_format"] = {"type": "json_object"}

    start = time.perf_counter()

    # Offline / mock path: no network, no SDK required.
    if _client is None and _mock_responder is not None and api_key() is None:
        text = _mock_responder(
            step,
            system,
            user,
            model=model,
            json_schema=json_schema,
            temperature=temperature,
        )
        latency_ms = int((time.perf_counter() - start) * 1000)
        in_tok = _approx_tokens(system) + _approx_tokens(user)
        out_tok = _approx_tokens(text)
        call = ModelCall(step, model, latency_ms, in_tok, out_tok)
        return {"content": _maybe_json(text, want_json), "text": text, "call": call}

    client = _get_client()
    resp = client.chat.completions.create(**kwargs)
    latency_ms = int((time.perf_counter() - start) * 1000)

    text = ""
    try:
        text = resp.choices[0].message.content or ""
    except (AttributeError, IndexError, TypeError):
        text = ""

    usage = getattr(resp, "usage", None)
    in_tok = _usage_field(usage, "prompt_tokens", system, user)
    out_tok = _usage_field(usage, "completion_tokens", text)

    call = ModelCall(step, model, latency_ms, int(in_tok), int(out_tok))
    logger.debug(
        "step=%s model=%s latency=%dms in=%d out=%d",
        step, model, latency_ms, in_tok, out_tok,
    )
    return {"content": _maybe_json(text, want_json), "text": text, "call": call}


def _maybe_json(text: str, want_json: bool) -> Any:
    if not want_json:
        return text
    try:
        return json.loads(text)
    except (json.JSONDecodeError, TypeError):
        logger.warning("Expected JSON output but parse failed; returning raw text.")
        return text


def _approx_tokens(text: Any) -> int:
    """Rough token estimate (~4 chars/token) for the mock path only."""
    s = text if isinstance(text, str) else str(text)
    return max(1, len(s) // 4)


def _usage_field(usage: Any, name: str, *fallback_text: str) -> int:
    """Read a token count from the API ``usage`` object, with a safe fallback."""
    if usage is not None:
        val = getattr(usage, name, None)
        if val is None and isinstance(usage, dict):
            val = usage.get(name)
        if isinstance(val, (int, float)):
            return int(val)
    return sum(_approx_tokens(t) for t in fallback_text)


# --------------------------------------------------------------------------- #
# Cost summary — actual vs all-frontier counterfactual                        #
# --------------------------------------------------------------------------- #


def cost_summary(
    model_calls: Iterable["ModelCall | dict[str, Any]"],
) -> dict[str, float]:
    """Compute the live cost meter.

    ``actual_usd``       — each call priced at its own model's rate.
    ``all_frontier_usd`` — every token priced at the case-note (frontier) rate;
                           the counterfactual that makes the tier story land
                           ("$0.04 vs $0.19").
    """
    frontier_model = MODELS.get(FRONTIER_STEP, _DEFAULT_MODELS[FRONTIER_STEP])
    actual = 0.0
    frontier = 0.0
    for raw in model_calls:
        c = _call_to_dict(raw)
        in_tok = int(c.get("input_tokens", 0) or 0)
        out_tok = int(c.get("output_tokens", 0) or 0)
        model = c.get("model", frontier_model)
        actual += _call_cost_usd(model, in_tok, out_tok)
        frontier += _call_cost_usd(frontier_model, in_tok, out_tok)
    return {
        "actual_usd": round(actual, 6),
        "all_frontier_usd": round(frontier, 6),
        "frontier_model": frontier_model,
    }


# --------------------------------------------------------------------------- #
# Startup validation — warn (don't crash) on unknown model IDs                #
# --------------------------------------------------------------------------- #


def startup_validate() -> dict[str, Any]:
    """Call ``GET /v1/models`` and warn if any configured ID is not live.

    Never raises on a missing/unreachable catalog — the demo must boot even if
    discovery is flaky. Returns a small report dict.
    """
    configured = sorted(set(MODELS.values()))
    report: dict[str, Any] = {
        "checked": False,
        "configured": configured,
        "available": [],
        "missing": [],
        "warning": None,
    }

    if _client is None and api_key() is None:
        msg = (
            "Skipping GMI model validation: no client/key configured "
            "(offline/mock mode)."
        )
        logger.warning(msg)
        report["warning"] = msg
        return report

    try:
        client = _get_client()
        listing = client.models.list()
        live_ids = {
            getattr(m, "id", None) or (m.get("id") if isinstance(m, dict) else None)
            for m in listing
        }
        live_ids.discard(None)
    except Exception as exc:  # noqa: BLE001 - intentionally non-fatal
        msg = f"GMI model discovery failed ({exc!r}); continuing with configured IDs."
        logger.warning(msg)
        report["warning"] = msg
        return report

    report["checked"] = True
    report["available"] = sorted(live_ids)
    missing = [mid for mid in configured if mid not in live_ids]
    report["missing"] = missing
    if missing:
        msg = (
            f"Configured model IDs not found in live GMI catalog: {missing}. "
            f"Routing will still attempt them; update GMI_MODELS if calls 404."
        )
        logger.warning(msg)
        report["warning"] = msg
    else:
        logger.info("All %d configured GMI model IDs present in live catalog.", len(configured))
    return report


# --------------------------------------------------------------------------- #
# Smoke test — only does network work when a real key is present              #
# --------------------------------------------------------------------------- #


def _smoke() -> int:
    logging.basicConfig(
        level=logging.INFO,
        format="%(levelname)s %(name)s: %(message)s",
    )
    print("base_url:", base_url())
    print("MODELS:", json.dumps(MODELS, indent=2))
    print("PRICES:", json.dumps(PRICES, indent=2))

    if not has_live_client():
        # Offline: prove the mockable interface works end-to-end.
        print("\nNo GMI_MAAS_API_KEY set — running MOCK smoke test.\n")
        register_mock_responder(
            lambda step, system, user, **kw: json.dumps(
                {"format": "SOAP", "billable": True, "echo": user[:40]}
            )
        )
        out = complete(
            "classifier",
            "You are a triage classifier.",
            "Patient discussed mood and sleep for 45 minutes.",
            json_schema=True,
        )
        call = out["call"]
        print("ModelCall:", json.dumps(call.as_dict(), indent=2))
        print("content:", out["content"])
        # Simulate a full session's worth of calls for the cost meter.
        calls = [
            call,
            ModelCall("reporter", MODELS["reporter"], 800, 1200, 300),
            ModelCall("medicaid", MODELS["medicaid"], 900, 1500, 200),
            ModelCall("casenote", MODELS["casenote"], 2200, 2000, 900),
        ]
        print("cost_summary:", json.dumps(cost_summary(calls), indent=2))
        register_mock_responder(None)
        return 0

    # Live path: route a trivial prompt to the classifier model.
    print("\nGMI_MAAS_API_KEY detected — running LIVE smoke test.\n")
    validation = startup_validate()
    print("startup_validate:", json.dumps(validation, indent=2, default=str))
    out = complete(
        "classifier",
        "You are a terse classifier. Reply with a JSON object.",
        "Classify this note format as SOAP or GIRP: 'Client reported anxiety; "
        "plan to continue weekly CBT.' Respond as {\"format\": \"...\"}.",
        json_schema=True,
        max_tokens=64,
    )
    call = out["call"]
    print("ModelCall:", json.dumps(call.as_dict(), indent=2))
    print("content:", out["content"])
    print("cost_summary:", json.dumps(cost_summary([call]), indent=2))
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(_smoke())
