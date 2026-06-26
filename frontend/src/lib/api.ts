// API client for the AgentBox async job contract (casescribe-platform):
//   POST /run        -> 202 { job_id }
//   GET  /jobs/{id}  -> job status object
//
// The agent is deployed SEPARATELY from this UI (AgentBox backend-only). Set
// VITE_API_BASE to the agent's URL (e.g. https://<agentbox-url>) so the locally
// hosted demo UI talks to the deployed agent. If unset, paths stay same-origin
// relative (works when a backend runs on the same host during local dev).
//
// Mock vs live is a RUNTIME choice (see ./mockMode): default LIVE (real
// pipeline), flippable at the venue if the WiFi dies. Every call routes through
// isMock() so toggling takes effect immediately on the next run.

import { getMock, runMock } from "./mock";
import { isMock } from "./mockMode";
import type { JobStatus, Stage } from "./types";

const VALID_STAGES: Stage[] = ["scrubbing", "classifying", "drafting", "done"];

// Trailing slash stripped so `${API_BASE}/run` never doubles up.
const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, "") ?? "";

/** Build a full URL to an agent endpoint, honoring VITE_API_BASE. */
function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}

/** Submit a transcript; resolves to the job id. */
export async function runJob(text: string): Promise<string> {
  if (isMock()) return runMock(text);
  const res = await fetch(apiUrl("/run"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(`/run failed: ${res.status}`);
  const data = await res.json();
  return data.job_id;
}

/** Poll one job; normalizes the raw payload into a JobStatus. */
export async function getJob(jobId: string): Promise<JobStatus> {
  if (isMock()) return getMock(jobId);
  const res = await fetch(apiUrl(`/jobs/${jobId}`));
  if (!res.ok) throw new Error(`/jobs/${jobId} failed: ${res.status}`);
  const data = await res.json();
  const stage: Stage = VALID_STAGES.includes(data.stage) ? data.stage : "scrubbing";
  return {
    job_id: data.job_id ?? jobId,
    status: data.status ?? "running",
    stage,
    models: data.models ?? data.result?.models_used ?? [],
    result: data.result,
    error: data.error,
  };
}

/** Flywheel edit-capture — fired on Sign. Tokenized only; originals never leave the browser. */
export interface EditCaptureRecord {
  artifact_type: "case_note" | "reporter_flag" | "medicaid";
  model_used: string;
  draft: unknown;
  final: unknown;
  edit_distance: number;
  input_tokens: number;
}

export async function captureEdits(records: EditCaptureRecord[]): Promise<void> {
  if (isMock()) {
    // eslint-disable-next-line no-console
    console.info("[flywheel] edit-capture (mock):", records);
    return;
  }
  await fetch(apiUrl("/edits"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ records }),
  }).catch((e) => console.warn("edit-capture failed (non-fatal):", e));
}
