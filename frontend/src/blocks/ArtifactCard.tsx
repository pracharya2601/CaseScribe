import { type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Pencil, FileSignature } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
  Badge,
  SkeletonText,
  Spinner,
  type Tone,
} from "../ui";
import { cardReveal, checkPop, prefersReducedMotion } from "../theme/motion";
import type { ArtifactStatus } from "./types";

export interface ArtifactCardProps {
  title: ReactNode;
  icon?: ReactNode;
  status: ArtifactStatus;
  tone?: Tone;
  /** Body — rendered only when status is "done". */
  children?: ReactNode;
  editable?: boolean;
  onEdit?: () => void;
  /** Signer for the draft stamp, e.g. "Maria Reyes, LCSW". */
  signer?: string;
  className?: string;
}

const STATUS_BADGE: Record<ArtifactStatus, ReactNode> = {
  pending: <Badge tone="neutral">Queued</Badge>,
  running: (
    <Badge tone="info" pill icon={<Spinner />}>
      Working
    </Badge>
  ),
  done: (
    <Badge tone="success" pill icon={<Check />}>
      Done
    </Badge>
  ),
};

/**
 * The workhorse. Skeleton while pending/running, springs in with a checkmark
 * when done. The three Trinity artifacts are three instances of this.
 */
export function ArtifactCard({
  title,
  icon,
  status,
  tone = "neutral",
  children,
  editable = false,
  onEdit,
  signer = "[name], LCSW",
  className,
}: ArtifactCardProps) {
  const done = status === "done";
  const reduce = prefersReducedMotion();

  return (
    <Card tone={done ? tone : "neutral"} interactive={done} className={className}>
      <CardHeader>
        <CardTitle icon={icon}>{title}</CardTitle>
        <div className="flex items-center gap-2">
          {done && editable && (
            <button
              type="button"
              onClick={onEdit}
              aria-label="Edit artifact"
              className="rounded-md p-1.5 text-ink-soft outline-none transition-colors hover:bg-surface-2 hover:text-ink focus-visible:ring-2 focus-visible:ring-brand/40"
            >
              <Pencil className="size-4" />
            </button>
          )}
          {status === "done" ? (
            <motion.span
              variants={reduce ? undefined : checkPop}
              initial={reduce ? false : "hidden"}
              animate="show"
            >
              {STATUS_BADGE.done}
            </motion.span>
          ) : (
            STATUS_BADGE[status]
          )}
        </div>
      </CardHeader>

      <CardContent>
        <AnimatePresence mode="wait" initial={false}>
          {done ? (
            <motion.div
              key="body"
              variants={reduce ? undefined : cardReveal}
              initial={reduce ? false : "hidden"}
              animate="show"
            >
              {children}
            </motion.div>
          ) : (
            <div key="loading" className="space-y-3">
              <SkeletonText lines={4} />
              {status === "running" && (
                <Spinner label="Drafting…" className="pt-1" />
              )}
            </div>
          )}
        </AnimatePresence>
      </CardContent>

      {done && (
        <CardFooter>
          <FileSignature className="size-3.5 text-ink-soft" aria-hidden />
          <span className="font-mono text-[11px] uppercase tracking-wide text-ink-soft">
            Draft — Requires {signer} signature
          </span>
        </CardFooter>
      )}
    </Card>
  );
}
