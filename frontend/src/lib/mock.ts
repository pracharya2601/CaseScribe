// Fake staged poller — the whole app demos with ZERO backend. A run advances
// scrubbing → classifying → drafting → done on a wall-clock timer, exposing a
// partial Trinity + a growing models[] as each artifact completes so the UI
// reveals progressively exactly as it would against the live AgentBox.

import { matchScenario, STEP_STAGE, type MockScenario } from "./scenarios";
import {
  STAGE_ORDER,
  stageIndex,
  type JobStatus,
  type Stage,
  type TrinityResult,
} from "./types";

interface MockJob {
  id: string;
  startedAt: number;
  scenario: MockScenario;
}

const jobs = new Map<string, MockJob>();

// Stage boundaries (ms since submit). Spaced wider than the ~750ms poll so each
// stage is visibly hit at least once.
const STAGE_END_MS: Record<Stage, number> = {
  scrubbing: 900,
  classifying: 1800,
  drafting: 2700,
  done: Infinity,
};

function stageFor(elapsed: number): Stage {
  for (const stage of STAGE_ORDER) {
    if (elapsed < STAGE_END_MS[stage]) return stage;
  }
  return "done";
}

export function runMock(text: string): string {
  const id = `mock-${Math.random().toString(36).slice(2, 10)}`;
  jobs.set(id, { id, startedAt: Date.now(), scenario: matchScenario(text) });
  return id;
}

/** Build the partial Trinity visible at a given stage (artifacts reveal in order). */
function partialResult(scenario: MockScenario, stage: Stage): TrinityResult {
  const t = scenario.trinity;
  const idx = stageIndex(stage);
  const result: TrinityResult = {
    student_token: t.student_token,
    session_date: t.session_date,
    token_map: scenario.tokenMap,
    models_used: scenario.models.filter(
      (m) => stageIndex(STEP_STAGE[m.step] ?? "done") <= idx,
    ),
  };
  // Reporter flag lands at "classifying", medicaid at "drafting", everything
  // (case note, elapsed) at "done".
  if (idx >= stageIndex("classifying")) result.reporter_flag = t.reporter_flag;
  if (idx >= stageIndex("drafting")) result.medicaid = t.medicaid;
  if (idx >= stageIndex("done")) {
    result.case_note = t.case_note;
    result.elapsed_ms = t.elapsed_ms;
  }
  return result;
}

export function getMock(id: string): JobStatus {
  const job = jobs.get(id);
  if (!job) {
    return { job_id: id, status: "failed", stage: "scrubbing", models: [], error: "Unknown job" };
  }
  const elapsed = Date.now() - job.startedAt;
  const stage = stageFor(elapsed);
  const done = stage === "done";
  const result = partialResult(job.scenario, stage);
  return {
    job_id: id,
    status: done ? "completed" : "running",
    stage,
    models: result.models_used ?? [],
    result,
  };
}
