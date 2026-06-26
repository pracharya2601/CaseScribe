import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import { cn } from "./cn";

export type Tone = "neutral" | "success" | "alert";

const TONE_BORDER: Record<Tone, string> = {
  neutral: "border-border",
  success: "border-success-border",
  alert: "border-alert-border ring-1 ring-alert/10",
};

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  tone?: Tone;
  interactive?: boolean;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ tone = "neutral", interactive = false, className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "rounded-[var(--radius-card)] bg-surface border shadow-card",
        "transition-shadow duration-200",
        interactive && "hover:shadow-[var(--shadow-card-hover)]",
        TONE_BORDER[tone],
        className,
      )}
      {...props}
    />
  ),
);
Card.displayName = "Card";

export const CardHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "flex items-start justify-between gap-3 px-6 pt-6 pb-4",
        className,
      )}
      {...props}
    />
  ),
);
CardHeader.displayName = "CardHeader";

export interface CardTitleProps extends HTMLAttributes<HTMLDivElement> {
  icon?: ReactNode;
  sub?: ReactNode;
}

export const CardTitle = forwardRef<HTMLDivElement, CardTitleProps>(
  ({ icon, sub, className, children, ...props }, ref) => (
    <div ref={ref} className={cn("flex items-center gap-2.5", className)} {...props}>
      {icon && <span className="text-ink-muted [&_svg]:size-5">{icon}</span>}
      <div className="leading-tight">
        <div className="font-semibold text-ink">{children}</div>
        {sub && <div className="text-sm text-ink-muted">{sub}</div>}
      </div>
    </div>
  ),
);
CardTitle.displayName = "CardTitle";

export const CardContent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("px-6 pb-6", className)} {...props} />
  ),
);
CardContent.displayName = "CardContent";

export const CardFooter = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "flex items-center gap-2 px-6 py-3 border-t border-border bg-surface-2/40 rounded-b-[var(--radius-card)]",
        className,
      )}
      {...props}
    />
  ),
);
CardFooter.displayName = "CardFooter";
