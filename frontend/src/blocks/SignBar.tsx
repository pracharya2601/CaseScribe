import { PenLine, CheckCircle2, Sparkles } from "lucide-react";
import {
  Card,
  Button,
  Badge,
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogFooter,
  DialogClose,
  CountUp,
} from "../ui";
import { cn } from "../ui";

export interface SignBarProps {
  /** Number of edits the clinician made — the flywheel capture readout. */
  editCount: number;
  signer?: string;
  signed?: boolean;
  onSign?: () => void;
  className?: string;
}

/** Sign action + "✎ N edits captured" flywheel readout. */
export function SignBar({
  editCount,
  signer = "Maria Reyes, LCSW",
  signed = false,
  onSign,
  className,
}: SignBarProps) {
  return (
    <Card
      className={cn(
        "flex flex-wrap items-center justify-between gap-4 px-6 py-4",
        className,
      )}
    >
      <div className="flex items-center gap-3">
        <Badge tone="brand" pill icon={<Sparkles />}>
          <CountUp value={editCount} /> edits captured
        </Badge>
        <span className="text-sm text-ink-muted">
          feeding the model-improvement flywheel
        </span>
      </div>

      {signed ? (
        <Badge tone="success" pill icon={<CheckCircle2 />}>
          Signed · {signer}
        </Badge>
      ) : (
        <Dialog>
          <DialogTrigger asChild>
            <Button icon={<PenLine className="size-4" />}>Sign &amp; finalize</Button>
          </DialogTrigger>
          <DialogContent
            title="Sign this case note?"
            description={`You are attesting to the accuracy of all three artifacts as ${signer}. ${editCount} edits will be recorded.`}
          >
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="ghost">Cancel</Button>
              </DialogClose>
              <DialogClose asChild>
                <Button
                  icon={<PenLine className="size-4" />}
                  onClick={onSign}
                >
                  Confirm signature
                </Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </Card>
  );
}
