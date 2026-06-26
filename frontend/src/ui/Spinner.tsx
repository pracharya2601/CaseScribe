import { Loader2 } from "lucide-react";
import { cn } from "./cn";

export interface SpinnerProps {
  className?: string;
  label?: string;
}

export function Spinner({ className, label }: SpinnerProps) {
  return (
    <span
      role="status"
      aria-label={label ?? "Loading"}
      className={cn("inline-flex items-center gap-2 text-ink-muted", className)}
    >
      <Loader2 className="size-4 animate-spin" aria-hidden />
      {label && <span className="text-sm">{label}</span>}
    </span>
  );
}
