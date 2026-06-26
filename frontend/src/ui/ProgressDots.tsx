import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { cn } from "./cn";
import { springPop } from "../theme/motion";

export interface ProgressDotsProps {
  /** Ordered stage labels. */
  stages: string[];
  /** Index of the stage currently in progress; stages before it are done. */
  current: number;
  className?: string;
}

/** Horizontal stepper used while polling the job (scrubbing → drafting → done). */
export function ProgressDots({ stages, current, className }: ProgressDotsProps) {
  return (
    <ol className={cn("flex items-center gap-2", className)}>
      {stages.map((stage, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={stage} className="flex items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] px-2.5 py-1 text-xs font-medium transition-colors",
                done && "bg-success-soft text-success-ink",
                active && "bg-brand-soft text-brand-ink",
                !done && !active && "bg-surface-2 text-ink-soft",
              )}
            >
              <span className="relative inline-flex size-3.5 items-center justify-center">
                {done ? (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={springPop}
                  >
                    <Check className="size-3.5" />
                  </motion.span>
                ) : active ? (
                  <motion.span
                    className="size-2 rounded-full bg-brand"
                    animate={{ scale: [1, 1.4, 1], opacity: [1, 0.6, 1] }}
                    transition={{ duration: 1.2, repeat: Infinity }}
                  />
                ) : (
                  <span className="size-2 rounded-full bg-border-strong" />
                )}
              </span>
              {stage}
            </span>
            {i < stages.length - 1 && (
              <span
                className={cn(
                  "h-px w-4",
                  done ? "bg-success-border" : "bg-border",
                )}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
