// lib-level types: the AgentBox job contract + the Trinity, re-using the block
// data contract (blocks/types.ts) and extending it with the server-only
// token_map that ships in the response so the browser can re-inject originals.

import type { Trinity, ModelUsage } from "../blocks/types";

export type { Trinity, ModelUsage } from "../blocks/types";

/** Progressive pipeline stage — drives the staggered artifact reveal. */
export type Stage = "scrubbing" | "classifying" | "drafting" | "done";

export const STAGE_ORDER: Stage[] = [
  "scrubbing",
  "classifying",
  "drafting",
  "done",
];

export function stageIndex(stage: Stage): number {
  return Math.max(0, STAGE_ORDER.indexOf(stage));
}

export type JobStatusValue = "pending" | "running" | "completed" | "failed";

/** token -> original. Lives only in the browser; never re-persisted server-side. */
export type TokenMap = Record<string, string>;

/**
 * Trinity as it arrives over the wire — the contract object plus the per-request
 * token_map (so the client, not the server, re-injects real identities).
 */
export interface TrinityResult extends Partial<Trinity> {
  token_map?: TokenMap;
}

/** Job status object returned by GET /jobs/{id}. */
export interface JobStatus {
  job_id: string;
  status: JobStatusValue;
  stage: Stage;
  /** Grows as the pipeline advances — feeds the live cost meter + attribution. */
  models: ModelUsage[];
  /** Present (possibly partial) as artifacts complete; full when status=completed. */
  result?: TrinityResult;
  error?: string;
}
