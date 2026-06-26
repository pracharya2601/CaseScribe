// API client for the AgentBox async job contract (casescribe-platform):
//   POST /run        -> 202 { job_id }
//   GET  /jobs/{id}  -> job status object
// A single flag (VITE_USE_MOCK, default ON) flips between the zero-backend mock
// poller and the live FastAPI service, so the demo never depends on the WiFi.

import { getMock, runMock } from "./mock";
import type { JobStatus, Stage } from "./types";

/** Mock unless explicitly set to "false" (e.g. VITE_USE_MOCK=false npm run dev). */
export const IS_MOCK =
  (import.meta.env.VITE_USE_MOCK ?? "true").toString().toLowerCase() !== "false";

const VALID_STAGES: Stage[] = ["scrubbing", "classifying", "drafting", "done"];

/** Submit a transcript; resolves to the job id. */
export async function runJob(text: string): Promise<string> {
  if (IS_MOCK) return runMock(text);
  const res = await fetch("/run", {
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
  if (IS_MOCK) return getMock(jobId);
  const res = await fetch(`/jobs/${jobId}`);
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
  if (IS_MOCK) {
    // eslint-disable-next-line no-console
    console.info("[flywheel] edit-capture (mock):", records);
    return;
  }
  await fetch("/edits", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ records }),
  }).catch((e) => console.warn("edit-capture failed (non-fatal):", e));
}
