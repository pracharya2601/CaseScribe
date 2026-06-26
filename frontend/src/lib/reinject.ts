// Client-side re-injection (mirror of pii.reinject). The LLM only ever wrote
// tokens ([PERSON_A], [LOCATION_A], …); the reverse map lives only in the
// browser. We swap tokens -> originals for DISPLAY ONLY, and provide the inverse
// (scrub) so the UI can show the exact text the model saw.

import type { TokenMap } from "./types";

/** Replace every [TOKEN] with its original throughout any nested object/string. */
export function reinject<T>(obj: T, tokenMap: TokenMap | undefined): T {
  if (!tokenMap) return obj;
  return walk(obj, (s) => reinjectString(s, tokenMap)) as T;
}

export function reinjectString(text: string, tokenMap: TokenMap): string {
  if (!text) return text;
  let out = text;
  // Longest tokens first so [PERSON_AB] isn't clobbered by [PERSON_A].
  for (const token of Object.keys(tokenMap).sort((a, b) => b.length - a.length)) {
    out = out.split(token).join(tokenMap[token]);
  }
  return out;
}

/**
 * Produce "what the model sees": replace each original PII string with its
 * deterministic token. Longest originals first to avoid partial overlaps.
 */
export function scrubString(text: string, tokenMap: TokenMap): string {
  if (!text) return text;
  const pairs = Object.entries(tokenMap).sort(
    (a, b) => b[1].length - a[1].length,
  );
  let out = text;
  for (const [token, original] of pairs) {
    if (!original) continue;
    out = out.split(original).join(token);
  }
  return out;
}

function walk(value: unknown, fn: (s: string) => string): unknown {
  if (typeof value === "string") return fn(value);
  if (Array.isArray(value)) return value.map((v) => walk(v, fn));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = walk(v, fn);
    return out;
  }
  return value;
}
