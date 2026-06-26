"""Shared plumbing for the four sub-agents: a validate-and-retry wrapper around
``gmi.complete`` that degrades gracefully instead of raising.

Contract for every agent:
  1. Ask the model for structured JSON (``json_schema=True``).
  2. Validate/coerce the parsed object against the Trinity sub-shape.
  3. On malformed/invalid output, retry ONCE with a repair instruction.
  4. If still bad, fall back to a safe degraded result — NEVER raise. One bad
     field must not 500 the whole run.
"""

from __future__ import annotations

import logging
from typing import Any, Callable, Dict, Optional, Tuple

import gmi  # backend/ is on sys.path (app.py imports jobs/gmi/pii bare)

logger = logging.getLogger("casescribe.agents")

# A validator takes the parsed model object and returns a cleaned sub-shape dict,
# or raises ValueError if the object can't be repaired into a valid shape.
Validator = Callable[[Any], Dict[str, Any]]
# A fallback produces a safe degraded sub-shape with no model input.
Fallback = Callable[[], Dict[str, Any]]


def call_json(
    step: str,
    system: str,
    user: str,
    *,
    temperature: float,
    validate: Validator,
    fallback: Fallback,
    max_tokens: Optional[int] = None,
    repair_hint: str = (
        "Your previous reply was not valid JSON for the required schema. "
        "Reply again with ONLY a single JSON object matching the schema exactly."
    ),
) -> Tuple[Dict[str, Any], Any]:
    """Run ``step`` with one validate-and-retry, then degrade gracefully.

    Returns ``(clean_subshape, model_call)``. ``model_call`` is always the most
    recent :class:`gmi.ModelCall` so the cost meter still counts the spend even
    when the output had to be repaired or fell back.
    """
    attempt_user = user
    last_call: Any = None
    for attempt in range(2):
        try:
            out = gmi.complete(
                step,
                system,
                attempt_user,
                temperature=temperature,
                json_schema=True,
                max_tokens=max_tokens,
            )
        except Exception as exc:  # network/SDK/whatever — degrade, don't crash
            logger.warning("step=%s call raised on attempt %d: %r", step, attempt, exc)
            break

        last_call = out.get("call")
        content = out.get("content")
        if isinstance(content, dict):
            try:
                return validate(content), last_call
            except (ValueError, KeyError, TypeError) as exc:
                logger.warning(
                    "step=%s invalid sub-shape on attempt %d: %r", step, attempt, exc
                )
        else:
            logger.warning(
                "step=%s did not return a JSON object on attempt %d (got %s)",
                step, attempt, type(content).__name__,
            )
        # Append a repair instruction for the retry.
        attempt_user = f"{user}\n\n{repair_hint}"

    logger.warning("step=%s degrading to safe fallback after retries", step)
    if last_call is None:
        # No usable call happened; synthesise a zero-cost record so the Trinity
        # still documents that the step ran.
        last_call = gmi.ModelCall(step, gmi.model_for(step), 0, 0, 0)
    return fallback(), last_call


# --------------------------------------------------------------------------- #
# Small coercion helpers shared by validators                                 #
# --------------------------------------------------------------------------- #


def as_bool(v: Any, default: bool = False) -> bool:
    if isinstance(v, bool):
        return v
    if isinstance(v, (int, float)):
        return bool(v)
    if isinstance(v, str):
        return v.strip().lower() in ("true", "yes", "1", "y")
    return default


def as_float(v: Any, default: float = 0.0) -> float:
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


def as_int(v: Any, default: Optional[int] = None) -> Optional[int]:
    if v is None:
        return default
    try:
        return int(round(float(v)))
    except (TypeError, ValueError):
        return default


def as_str(v: Any, default: str = "") -> str:
    if v is None:
        return default
    return v if isinstance(v, str) else str(v)


def clamp01(v: float) -> float:
    return max(0.0, min(1.0, v))
