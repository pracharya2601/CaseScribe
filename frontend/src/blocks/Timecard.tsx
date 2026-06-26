import { Briefcase } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Stat,
  Separator,
  CountUp,
} from "../ui";

export interface TimecardProps {
  sessions: number;
  recoveredUsd: number;
  hoursSaved: number;
  className?: string;
}

/** Aggregate stats — the "hired employee" framing. */
export function Timecard({
  sessions,
  recoveredUsd,
  hoursSaved,
  className,
}: TimecardProps) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle icon={<Briefcase />} sub="This pay period">
          CaseScribe timecard
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 items-center gap-2">
          <Stat
            label="Sessions"
            value={<CountUp value={sessions} />}
          />
          <div className="flex justify-center">
            <Separator orientation="vertical" className="h-10" />
          </div>
          <Stat
            label="Hours saved"
            value={<CountUp value={hoursSaved} decimals={1} />}
            tone="brand"
          />
        </div>
        <Separator className="my-4" />
        <Stat
          label="Revenue recovered"
          value={<CountUp value={recoveredUsd} decimals={2} prefix="$" />}
          sub="Medicaid-billable sessions captured"
          tone="success"
        />
      </CardContent>
    </Card>
  );
}
