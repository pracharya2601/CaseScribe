import { useState } from "react";
import { Play, FileText } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Textarea,
  Button,
  FileDrop,
  Separator,
} from "../ui";

export interface Scenario {
  label: string;
  text: string;
}

export interface InputPanelProps {
  scenarios?: Scenario[];
  loading?: boolean;
  /** Called with the transcript text when Run is pressed. */
  onRun?: (text: string) => void;
  className?: string;
}

/** Textarea + scenario quick-loads + FileDrop + Run — the raw-input pane. */
export function InputPanel({
  scenarios = [],
  loading = false,
  onRun,
  className,
}: InputPanelProps) {
  const [text, setText] = useState("");

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle icon={<FileText />} sub="Paste a session transcript">
          Session input
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {scenarios.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {scenarios.map((s) => (
              <Button
                key={s.label}
                variant="secondary"
                size="sm"
                onClick={() => setText(s.text)}
              >
                {s.label}
              </Button>
            ))}
          </div>
        )}

        <Textarea
          autosize
          minRows={6}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Counselor: How have things been since we last met?…"
          className="min-h-36 font-mono text-[13px]"
        />

        <div className="flex items-center gap-3">
          <Separator className="flex-1" />
          <span className="text-xs uppercase tracking-wide text-ink-soft">
            or
          </span>
          <Separator className="flex-1" />
        </div>

        <FileDrop onText={(t) => setText(t)} />

        <Button
          size="lg"
          className="w-full"
          loading={loading}
          icon={<Play className="size-4" />}
          disabled={!text.trim()}
          onClick={() => onRun?.(text)}
        >
          {loading ? "Processing…" : "Run CaseScribe"}
        </Button>
      </CardContent>
    </Card>
  );
}
