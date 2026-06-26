import { Cpu } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Tooltip,
  Separator,
} from "../ui";
import type { ModelUsage } from "./types";

export interface ModelAttributionProps {
  rows: ModelUsage[];
  className?: string;
}

/** The visible multi-model story: one row per pipeline step. */
export function ModelAttribution({ rows, className }: ModelAttributionProps) {
  const totalTokens = rows.reduce(
    (n, r) => n + r.input_tokens + r.output_tokens,
    0,
  );

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle icon={<Cpu />} sub={`${rows.length} steps · ${totalTokens.toLocaleString()} tokens`}>
          Models used
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <ul className="divide-y divide-border">
          {rows.map((r, i) => (
            <li
              key={`${r.step}-${i}`}
              className="flex max-w-full items-center justify-between gap-3 py-2.5"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-medium uppercase tracking-wide text-ink-soft">
                  {r.step}
                </div>
                <Tooltip content={`${r.input_tokens} in · ${r.output_tokens} out tokens`}>
                  <span
                    className="block max-w-full cursor-default truncate font-mono text-sm text-ink"
                    title={r.model}
                  >
                    {r.model}
                  </span>
                </Tooltip>
              </div>
              <span className="tnum shrink-0 text-sm text-ink-muted">
                {r.latency_ms.toLocaleString()} ms
              </span>
            </li>
          ))}
        </ul>
        {rows.length > 0 && (
          <>
            <Separator className="my-1" />
            <div className="flex items-center justify-between pt-2 text-sm">
              <span className="text-ink-muted">Total</span>
              <span className="tnum font-medium text-ink">
                {rows
                  .reduce((n, r) => n + r.latency_ms, 0)
                  .toLocaleString()}{" "}
                ms
              </span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
