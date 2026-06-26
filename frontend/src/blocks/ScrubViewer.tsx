import { Fragment, type ReactNode } from "react";
import { ShieldCheck } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "../ui";

export interface ScrubViewerProps {
  /** Original transcript with real PII. */
  raw: string;
  /** What the model sees — PII replaced by [PERSON_A]-style tokens. */
  scrubbed: string;
  /** Final artifact with tokens re-injected to real identities. */
  reinjected: string;
  className?: string;
}

/** Highlights [TOKEN]-shaped substrings in mono. */
function withTokens(text: string): ReactNode {
  const parts = text.split(/(\[[A-Z0-9_]+\])/g);
  return parts.map((p, i) =>
    /^\[[A-Z0-9_]+\]$/.test(p) ? (
      <span
        key={i}
        className="rounded bg-brand-soft px-1 py-0.5 font-mono text-[0.85em] text-brand-ink"
      >
        {p}
      </span>
    ) : (
      <Fragment key={i}>{p}</Fragment>
    ),
  );
}

/** The FERPA visual: Raw → Model sees → Re-injected, as three tabs. */
export function ScrubViewer({
  raw,
  scrubbed,
  reinjected,
  className,
}: ScrubViewerProps) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle icon={<ShieldCheck />} sub="PII never reaches the model">
          Privacy scrub
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="scrubbed">
          <TabsList>
            <TabsTrigger value="raw">Raw input</TabsTrigger>
            <TabsTrigger value="scrubbed">Model sees</TabsTrigger>
            <TabsTrigger value="reinjected">Re-injected</TabsTrigger>
          </TabsList>
          <TabsContent value="raw">
            <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-[var(--radius-input)] bg-surface-2 p-3.5 text-sm leading-relaxed text-ink">
              {raw}
            </pre>
          </TabsContent>
          <TabsContent value="scrubbed">
            <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-[var(--radius-input)] border border-brand-border bg-brand-soft/40 p-3.5 text-sm leading-relaxed text-ink">
              {withTokens(scrubbed)}
            </pre>
          </TabsContent>
          <TabsContent value="reinjected">
            <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-[var(--radius-input)] border border-success-border bg-success-soft/40 p-3.5 text-sm leading-relaxed text-ink">
              {reinjected}
            </pre>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
