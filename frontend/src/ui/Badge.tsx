import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import { cn } from "./cn";

export type BadgeTone = "neutral" | "success" | "alert" | "info" | "brand";

const TONES: Record<BadgeTone, string> = {
  neutral: "bg-surface-2 text-ink-muted border border-border",
  success: "bg-success-soft text-success-ink border border-success-border",
  alert: "bg-alert-soft text-alert-ink border border-alert-border",
  info: "bg-info-soft text-info-ink border border-info-border",
  brand: "bg-brand-soft text-brand-ink border border-brand-border",
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  icon?: ReactNode;
  pill?: boolean;
}

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ tone = "neutral", icon, pill = false, className, children, ...props }, ref) => (
    <span
      ref={ref}
      className={cn(
        "inline-flex items-center gap-1 font-medium text-xs leading-none px-2 py-1",
        "[&_svg]:size-3",
        pill ? "rounded-[var(--radius-pill)]" : "rounded-md",
        TONES[tone],
        className,
      )}
      {...props}
    >
      {icon}
      {children}
    </span>
  ),
);
Badge.displayName = "Badge";

/** Pill is a Badge with fully-rounded geometry — same tone system. */
export const Pill = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ pill: _pill, ...props }, ref) => <Badge ref={ref} pill {...props} />,
);
Pill.displayName = "Pill";
