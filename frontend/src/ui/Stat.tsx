import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import { cn } from "./cn";

type StatTone = "neutral" | "success" | "alert" | "brand";

const VALUE_TONE: Record<StatTone, string> = {
  neutral: "text-ink",
  success: "text-success-ink",
  alert: "text-alert-ink",
  brand: "text-brand-ink",
};

export interface StatProps extends HTMLAttributes<HTMLDivElement> {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  tone?: StatTone;
}

export const Stat = forwardRef<HTMLDivElement, StatProps>(
  ({ label, value, sub, tone = "neutral", className, ...props }, ref) => (
    <div ref={ref} className={cn("flex flex-col gap-1", className)} {...props}>
      <span className="text-xs font-medium uppercase tracking-wide text-ink-soft">
        {label}
      </span>
      <span
        className={cn(
          "tnum text-2xl font-semibold leading-none",
          VALUE_TONE[tone],
        )}
      >
        {value}
      </span>
      {sub && <span className="text-sm text-ink-muted">{sub}</span>}
    </div>
  ),
);
Stat.displayName = "Stat";
