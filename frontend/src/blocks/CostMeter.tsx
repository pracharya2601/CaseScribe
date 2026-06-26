import { TrendingDown } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent, CountUp, Badge } from "../ui";
import { cn } from "../ui";

export interface CostMeterProps {
  /** Actual spend this run (routed/mixed models). */
  thisRunUsd: number;
  /** Hypothetical spend if every step used a frontier model. */
  allFrontierUsd: number;
  className?: string;
}

/** "$0.04 this run vs $0.19 all-frontier" — the delta is the headline. */
export function CostMeter({
  thisRunUsd,
  allFrontierUsd,
  className,
}: CostMeterProps) {
  const saved = Math.max(allFrontierUsd - thisRunUsd, 0);
  const pct =
    allFrontierUsd > 0 ? Math.round((saved / allFrontierUsd) * 100) : 0;

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle icon={<TrendingDown />}>Cost this run</CardTitle>
        <Badge tone="success" pill>
          −{pct}%
        </Badge>
      </CardHeader>
      <CardContent>
        <div className="flex items-end gap-2">
          <CountUp
            value={thisRunUsd}
            decimals={2}
            prefix="$"
            className="text-3xl font-bold leading-none text-success-ink"
          />
          <span className="pb-0.5 text-sm text-ink-muted line-through tnum">
            ${allFrontierUsd.toFixed(2)} all-frontier
          </span>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-[var(--radius-pill)] bg-surface-2">
          <div
            className={cn("h-full rounded-[var(--radius-pill)] bg-success")}
            style={{ width: `${Math.min(100 - pct, 100)}%` }}
          />
        </div>
        <p className="mt-2 text-sm text-ink-muted">
          Saved{" "}
          <span className="tnum font-medium text-success-ink">
            ${saved.toFixed(2)}
          </span>{" "}
          by routing cheap steps to small models.
        </p>
      </CardContent>
    </Card>
  );
}
