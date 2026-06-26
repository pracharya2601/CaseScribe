// Runtime mock/live mode — a tiny external store the whole app reads from.
//
// The deployed AgentBox container must call the REAL same-origin backend
// (/run, /jobs/{id}) by default, so "demo data" is now a runtime choice you can
// flip at the venue (e.g. if the WiFi dies) instead of a baked-in build flag.
//
// Resolution order for the INITIAL value (highest wins):
//   1. URL param         ?mock=1 / ?mock=0
//   2. localStorage      casescribe:mock
//   3. build-time env    VITE_USE_MOCK            (back-compat only)
//   4. default           live (false) -> real backend
//
// Whatever is chosen is persisted to localStorage AND reflected in the URL
// param, so a refresh keeps the same mode.

import { useSyncExternalStore } from "react";

const LS_KEY = "casescribe:mock";

/** Parse the many truthy/falsy spellings a human or query string might use. */
function parseBool(v: string | null | undefined): boolean | undefined {
  if (v == null) return undefined;
  const s = String(v).trim().toLowerCase();
  if (s === "1" || s === "true" || s === "yes" || s === "on" || s === "mock") return true;
  if (s === "0" || s === "false" || s === "no" || s === "off" || s === "live") return false;
  return undefined;
}

function resolveInitial(): boolean {
  if (typeof window !== "undefined") {
    // 1. URL param wins — lets you force a mode by link (?mock=1 / ?mock=0).
    try {
      const fromUrl = parseBool(new URL(window.location.href).searchParams.get("mock"));
      if (fromUrl !== undefined) return fromUrl;
    } catch {
      /* malformed URL — fall through */
    }
    // 2. Last chosen mode (persisted).
    try {
      const fromLs = parseBool(window.localStorage.getItem(LS_KEY));
      if (fromLs !== undefined) return fromLs;
    } catch {
      /* storage blocked — fall through */
    }
  }
  // 3. Build-time flag, kept for back-compat with VITE_USE_MOCK=true builds.
  const fromEnv = parseBool(import.meta.env.VITE_USE_MOCK as string | undefined);
  if (fromEnv !== undefined) return fromEnv;
  // 4. Default: LIVE — the deployed app does real AI out of the box.
  return false;
}

let mock = resolveInitial();
const listeners = new Set<() => void>();

/** Mirror the active mode into localStorage + the URL so a refresh restores it. */
function persist(value: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LS_KEY, value ? "1" : "0");
  } catch {
    /* ignore */
  }
  try {
    const url = new URL(window.location.href);
    url.searchParams.set("mock", value ? "1" : "0");
    window.history.replaceState(null, "", url.toString());
  } catch {
    /* ignore */
  }
}

// Pin the resolved initial value into LS + URL on first load so it survives a
// refresh even if it came purely from env/default.
persist(mock);

/** The single source of truth callers should read. */
export function isMock(): boolean {
  return mock;
}

export function setMock(value: boolean): void {
  if (value === mock) return;
  mock = value;
  persist(value);
  for (const l of listeners) l();
}

export function toggleMock(): boolean {
  setMock(!mock);
  return mock;
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** React binding — re-renders components when the mode flips. */
export function useMockMode(): boolean {
  return useSyncExternalStore(subscribe, isMock, isMock);
}
