import { Zap, Clock } from "lucide-react";
import { Card, CountUp } from "../ui";
import { cn } from "../ui";

export interface HeroBandProps {
  /** Run duration in ms (Trinity.elapsed_ms). */
  elapsedMs: number;
  /** Manual baseline to contrast against, in minutes. */
  manualMinutes?: number;
  className?: string;
}

/** The count-up run timer vs the muted "~90 min manual" baseline. */
export function HeroBand({
  elapsedMs,
  manualMinutes = 90,
  className,
}: HeroBandProps) {
  const seconds = elapsedMs / 1000;
  const speedup = Math.round((manualMinutes * 60) / Math.max(seconds, 0.001));

  return (
    <Card
      className={cn(
        "flex flex-wrap items-center justify-between gap-6 px-6 py-5",
        className,
      )}
    >
      <div className="flex items-center gap-4">
        <span className="flex size-11 items-center justify-center rounded-[var(--radius-input)] bg-brand-soft text-brand">
          <Zap className="size-5" />
        </span>
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-ink-soft">
            Drafted in
          </div>
          <div className="flex items-baseline gap-1">
            <CountUp
              value={seconds}
              decimals={seconds < 100 ? 1 : 0}
              className="text-4xl font-bold leading-none text-ink"
            />
            <span className="text-xl font-semibold text-ink-muted">s</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-6">
        <div className="text-right">
          <div className="flex items-center justify-end gap-1.5 text-sm text-ink-muted">
            <Clock className="size-3.5" />~{manualMinutes} min manual
          </div>
          <div className="tnum text-sm font-medium text-success-ink">
            ≈ {speedup.toLocaleString()}× faster
          </div>
        </div>
      </div>
    </Card>
  );
}
