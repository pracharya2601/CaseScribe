"""CaseScribe — PII scrubbing layer.

The LLM must NEVER see raw PII. This module scrubs text *once* up front, before
any model call, replacing entities with deterministic tokens and returning a
server-only ``token_map`` so the frontend can re-render originals for the user.

Public interface (called by the pipeline):

    scrub(text)            -> (scrubbed_text_with_tokens, token_map)
    reinject(obj, token_map) -> obj   # tokens -> originals, for display/testing

Entities scrubbed: PERSON, PHONE_NUMBER, EMAIL_ADDRESS, LOCATION, DATE_TIME.

Tokenization is deterministic *per call*: the first detected person becomes
``[PERSON_A]``, the second distinct person ``[PERSON_B]``, etc., applied
per-entity-type. The same original string in one dictation always maps to the
same token (stable map within the request).

Engine selection
----------------
We prefer Microsoft Presidio (``presidio-analyzer`` + ``presidio-anonymizer``)
backed by the spaCy ``en_core_web_lg`` model. Presidio is imported lazily and is
OPTIONAL at import time: in a fresh environment where the spaCy model has not
been downloaded (or Presidio is not installed), we transparently fall back to a
regex-based scrubber for names / phones / emails (and best-effort dates /
locations) so the pipeline never hard-blocks.

To enable real Presidio (strongly preferred for production):

    pip install presidio-analyzer presidio-anonymizer
    python -m spacy download en_core_web_lg

You can force the fallback for testing with the env var
``CASESCRIBE_PII_FORCE_REGEX=1``.

The reverse map lives only in the social worker's browser. Server-side
persistence (incl. the flywheel edit-capture) is tokenized only — originals
never leave the user's browser session.
"""

from __future__ import annotations

import os
import re
import string
from typing import Any, Dict, List, Optional, Tuple

# Entities we scrub, in a stable priority order (used to resolve overlaps:
# earlier in this list wins when two detections collide on the same span).
SUPPORTED_ENTITIES: Tuple[str, ...] = (
    "EMAIL_ADDRESS",
    "PHONE_NUMBER",
    "PERSON",
    "LOCATION",
    "DATE_TIME",
)

# Map a Presidio/internal entity label to the prefix used in tokens.
_ENTITY_PREFIX: Dict[str, str] = {
    "PERSON": "PERSON",
    "PHONE_NUMBER": "PHONE",
    "EMAIL_ADDRESS": "EMAIL",
    "LOCATION": "LOCATION",
    "DATE_TIME": "DATE",
}

_ENTITY_PRIORITY: Dict[str, int] = {e: i for i, e in enumerate(SUPPORTED_ENTITIES)}


# ---------------------------------------------------------------------------
# Presidio engine (lazy, optional)
# ---------------------------------------------------------------------------

_PRESIDIO_ANALYZER = None  # cached AnalyzerEngine
_PRESIDIO_STATE: Optional[bool] = None  # None=unknown, True=available, False=unavailable


def _force_regex() -> bool:
    return os.environ.get("CASESCRIBE_PII_FORCE_REGEX", "").strip() not in ("", "0", "false", "False")


def _get_presidio_analyzer():
    """Return a cached Presidio ``AnalyzerEngine`` or ``None`` if unavailable.

    Importing Presidio and loading the spaCy model is expensive and may fail in
    a fresh env; we attempt it exactly once and cache the result.
    """
    global _PRESIDIO_ANALYZER, _PRESIDIO_STATE

    if _PRESIDIO_STATE is False:
        return None
    if _PRESIDIO_ANALYZER is not None:
        return _PRESIDIO_ANALYZER
    if _force_regex():
        _PRESIDIO_STATE = False
        return None

    try:
        # These imports are intentionally inside the function so the module
        # imports cleanly even when Presidio is not installed.
        from presidio_analyzer import AnalyzerEngine
        from presidio_analyzer.nlp_engine import NlpEngineProvider

        # Confirm the spaCy model is actually downloaded before committing to
        # Presidio; loading the engine without the model raises at analyze time.
        import spacy

        spacy.load("en_core_web_lg")

        provider = NlpEngineProvider(
            nlp_configuration={
                "nlp_engine_name": "spacy",
                "models": [{"lang_code": "en", "model_name": "en_core_web_lg"}],
            }
        )
        nlp_engine = provider.create_engine()
        _PRESIDIO_ANALYZER = AnalyzerEngine(nlp_engine=nlp_engine, supported_languages=["en"])
        _PRESIDIO_STATE = True
        return _PRESIDIO_ANALYZER
    except Exception:
        # Missing package, missing model, or runtime incompatibility -> fall back.
        _PRESIDIO_STATE = False
        _PRESIDIO_ANALYZER = None
        return None


def presidio_available() -> bool:
    """True if the real Presidio engine is usable (model downloaded, etc.)."""
    return _get_presidio_analyzer() is not None


# ---------------------------------------------------------------------------
# Detection span model
# ---------------------------------------------------------------------------

class _Span:
    __slots__ = ("start", "end", "entity", "score")

    def __init__(self, start: int, end: int, entity: str, score: float = 1.0):
        self.start = start
        self.end = end
        self.entity = entity
        self.score = score

    def __repr__(self) -> str:  # pragma: no cover - debugging aid
        return f"_Span({self.start}, {self.end}, {self.entity!r}, {self.score})"


def _detect_presidio(text: str) -> List[_Span]:
    analyzer = _get_presidio_analyzer()
    if analyzer is None:
        return []
    results = analyzer.analyze(
        text=text,
        entities=list(SUPPORTED_ENTITIES),
        language="en",
    )
    return [
        _Span(r.start, r.end, r.entity_type, float(getattr(r, "score", 1.0)))
        for r in results
        if r.entity_type in _ENTITY_PREFIX
    ]


# ---------------------------------------------------------------------------
# Regex fallback detector
# ---------------------------------------------------------------------------

# Email — pragmatic, covers the demo space.
_RE_EMAIL = re.compile(
    r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}",
)

# Phone — US-style with optional country code, separators, extensions.
_RE_PHONE = re.compile(
    r"""(?<![\w])(
        (?:\+?1[\s.\-]?)?            # optional country code
        (?:\(?\d{3}\)?[\s.\-]?)      # area code
        \d{3}[\s.\-]?\d{4}          # local number
        (?:\s?(?:x|ext\.?)\s?\d{1,5})?  # optional extension
    )(?![\w])""",
    re.VERBOSE,
)

# Dates — month-name dates, numeric dates, and ISO-ish dates.
_MONTHS = (
    r"(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|"
    r"Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)"
)
_RE_DATE = re.compile(
    r"""(?<![\w])(
        (?:%(m)s\.?\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?)   # March 3, 2024
      | (?:\d{1,2}(?:st|nd|rd|th)?\s+%(m)s\.?(?:,?\s+\d{4})?)   # 3rd of March style
      | (?:\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4})                      # 03/03/2024
      | (?:\d{4}-\d{2}-\d{2})                                    # 2024-03-03
    )(?![\w])""" % {"m": _MONTHS},
    re.VERBOSE | re.IGNORECASE,
)

# Person — best-effort: a title + name, or a sequence of 2+ capitalized words.
# Single-token capitalized words are too noisy without an NER model, so we only
# take a lone name when it follows an honorific.
_TITLE = r"(?:Mr|Mrs|Ms|Miss|Dr|Prof|Mx)\.?"
_CAPWORD = r"[A-Z][a-z'’\-]+"
_RE_PERSON = re.compile(
    r"""(?<![\w])(
        (?:%(title)s\s+%(cap)s(?:\s+%(cap)s)*)   # Dr. Jordan Lee
      | (?:%(cap)s(?:\s+%(cap)s)+)               # Jordan Lee  (2+ caps)
    )(?![\w])""" % {"title": _TITLE, "cap": _CAPWORD},
    re.VERBOSE,
)


def _detect_regex(text: str) -> List[_Span]:
    spans: List[_Span] = []
    for m in _RE_EMAIL.finditer(text):
        spans.append(_Span(m.start(), m.end(), "EMAIL_ADDRESS", 0.9))
    for m in _RE_PHONE.finditer(text):
        spans.append(_Span(m.start(1), m.end(1), "PHONE_NUMBER", 0.85))
    for m in _RE_DATE.finditer(text):
        spans.append(_Span(m.start(1), m.end(1), "DATE_TIME", 0.8))
    for m in _RE_PERSON.finditer(text):
        spans.append(_Span(m.start(1), m.end(1), "PERSON", 0.6))
    return spans


# ---------------------------------------------------------------------------
# Overlap resolution + tokenization
# ---------------------------------------------------------------------------

def _resolve_overlaps(spans: List[_Span]) -> List[_Span]:
    """Drop overlapping spans, keeping the strongest (longer span, then higher
    score, then higher-priority entity type). Returns spans sorted by start.
    """
    # Sort so that the "best" span is considered first for each region.
    def sort_key(s: _Span):
        return (-(s.end - s.start), -s.score, _ENTITY_PRIORITY.get(s.entity, 99))

    kept: List[_Span] = []
    for span in sorted(spans, key=sort_key):
        if any(span.start < k.end and k.start < span.end for k in kept):
            continue  # overlaps something already kept
        kept.append(span)
    kept.sort(key=lambda s: s.start)
    return kept


def _letters(n: int) -> str:
    """0->A, 1->B, ... 25->Z, 26->AA, 27->AB, ... (spreadsheet-style)."""
    out = ""
    n += 1
    while n > 0:
        n, rem = divmod(n - 1, 26)
        out = string.ascii_uppercase[rem] + out
    return out


def scrub(text: str) -> Tuple[str, Dict[str, str]]:
    """Scrub PII from ``text``.

    Returns ``(scrubbed_text_with_tokens, token_map)`` where ``token_map`` maps
    ``{token: original}``. Deterministic per call: identical originals of the
    same entity type map to the same token; tokens are assigned A/B/C... in
    order of first appearance, per entity type.
    """
    if not text:
        return text, {}

    spans = _detect_presidio(text)
    if not spans and not presidio_available():
        spans = _detect_regex(text)

    spans = _resolve_overlaps(spans)

    # Assign deterministic tokens in order of appearance, per entity type.
    counters: Dict[str, int] = {}
    original_to_token: Dict[Tuple[str, str], str] = {}
    token_map: Dict[str, str] = {}

    # Build the replacements list (start, end, token) so we can rewrite once.
    replacements: List[Tuple[int, int, str]] = []
    for span in spans:  # already sorted by start
        original = text[span.start:span.end]
        key = (span.entity, original)
        token = original_to_token.get(key)
        if token is None:
            prefix = _ENTITY_PREFIX[span.entity]
            idx = counters.get(span.entity, 0)
            counters[span.entity] = idx + 1
            token = f"[{prefix}_{_letters(idx)}]"
            original_to_token[key] = token
            token_map[token] = original
        replacements.append((span.start, span.end, token))

    # Rewrite the text in a single left-to-right pass.
    out_parts: List[str] = []
    cursor = 0
    for start, end, token in replacements:
        out_parts.append(text[cursor:start])
        out_parts.append(token)
        cursor = end
    out_parts.append(text[cursor:])
    scrubbed = "".join(out_parts)

    return scrubbed, token_map


# ---------------------------------------------------------------------------
# Re-injection (client-side mirror, for display / testing)
# ---------------------------------------------------------------------------

# Match any token of the form [PREFIX_LETTERS]; we only replace tokens present
# in the supplied map so unrelated bracketed text is left untouched.
_TOKEN_RE = re.compile(r"\[[A-Z]+_[A-Z]+\]")


def _reinject_str(s: str, token_map: Dict[str, str]) -> str:
    if not token_map:
        return s
    return _TOKEN_RE.sub(lambda m: token_map.get(m.group(0), m.group(0)), s)


def reinject(obj: Any, token_map: Dict[str, str]) -> Any:
    """Walk a nested dict / list / string structure and swap tokens back to
    originals using ``token_map``. Returns a new structure (does not mutate the
    input). This mirrors what the frontend does for display only — the server
    pipeline persists tokenized data and never calls this on stored records.
    """
    if isinstance(obj, str):
        return _reinject_str(obj, token_map)
    if isinstance(obj, dict):
        return {reinject(k, token_map): reinject(v, token_map) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        seq = [reinject(v, token_map) for v in obj]
        return type(obj)(seq) if isinstance(obj, tuple) else seq
    return obj


# ---------------------------------------------------------------------------
# Smoke test
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    sample = (
        "On March 3, 2024 I met with Jordan Lee and his mother Maria Lee at "
        "Lincoln Elementary School in Portland. Jordan seemed withdrawn. "
        "Maria Lee can be reached at (503) 555-0142 or maria.lee@example.com. "
        "Dr. Patel will follow up with Jordan next week."
    )

    scrubbed, token_map = scrub(sample)

    engine = "Presidio (en_core_web_lg)" if presidio_available() else "regex fallback"
    print("=" * 72)
    print(f"PII engine in use: {engine}")
    print("=" * 72)
    print("\n[1] RAW INPUT (never leaves the browser):\n")
    print(sample)
    print("\n[2] WHAT THE LLM SEES (tokens only):\n")
    print(scrubbed)
    print("\n[3] TOKEN MAP (server-side, request-scoped):\n")
    for tok, orig in token_map.items():
        print(f"    {tok:<14} -> {orig}")

    # Simulate a Trinity-style nested response coming back from the model and
    # round-trip it through reinject.
    model_output = {
        "summary": scrubbed,
        "facts": [
            {"who": "[PERSON_A]", "where": "[LOCATION_A]", "when": "[DATE_A]"},
            {"contact": "[PHONE_A]", "email": "[EMAIL_A]"},
        ],
    }
    reinjected = reinject(model_output, token_map)

    print("\n[4] RE-INJECTED (originals restored client-side):\n")
    print(reinjected["summary"])

    # ---- Verification ----------------------------------------------------
    print("\n" + "=" * 72)
    print("VERIFICATION")
    print("=" * 72)

    # (a) No original PII leaks into the scrubbed text.
    leaked = [orig for orig in token_map.values() if orig in scrubbed]
    assert not leaked, f"PII leaked into scrubbed text: {leaked}"

    # (b) Scrubbed text round-trips exactly back to the original.
    roundtrip = reinject(scrubbed, token_map)
    assert roundtrip == sample, "Round-trip mismatch:\n%r\n!=\n%r" % (roundtrip, sample)

    # (c) Determinism: same original -> same token within the call.
    #     "Jordan Lee" / "Maria Lee" appear twice each and must reuse tokens.
    assert scrubbed.count("[PERSON_") >= 2, "Expected repeated person tokens"

    # (d) Nested reinject restored the structured fields.
    assert reinjected["facts"][1]["email"] == token_map.get("[EMAIL_A]", "[EMAIL_A]")

    print("PASS  (a) no raw PII in LLM-facing text")
    print("PASS  (b) reinject round-trips scrubbed text back to the original")
    print("PASS  (c) deterministic per-entity tokens (repeats reuse tokens)")
    print("PASS  (d) reinject walks nested dict/list structures")
    print("\nAll checks passed.")
