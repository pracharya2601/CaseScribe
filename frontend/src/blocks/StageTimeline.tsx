import { motion } from "framer-motion";
import { Check, TriangleAlert } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Badge,
  Spinner,
  cn,
} from "../ui";
import { fadeUp, stagger, checkPop, prefersReducedMotion } from "../theme/motion";
import type { ArtifactStatus } from "./types";

/** A single pipeline stage node. Shape matches the live job poll result. */
export interface StageNode {
  /** Stable key: scrub | classify | reporter | medicaid | casenote. */
  key: string;
  /** Human label, e.g. "Reporter". */
  label: string;
  /** Engine/model attribution sub-label, e.g. "Qwen3-Next · T=0". */
  model: string;
  status: ArtifactStatus;
  /** Latency in ms; rendered as a chip once known. */
  latencyMs?: number;
  /** Total tokens for the step; rendered in mono. */
  tokens?: number;
  /** Reporter-only: the lone rose alert when a mandatory report fires. */
  alert?: boolean;
  /** One-line preview shown under the node (optional). */
  summary?: string;
}

export interface StageTimelineProps {
  stages: StageNode[];
  /** Opens the detail drawer for a completed node. */
  onNodeClick?: (key: string) => void;
  /** Currently-open node key (drives the selected ring). */
  activeKey?: string;
  className?: string;
}

/* ---- leading status indicator ---- */
function StatusDot({ status, alert }: { status: ArtifactStatus; alert?: boolean }) {
  if (status === "running") {
    return (
      <span className="flex size-7 items-center justify-center rounded-full border border-brand-border bg-brand-soft">
        <Spinner className="text-brand-ink [&_svg]:size-4" />
      </span>
    );
  }
  if (status === "done") {
    if (alert) {
      return (
        <motion.span
          variants={checkPop}
          className="flex size-7 items-center justify-center rounded-full border border-alert-border bg-alert-soft text-alert"
        >
          <TriangleAlert className="size-4" />
        </motion.span>
      );
    }
    return (
      <motion.span
        variants={checkPop}
        className="flex size-7 items-center justify-center rounded-full border border-success-border bg-success-soft text-success"
      >
        <Check className="size-4" strokeWidth={3} />
      </motion.span>
    );
  }
  // pending
  return (
    <span className="flex size-7 items-center justify-center rounded-full border border-border bg-surface-2">
      <span className="size-2 rounded-full bg-ink-soft" />
    </span>
  );
}

function fmtTokens(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

/**
 * THE centerpiece — a vertical timeline of the 5 pipeline stages. Nodes reveal
 * with a Framer stagger as statuses flip to done; the reporter node carries the
 * single rose alert. Completed nodes are clickable → open the DetailDrawer.
 */
export function StageTimeline({
  stages,
  onNodeClick,
  activeKey,
  className,
}: StageTimelineProps) {
  const reduced = prefersReducedMotion();

  return (
    <Card className={cn("max-w-full overflow-hidden", className)}>
      <CardHeader>
        <CardTitle sub="Live multi-model pipeline · PII scrubbed locally">
          Pipeline
        </CardTitle>
        <Badge tone="info" pill>
          {stages.filter((s) => s.status === "done").length}/{stages.length} done
        </Badge>
      </CardHeader>
      <CardContent>
        <motion.ol
          variants={reduced ? undefined : stagger}
          initial={reduced ? false : "hidden"}
          animate="show"
          className="relative flex flex-col"
        >
          {stages.map((stage, i) => {
            const isLast = i === stages.length - 1;
            const done = stage.status === "done";
            const clickable = done && !!onNodeClick;
            const active = stage.key === activeKey;

            return (
              <motion.li
                key={stage.key}
                variants={reduced ? undefined : fadeUp}
                className="relative flex min-w-0 gap-3.5"
              >
                {/* rail + node */}
                <div className="flex flex-col items-center">
                  <StatusDot status={stage.status} alert={stage.alert} />
                  {!isLast && (
                    <span
                      className={cn(
                        "w-px flex-1",
                        done ? "bg-success-border" : "bg-border",
                      )}
                      aria-hidden
                    />
                  )}
                </div>

                {/* body */}
                <button
                  type="button"
                  disabled={!clickable}
                  onClick={clickable ? () => onNodeClick!(stage.key) : undefined}
                  aria-current={active ? "true" : undefined}
                  className={cn(
                    "mb-3 min-w-0 flex-1 rounded-[var(--radius-input)] border px-3.5 py-2.5 text-left transition-all",
                    "outline-none",
                    active
                      ? "border-brand-border bg-brand-soft/40 ring-1 ring-brand/20"
                      : "border-transparent",
                    clickable &&
                      "cursor-pointer hover:border-border hover:bg-surface-2/60 focus-visible:ring-2 focus-visible:ring-brand/40",
                    !clickable && "cursor-default",
                  )}
                >
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className={cn(
                          "truncate font-semibold",
                          stage.status === "pending"
                            ? "text-ink-soft"
                            : "text-ink",
                        )}
                      >
                        {stage.label}
                      </span>
                      {stage.alert && done && (
                        <Badge tone="alert" pill className="font-medium">
                          <TriangleAlert className="size-3" /> Report
                        </Badge>
                      )}
                    </div>

                    {/* trailing latency + tokens chip */}
                    {done && (stage.latencyMs != null || stage.tokens != null) && (
                      <div className="flex shrink-0 items-center gap-2 text-xs text-ink-muted">
                        {stage.latencyMs != null && (
                          <span className="tnum">{stage.latencyMs}ms</span>
                        )}
                        {stage.tokens != null && (
                          <span className="tnum font-mono text-ink-soft">
                            {fmtTokens(stage.tokens)} tok
                          </span>
                        )}
                      </div>
                    )}
                    {stage.status === "running" && (
                      <span className="shrink-0 text-xs font-medium text-brand-ink">
                        running…
                      </span>
                    )}
                  </div>

                  {/* engine / model attribution sub-label */}
                  <div
                    className="mt-0.5 truncate font-mono text-xs text-ink-muted"
                    title={stage.model}
                  >
                    {stage.model}
                  </div>

                  {stage.summary && done && (
                    <p className="mt-1.5 line-clamp-2 text-sm text-ink-muted">
                      {stage.summary}
                    </p>
                  )}
                </button>
              </motion.li>
            );
          })}
        </motion.ol>
      </CardContent>
    </Card>
  );
}
