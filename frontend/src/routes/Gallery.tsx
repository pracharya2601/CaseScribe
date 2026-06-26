import { useEffect, useState, type ReactNode } from "react";
import {
  Stethoscope,
  AlertTriangle,
  Receipt,
  Inbox,
  WifiOff,
  RefreshCw,
} from "lucide-react";
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
  Badge,
  Pill,
  Stat,
  Skeleton,
  SkeletonText,
  Spinner,
  ProgressDots,
  Switch,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Textarea,
  FileDrop,
  Tooltip,
  TooltipProvider,
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogFooter,
  DialogClose,
  CountUp,
  Separator,
} from "../ui";
import {
  ArtifactCard,
  HeroBand,
  CostMeter,
  ModelAttribution,
  Timecard,
  ScrubViewer,
  InputPanel,
  SignBar,
  type ArtifactStatus,
  type ModelUsage,
} from "../blocks";

/* ----------------------------- fixtures ----------------------------- */

const MODELS: ModelUsage[] = [
  { step: "scrub", model: "regex+ner-local", latency_ms: 12, input_tokens: 0, output_tokens: 0 },
  { step: "classifier", model: "qwen2.5-7b-instruct", latency_ms: 410, input_tokens: 820, output_tokens: 64 },
  { step: "reporter", model: "llama-3.3-70b-instruct", latency_ms: 1180, input_tokens: 910, output_tokens: 240 },
  { step: "medicaid", model: "qwen2.5-7b-instruct", latency_ms: 520, input_tokens: 760, output_tokens: 96 },
  { step: "casenote", model: "deepseek-v3", latency_ms: 1640, input_tokens: 1020, output_tokens: 380 },
];

const RAW =
  "Counselor: How have things been since we last met, Marcus?\nMarcus: My mom's boyfriend Dave hit me again on Tuesday. I didn't tell anyone.\nCounselor: I'm really glad you told me. That's not your fault.";
const SCRUBBED =
  "Counselor: How have things been since we last met, [PERSON_A]?\n[PERSON_A]: My [RELATION_A]'s boyfriend [PERSON_B] hit me again on [DATE_A]. I didn't tell anyone.\nCounselor: I'm really glad you told me. That's not your fault.";
const REINJECTED =
  "Marcus disclosed that his mother's partner, Dave, struck him on Tuesday. Affect was withdrawn; the student had not previously reported the incident.";

const SCENARIOS = [
  { label: "Routine session", text: "Counselor: How was your week?\nMarcus: Pretty good, the new study plan is helping." },
  { label: "Mandatory report", text: RAW },
  { label: "Billable IEP", text: "Counselor: Let's review your IEP goals for reading fluency this quarter." },
];

/* ----------------------------- layout helpers ----------------------------- */

function Section({
  title,
  desc,
  children,
}: {
  title: string;
  desc?: string;
  children: ReactNode;
}) {
  return (
    <section className="scroll-mt-20">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-ink">{title}</h2>
        {desc && <p className="text-sm text-ink-muted">{desc}</p>}
      </div>
      {children}
    </section>
  );
}

function Row({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-3">{children}</div>;
}

function Grid({ children }: { children: ReactNode }) {
  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
  );
}

/** Designed empty + error states (a half-loaded card reads as broken). */
function EmptyState() {
  return (
    <Card className="flex flex-col items-center justify-center gap-2 py-10 text-center">
      <span className="flex size-10 items-center justify-center rounded-full bg-surface-2 text-ink-soft">
        <Inbox className="size-5" />
      </span>
      <p className="text-sm font-medium text-ink">No sessions yet</p>
      <p className="max-w-xs text-sm text-ink-muted">
        Run a transcript to generate the Trinity. Drafts appear here.
      </p>
      <Button variant="secondary" size="sm" className="mt-1">
        Load a sample
      </Button>
    </Card>
  );
}

function ErrorState() {
  return (
    <Card tone="alert" className="flex flex-col items-center justify-center gap-2 py-10 text-center">
      <span className="flex size-10 items-center justify-center rounded-full bg-alert-soft text-alert">
        <WifiOff className="size-5" />
      </span>
      <p className="text-sm font-medium text-ink">Couldn’t reach the model service</p>
      <p className="max-w-xs text-sm text-ink-muted">
        The job failed to submit. Your transcript is safe and was not sent.
      </p>
      <Button
        variant="secondary"
        size="sm"
        className="mt-1"
        icon={<RefreshCw className="size-4" />}
      >
        Retry
      </Button>
    </Card>
  );
}

/* ----------------------------- the gallery ----------------------------- */

export function Gallery() {
  const [status, setStatus] = useState<ArtifactStatus>("done");
  const [signed, setSigned] = useState(false);
  const [editMode, setEditMode] = useState(true);
  const [costTick, setCostTick] = useState(0);

  // Cycle the live cost/timer so the count-up animation is visible on load.
  useEffect(() => {
    const id = setInterval(() => setCostTick((t) => (t + 1) % 2), 2600);
    return () => clearInterval(id);
  }, []);

  return (
    <TooltipProvider>
      <div className="min-h-screen">
        {/* sticky header */}
        <header className="sticky top-0 z-40 border-b border-border bg-app/80 backdrop-blur-md">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
            <div className="flex items-center gap-3">
              <span className="flex size-8 items-center justify-center rounded-lg bg-brand text-white">
                <Stethoscope className="size-4" />
              </span>
              <div>
                <div className="text-sm font-semibold text-ink">
                  CaseScribe UI Kit
                </div>
                <div className="text-xs text-ink-muted">
                  primitives · blocks · all states
                </div>
              </div>
            </div>
            <Row>
              <Pill tone="success">emerald · success</Pill>
              <Pill tone="alert">rose · alert</Pill>
              <Pill tone="brand">indigo · interactive</Pill>
            </Row>
          </div>
        </header>

        <main className="mx-auto max-w-6xl space-y-14 px-6 py-10">
          {/* ---------------- PRIMITIVES ---------------- */}
          <Section title="Buttons" desc="primary · secondary · ghost · destructive · loading">
            <Row>
              <Button>Primary</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="destructive">Destructive</Button>
              <Button loading>Loading</Button>
              <Button disabled>Disabled</Button>
              <Button size="sm">Small</Button>
              <Button size="lg">Large</Button>
            </Row>
          </Section>

          <Section title="Badges & Pills" desc="neutral · success · alert · info · brand">
            <Row>
              <Badge>Neutral</Badge>
              <Badge tone="success">Billable</Badge>
              <Badge tone="alert">FLAG</Badge>
              <Badge tone="info">47s</Badge>
              <Badge tone="brand">SOAP</Badge>
              <Separator orientation="vertical" className="h-5" />
              <Pill tone="success">All clear</Pill>
              <Pill tone="alert">Mandatory report</Pill>
              <Pill tone="info">90834</Pill>
            </Row>
          </Section>

          <Section title="Stats & CountUp" desc="tabular numerals; numbers animate, don’t jitter">
            <Card>
              <CardContent className="grid grid-cols-2 gap-6 pt-6 sm:grid-cols-4">
                <Stat label="Elapsed" value={<CountUp key={costTick} value={47} suffix="s" />} />
                <Stat label="Cost" value={<CountUp key={costTick} value={0.04} decimals={2} prefix="$" />} tone="success" />
                <Stat label="Reimbursement" value={<CountUp key={costTick} value={89.64} decimals={2} prefix="$" />} tone="brand" />
                <Stat label="Flag" value="1" sub="suspected abuse" tone="alert" />
              </CardContent>
            </Card>
          </Section>

          <Section title="Loading" desc="Skeleton shimmer · Spinner · ProgressDots stepper">
            <Grid>
              <Card>
                <CardHeader>
                  <CardTitle>Skeleton</CardTitle>
                </CardHeader>
                <CardContent>
                  <SkeletonText lines={4} />
                  <Skeleton className="mt-4 h-8 w-32" />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Spinner</CardTitle>
                </CardHeader>
                <CardContent className="flex items-center gap-6">
                  <Spinner />
                  <Spinner label="Scrubbing…" />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>ProgressDots</CardTitle>
                </CardHeader>
                <CardContent>
                  <ProgressDots
                    stages={["Scrub", "Classify", "Draft", "Done"]}
                    current={2}
                  />
                </CardContent>
              </Card>
            </Grid>
          </Section>

          <Section title="Controls" desc="Switch · Tabs · Textarea · FileDrop · Tooltip · Dialog">
            <Grid>
              <Card>
                <CardHeader>
                  <CardTitle>Switch</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Switch label="Edit mode" checked={editMode} onCheckedChange={setEditMode} />
                  <Switch label="Show tokens" defaultChecked />
                  <Switch label="Disabled" disabled />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Tabs</CardTitle>
                </CardHeader>
                <CardContent>
                  <Tabs defaultValue="a">
                    <TabsList>
                      <TabsTrigger value="a">SOAP</TabsTrigger>
                      <TabsTrigger value="b">GIRP</TabsTrigger>
                    </TabsList>
                    <TabsContent value="a">
                      <p className="text-sm text-ink-muted">Subjective · Objective · Assessment · Plan</p>
                    </TabsContent>
                    <TabsContent value="b">
                      <p className="text-sm text-ink-muted">Goal · Intervention · Response · Plan</p>
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Tooltip & Dialog</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-wrap items-center gap-3">
                  <Tooltip content="qwen2.5-7b-instruct · 410ms">
                    <Badge tone="info" className="cursor-default font-mono">
                      classifier
                    </Badge>
                  </Tooltip>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="secondary" size="sm">
                        Open dialog
                      </Button>
                    </DialogTrigger>
                    <DialogContent
                      title="Confirm sign"
                      description="This attests to all three artifacts."
                    >
                      <DialogFooter>
                        <DialogClose asChild>
                          <Button variant="ghost">Cancel</Button>
                        </DialogClose>
                        <DialogClose asChild>
                          <Button>Confirm</Button>
                        </DialogClose>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle>Textarea (autosize)</CardTitle>
                </CardHeader>
                <CardContent>
                  <Textarea autosize placeholder="Type a transcript…" minRows={3} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>FileDrop</CardTitle>
                </CardHeader>
                <CardContent>
                  <FileDrop onText={() => {}} />
                </CardContent>
              </Card>
            </Grid>
          </Section>

          <Section title="Card tones" desc="neutral · success · alert (the one red moment)">
            <Grid>
              <Card tone="neutral">
                <CardHeader>
                  <CardTitle icon={<Stethoscope />}>Neutral</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-ink-muted">
                  Default surface for most content.
                </CardContent>
                <CardFooter>
                  <span className="text-xs text-ink-soft">footer slot</span>
                </CardFooter>
              </Card>
              <Card tone="success">
                <CardHeader>
                  <CardTitle icon={<Receipt />}>Success</CardTitle>
                  <Badge tone="success">Billable</Badge>
                </CardHeader>
                <CardContent className="text-sm text-ink-muted">
                  Completion / billable / all-clear.
                </CardContent>
              </Card>
              <Card tone="alert">
                <CardHeader>
                  <CardTitle icon={<AlertTriangle />}>Alert</CardTitle>
                  <Badge tone="alert">FLAG</Badge>
                </CardHeader>
                <CardContent className="text-sm text-ink-muted">
                  Reserved for the reporter trigger — scarcity is the impact.
                </CardContent>
              </Card>
            </Grid>
          </Section>

          {/* ---------------- BLOCKS ---------------- */}
          <Separator />

          <Section
            title="ArtifactCard — the workhorse"
            desc="pending → running → done; toggle to watch the spring-in + checkmark"
          >
            <Row>
              {(["pending", "running", "done"] as ArtifactStatus[]).map((s) => (
                <Button
                  key={s}
                  size="sm"
                  variant={status === s ? "primary" : "secondary"}
                  onClick={() => setStatus(s)}
                >
                  {s}
                </Button>
              ))}
              <Switch label="Editable" checked={editMode} onCheckedChange={setEditMode} />
            </Row>
            <div className="mt-4">
              <Grid>
                <ArtifactCard
                  title="Case note"
                  icon={<Stethoscope />}
                  status={status}
                  tone="success"
                  editable={editMode}
                  signer="Maria Reyes, LCSW"
                >
                  <div className="space-y-2 text-sm">
                    <p><span className="font-medium text-ink">S:</span> Student reports improved sleep.</p>
                    <p><span className="font-medium text-ink">O:</span> Affect bright, engaged.</p>
                    <p><span className="font-medium text-ink">A:</span> Progress toward coping goal.</p>
                    <p><span className="font-medium text-ink">P:</span> Continue weekly sessions.</p>
                  </div>
                </ArtifactCard>

                <ArtifactCard
                  title="Mandatory report"
                  icon={<AlertTriangle />}
                  status={status}
                  tone="alert"
                  editable={editMode}
                  signer="Maria Reyes, LCSW"
                >
                  <div className="space-y-2 text-sm">
                    <Badge tone="alert" pill>child_abuse_neglect · 0.93</Badge>
                    <p className="rounded-md bg-alert-soft p-2 font-mono text-[12px] text-alert-ink">
                      “…hit me again on Tuesday.”
                    </p>
                    <p className="text-ink-muted">
                      CA · file within{" "}
                      <span className="tnum font-medium text-ink">36h</span>.
                    </p>
                  </div>
                </ArtifactCard>

                <ArtifactCard
                  title="Medicaid billing"
                  icon={<Receipt />}
                  status={status}
                  tone="success"
                  editable={editMode}
                  signer="Maria Reyes, LCSW"
                >
                  <div className="space-y-2 text-sm">
                    <Row>
                      <Badge tone="success" pill>Billable</Badge>
                      <Badge tone="info" className="font-mono">90834</Badge>
                    </Row>
                    <p className="text-ink-muted">Psychotherapy, 45 min.</p>
                    <Stat label="Reimbursement" value={<CountUp value={89.64} decimals={2} prefix="$" />} tone="success" />
                  </div>
                </ArtifactCard>
              </Grid>
            </div>
          </Section>

          <Section title="HeroBand & CostMeter" desc="count-up timer vs manual baseline; cost delta">
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="space-y-6">
                <HeroBand key={`h${costTick}`} elapsedMs={47000} />
                <SignBar
                  editCount={3}
                  signed={signed}
                  onSign={() => setSigned(true)}
                />
              </div>
              <CostMeter key={`c${costTick}`} thisRunUsd={0.04} allFrontierUsd={0.19} />
            </div>
          </Section>

          <Section title="ModelAttribution & Timecard" desc="multi-model story · hired-employee framing">
            <div className="grid gap-6 lg:grid-cols-2">
              <ModelAttribution rows={MODELS} />
              <Timecard sessions={128} recoveredUsd={11473.92} hoursSaved={64.5} />
            </div>
          </Section>

          <Section title="ScrubViewer" desc="Raw → Model sees → Re-injected (the FERPA visual)">
            <ScrubViewer raw={RAW} scrubbed={SCRUBBED} reinjected={REINJECTED} />
          </Section>

          <Section title="InputPanel" desc="textarea + scenario quick-loads + filedrop + run">
            <div className="max-w-xl">
              <InputPanel scenarios={SCENARIOS} />
            </div>
          </Section>

          <Section title="Empty & error states" desc="designed, not blank — a half-loaded card reads as broken">
            <div className="grid gap-6 lg:grid-cols-2">
              <EmptyState />
              <ErrorState />
            </div>
          </Section>

          <footer className="pt-6 text-center text-sm text-ink-soft">
            CaseScribe design system · runs on inline fixtures, zero backend
          </footer>
        </main>
      </div>
    </TooltipProvider>
  );
}
