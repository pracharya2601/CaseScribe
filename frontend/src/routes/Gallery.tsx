import { useEffect, useState, type ReactNode } from "react";
import {
  Stethoscope,
  AlertTriangle,
  Receipt,
  Inbox,
  WifiOff,
  RefreshCw,
  Play,
  RotateCcw,
  ShieldCheck,
  TriangleAlert,
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
  AppShell,
  SidebarNav,
  StageTimeline,
  DetailDrawer,
  type ArtifactStatus,
  type ModelUsage,
  type StageNode,
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

/* ---- app-shell / timeline fixtures ---- */

const STAGE_DEFS: Required<Omit<StageNode, "status">>[] = [
  { key: "scrub", label: "Scrub", model: "local Presidio", latencyMs: 12, tokens: 0, alert: false, summary: "8 PII spans masked → [PERSON_A], [DATE_A]" },
  { key: "classify", label: "Classify", model: "Nemotron Nano", latencyMs: 410, tokens: 884, alert: false, summary: "Session type: individual counseling" },
  { key: "reporter", label: "Reporter", model: "Qwen3-Next · T=0", latencyMs: 1180, tokens: 1150, alert: true, summary: "Suspected child abuse — CA, file within 36h" },
  { key: "medicaid", label: "Medicaid", model: "Qwen3-Coder", latencyMs: 520, tokens: 856, alert: false, summary: "Billable · 90834 · $89.64" },
  { key: "casenote", label: "Case note", model: "Claude Sonnet 4.6", latencyMs: 1640, tokens: 1400, alert: false, summary: "SOAP draft ready for signature" },
];

/** index = next stage to complete; stages before it are done, this one runs. */
function buildStages(idx: number, alertOn: boolean): StageNode[] {
  return STAGE_DEFS.map((s, i) => {
    const status: ArtifactStatus =
      i < idx ? "done" : i === idx ? "running" : "pending";
    const alert = s.key === "reporter" ? alertOn : false;
    return {
      key: s.key,
      label: s.label,
      model: s.model,
      status,
      latencyMs: s.latencyMs,
      tokens: s.tokens,
      alert,
      summary: s.summary,
    };
  });
}

const NAV_SCENARIOS = [
  { key: "routine", label: "Routine session" },
  { key: "report", label: "Mandatory report" },
  { key: "iep", label: "Billable IEP" },
];

const NAV_HISTORY = [
  { id: "h1", label: "Marcus T. · 90834", sub: "Today · $89.64", alert: true },
  { id: "h2", label: "Priya K. · 90837", sub: "Today · $122.40" },
  { id: "h3", label: "Devon R. · non-billable", sub: "Yesterday" },
];

/** Sample drawer body per stage — the artifact the node reveals. */
function StageDrawerBody({ stageKey }: { stageKey: string }) {
  switch (stageKey) {
    case "scrub":
      return <ScrubViewer raw={RAW} scrubbed={SCRUBBED} reinjected={REINJECTED} />;
    case "classify":
      return (
        <div className="space-y-3 text-sm">
          <Stat label="Session type" value="Individual counseling" />
          <Stat label="Modality" value="In-person · 45 min" />
          <Stat label="Confidence" value={<CountUp value={0.96} decimals={2} />} tone="brand" />
        </div>
      );
    case "reporter":
      return (
        <Card tone="alert">
          <CardHeader>
            <CardTitle icon={<TriangleAlert />}>Mandatory report</CardTitle>
            <Badge tone="alert" pill>child_abuse_neglect · 0.93</Badge>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="rounded-md bg-alert-soft p-2.5 font-mono text-[12px] text-alert-ink">
              “…my mom’s boyfriend hit me again on Tuesday.”
            </p>
            <Stat label="Jurisdiction" value="California" />
            <Stat label="File within" value={<CountUp value={36} suffix="h" />} tone="alert" />
            <p className="text-ink-muted">
              Both regex screen and LLM judge agreed. A draft SCAR filing and
              safety plan are attached for review.
            </p>
          </CardContent>
        </Card>
      );
    case "medicaid":
      return (
        <div className="space-y-3 text-sm">
          <Row>
            <Badge tone="success" pill>Billable</Badge>
            <Badge tone="info" className="font-mono">90834</Badge>
          </Row>
          <Stat label="Description" value="Psychotherapy, 45 min" />
          <Stat label="Units" value="1" />
          <Stat label="Reimbursement" value={<CountUp value={89.64} decimals={2} prefix="$" />} tone="success" />
          <p className="text-ink-muted">
            Met time threshold and medical-necessity criteria for individual
            psychotherapy.
          </p>
        </div>
      );
    case "casenote":
      return (
        <div className="space-y-2 text-sm">
          <p><span className="font-medium text-ink">S:</span> Student reports improved sleep and reduced anxiety since last session.</p>
          <p><span className="font-medium text-ink">O:</span> Affect bright, engaged; maintained eye contact.</p>
          <p><span className="font-medium text-ink">A:</span> Progress toward coping-skills goal.</p>
          <p><span className="font-medium text-ink">P:</span> Continue weekly individual sessions.</p>
        </div>
      );
    default:
      return null;
  }
}

/** Standalone DetailDrawer with sample artifact content. */
function StandaloneDrawerDemo() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Row>
        <Button variant="secondary" onClick={() => setOpen(true)}>
          Open detail drawer
        </Button>
        <span className="text-sm text-ink-muted">
          Opens the Reporter stage artifact (the alert-styled detail).
        </span>
      </Row>
      <DetailDrawer
        open={open}
        onOpenChange={setOpen}
        leading={<TriangleAlert className="text-alert" />}
        title="Reporter"
        sub="Qwen3-Next · T=0 · 1180ms"
        footer={
          <Button variant="destructive" className="w-full">
            Review draft SCAR filing
          </Button>
        }
      >
        <StageDrawerBody stageKey="reporter" />
      </DetailDrawer>
    </>
  );
}

/** A fully-wired, embedded app-shell preview — the Layout v2 centerpiece. */
function AppShellDemo() {
  const [collapsed, setCollapsed] = useState(false);
  const [idx, setIdx] = useState(5); // 5 = all done
  const [alertOn, setAlertOn] = useState(true);
  const [activeKey, setActiveKey] = useState<string | undefined>(undefined);

  const stages = buildStages(idx, alertOn);
  const activeStage = stages.find((s) => s.key === activeKey);

  // Auto-advance once on mount so the sequential reveal is visible.
  function runPipeline() {
    setIdx(0);
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setIdx(i);
      if (i >= STAGE_DEFS.length) clearInterval(id);
    }, 650);
  }

  return (
    <div className="space-y-3">
      <Row>
        <Button size="sm" variant="secondary" icon={<Play className="size-4" />} onClick={runPipeline}>
          Run pipeline
        </Button>
        <Button size="sm" variant="ghost" icon={<RotateCcw className="size-4" />} onClick={() => { setIdx(5); setActiveKey(undefined); }}>
          All done
        </Button>
        <Switch label="Reporter alert" checked={alertOn} onCheckedChange={setAlertOn} />
        <Switch label="Collapse nav" checked={collapsed} onCheckedChange={setCollapsed} />
      </Row>

      <div className="overflow-hidden rounded-[var(--radius-card)] border border-border shadow-card">
        <AppShell
          className="h-[640px]"
          sidebar={
            <SidebarNav
              collapsed={collapsed}
              onToggleCollapsed={() => setCollapsed((c) => !c)}
              onNewSession={runPipeline}
              scenarios={NAV_SCENARIOS}
              onScenario={() => runPipeline()}
              history={NAV_HISTORY}
              activeHistoryId="h1"
              timecard={{ sessions: 128, recoveredUsd: 11473, hoursSaved: 64 }}
            />
          }
          header={
            <div className="flex items-center justify-between gap-4 px-6 py-3">
              <div className="flex items-center gap-5">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-xs font-medium uppercase tracking-wide text-ink-soft">
                    Drafted in
                  </span>
                  <CountUp value={47} decimals={1} suffix="s" className="text-lg font-bold text-ink" />
                  <span className="tnum text-xs font-medium text-success-ink">≈ 115× faster</span>
                </div>
                <Separator orientation="vertical" className="h-6" />
                <div className="flex items-baseline gap-1.5">
                  <span className="text-xs font-medium uppercase tracking-wide text-ink-soft">
                    Cost
                  </span>
                  <CountUp value={0.04} decimals={2} prefix="$" className="text-lg font-bold text-success-ink" />
                  <span className="tnum text-xs text-ink-soft">vs $0.19 all-frontier</span>
                </div>
              </div>
              <Badge tone="success" icon={<ShieldCheck />}>scrubbed locally</Badge>
            </div>
          }
          drawer={
            <DetailDrawer
              open={!!activeKey}
              onOpenChange={(o) => !o && setActiveKey(undefined)}
              leading={
                activeStage?.alert ? (
                  <TriangleAlert className="text-alert" />
                ) : (
                  <Stethoscope className="text-success" />
                )
              }
              title={activeStage?.label ?? "Stage"}
              sub={activeStage?.model}
              footer={
                activeKey === "casenote" ? (
                  <SignBar editCount={3} signed={false} onSign={() => {}} />
                ) : undefined
              }
            >
              {activeKey && <StageDrawerBody stageKey={activeKey} />}
            </DetailDrawer>
          }
          rightRail={
            <div className="p-4">
              <StageTimeline
                stages={stages}
                activeKey={activeKey}
                onNodeClick={(k) => setActiveKey(k)}
              />
            </div>
          }
        >
          {/* center workspace: composer + an inline artifact detail panel */}
          <div className="space-y-5">
            <div className="max-w-none">
              <InputPanel scenarios={SCENARIOS} />
            </div>
            <ArtifactCard
              title="Case note"
              icon={<Stethoscope />}
              status="done"
              tone="success"
              editable
              signer="Maria Reyes, LCSW"
            >
              <div className="space-y-2 text-sm">
                <p><span className="font-medium text-ink">S:</span> Student reports improved sleep and steadier mood since the new study plan.</p>
                <p><span className="font-medium text-ink">O:</span> Affect bright; engaged throughout the 45-minute session.</p>
                <p><span className="font-medium text-ink">A:</span> Continued progress toward the coping-skills goal.</p>
                <p><span className="font-medium text-ink">P:</span> Continue weekly individual counseling.</p>
              </div>
            </ArtifactCard>
          </div>
        </AppShell>
      </div>
      <p className="text-sm text-ink-muted">
        Three-column frame: SidebarNav · center workspace (composer + inline
        artifact panel) · the persistent <code className="font-mono text-ink-soft">rightRail</code>{" "}
        (~320px) holding the live StageTimeline. Click any completed node to open
        the detail drawer; the rail and main column scroll independently.
      </p>
    </div>
  );
}

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

          {/* ---------------- LAYOUT V2 — APP SHELL ---------------- */}
          <Separator />

          <Section
            title="StageTimeline — pipeline states"
            desc="pending dot · running spinner · emerald done check · the lone rose alert on the reporter node"
          >
            <div className="grid gap-6 lg:grid-cols-3">
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-soft">
                  Mid-run (Reporter running)
                </p>
                <StageTimeline stages={buildStages(2, false)} />
              </div>
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-soft">
                  All done · alert ON
                </p>
                <StageTimeline stages={buildStages(5, true)} activeKey="reporter" />
              </div>
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-soft">
                  All done · alert OFF
                </p>
                <StageTimeline stages={buildStages(5, false)} />
              </div>
            </div>
          </Section>

          <Section
            title="Rail overflow stress test — 320px"
            desc="longest real model IDs in a pinned 320px rail · nothing scrolls horizontally · labels truncate · chips wrap"
          >
            <div
              data-testid="narrow-rail"
              className="flex flex-col gap-4 overflow-x-hidden border-l border-border bg-surface/40 p-4"
              style={{ width: 320 }}
            >
              <StageTimeline
                stages={[
                  { key: "scrub", label: "Scrub", model: "local-presidio-ner-en_core_web_lg", status: "done", latencyMs: 12, tokens: 0, summary: "8 PII spans masked → [PERSON_A], [DATE_A]" },
                  { key: "classify", label: "Classify", model: "Qwen/Qwen3-Coder-480B-A35B-Instruct-FP8", status: "done", latencyMs: 410, tokens: 884, summary: "Session type: individual counseling" },
                  { key: "reporter", label: "Reporter", model: "meta-llama/Llama-3.3-70B-Instruct-Turbo", status: "done", latencyMs: 1180, tokens: 1150, alert: true, summary: "Suspected child abuse — CA, file within 36h" },
                  { key: "medicaid", label: "Medicaid", model: "deepseek-ai/DeepSeek-V3-0324-Instruct-Reasoning", status: "running" },
                  { key: "casenote", label: "Case note", model: "claude-sonnet-4-6-20260219-thinking-extended", status: "pending" },
                ]}
                activeKey="reporter"
              />
              <ModelAttribution
                rows={[
                  { step: "scrub", model: "local-presidio-ner-en_core_web_lg", latency_ms: 12, input_tokens: 0, output_tokens: 0 },
                  { step: "classifier", model: "Qwen/Qwen3-Coder-480B-A35B-Instruct-FP8", latency_ms: 410, input_tokens: 820, output_tokens: 64 },
                  { step: "reporter", model: "meta-llama/Llama-3.3-70B-Instruct-Turbo", latency_ms: 1180, input_tokens: 910, output_tokens: 240 },
                  { step: "casenote", model: "claude-sonnet-4-6-20260219-thinking-extended", latency_ms: 1640, input_tokens: 1020, output_tokens: 380 },
                ]}
              />
            </div>
          </Section>

          <Section
            title="DetailDrawer — right sheet"
            desc="Radix Dialog as a 440px right slide-in · focus-trapped · ESC/overlay closes"
          >
            <StandaloneDrawerDemo />
          </Section>

          <Section
            title="AppShell — the 3-column Layout v2 frame"
            desc="sidebar (expand/collapse) · center workspace (composer + artifact panel) · persistent rightRail with the StageTimeline · DetailDrawer on node click"
          >
            <AppShellDemo />
          </Section>

          <footer className="pt-6 text-center text-sm text-ink-soft">
            CaseScribe design system · runs on inline fixtures, zero backend
          </footer>
        </main>
      </div>
    </TooltipProvider>
  );
}
