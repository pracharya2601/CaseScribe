// useJobPoll(jobId) — polls GET /jobs/{id} at ~750ms and surfaces the live job
// status so the UI can render by `stage`. Stops on completed/failed; safe to
// pass null (idle). Mock and live go through the same getJob() path.

import { useEffect, useRef, useState } from "react";
import { getJob } from "./api";
import type { JobStatus } from "./types";

export function useJobPoll(
  jobId: string | null,
  intervalMs = 750,
): JobStatus | null {
  const [status, setStatus] = useState<JobStatus | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (!jobId) {
      setStatus(null);
      return;
    }
    let active = true;

    const tick = async () => {
      try {
        const s = await getJob(jobId);
        if (!active) return;
        setStatus(s);
        if (s.status === "completed" || s.status === "failed") return;
      } catch (err) {
        if (!active) return;
        setStatus({
          job_id: jobId,
          status: "failed",
          stage: "scrubbing",
          models: [],
          error: err instanceof Error ? err.message : "Polling failed",
        });
        return;
      }
      timer.current = setTimeout(tick, intervalMs);
    };

    tick();
    return () => {
      active = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [jobId, intervalMs]);

  return status;
}
