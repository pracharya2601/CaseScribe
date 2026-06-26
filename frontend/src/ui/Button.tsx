import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Slot } from "@radix-ui/react-slot";
import { Loader2 } from "lucide-react";
import { cn } from "./cn";

type Variant = "primary" | "secondary" | "ghost" | "destructive";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-brand text-white shadow-card hover:bg-brand-ink active:bg-brand-ink",
  secondary:
    "bg-surface text-ink border border-border hover:bg-surface-2 active:bg-surface-2",
  ghost: "bg-transparent text-ink-muted hover:bg-surface-2 hover:text-ink",
  destructive:
    "bg-alert text-white shadow-card hover:bg-alert-ink active:bg-alert-ink",
};

const SIZES: Record<Size, string> = {
  sm: "h-8 px-3 text-sm gap-1.5 rounded-[var(--radius-input)]",
  md: "h-10 px-4 text-sm gap-2 rounded-[var(--radius-input)]",
  lg: "h-12 px-6 text-base gap-2 rounded-[var(--radius-input)]",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
  asChild?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      loading = false,
      icon,
      asChild = false,
      className,
      children,
      disabled,
      ...props
    },
    ref,
  ) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          "inline-flex items-center justify-center font-medium whitespace-nowrap select-none",
          "transition-colors duration-150 outline-none",
          "focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-1 focus-visible:ring-offset-app",
          "disabled:opacity-50 disabled:pointer-events-none",
          VARIANTS[variant],
          SIZES[size],
          className,
        )}
        {...props}
      >
        {loading ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          icon
        )}
        {children}
      </Comp>
    );
  },
);
Button.displayName = "Button";
