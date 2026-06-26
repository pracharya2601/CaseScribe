import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Stethoscope,
  AlertTriangle,
  ShieldCheck,
  Receipt,
  Cpu,
  WifiOff,
  RefreshCw,
  ListChecks,
  Layers,
  CheckCircle2,
  ChevronDown,
  Plus,
} from "lucide-react";
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Badge,
  Pill,
  Stat,
  Spinner,
  Textarea,
  CountUp,
  Separator,
  TooltipProvider,
} from "../ui";
import {
  AppShell,
  SidebarNav,
  StageTimeline,
  HeroBand,
  CostMeter,
  ModelAttribution,
  ScrubViewer,
  InputPanel,
  SignBar,
  type StageNode,
  type NavHistoryItem,
  type ArtifactStatus,
} from "../blocks";
import {
  useJobPoll,
  runJob,
  captureEdits,
  costSummary,
  reinject,
  scrubString,
  MOCK_SCENARIOS,
  IS_MOCK,
  type EditCaptureRecord,
  type Stage,
  type TrinityResult,
} from "../lib";

const SIGNER = "Maria Reyes, LCSW";

/** SOAP / GIRP field labels (the fields dict is SOAP-shaped for both formats). */
const FIELD_LABELS: Record<string, Record<string, string>> = {
  SOAP: {
    subjective: "Subjective",
    objective: "Objective",
    assessment: "Assessment",
    plan: "Plan",
  },
  GIRP: {
    subjective: "Goal",
    objective: "Intervention",
    assessment: "Response",
    plan: "Plan",
  },
};
const FIELD_ORDER = ["subjective", "objective", "assessment", "plan"];

const CATEGORY_LABEL: Record<string, string> = {
  child_abuse_neglect: "Child abuse / neglect",
  suicidal_ideation: "Suicidal ideation",
  self_harm: "Self-harm",
  domestic_violence: "Domestic violence",
  title_ix: "Title IX",
  none: "None",
};

/**
 * The 5 pipeline timeline nodes, in order, each bound to the model `step` (from
 * models_used) that marks it done and its display model label.
 */
const TIMELINE: Array<{ key: string; label: string; model: string; step: string }> = [
  { key: "scrub", label: "Privacy scrub", model: "local Presidio", step: "scrub" },
  { key: "classify", label: "Classify session", model: "Nemotron Nano", step: "classifier" },
  { key: "reporter", label: "Mandated-report check", model: "Qwen3-Next · T=0", step: "reporter" },
  { key: "medicaid", label: "Medicaid coding", model: "Qwen3-Coder", step: "medicaid" },
  { key: "casenote", label: "Case note draft", model: "Claude Sonnet 4.6", step: "casenote" },
];

/** Mock history — past sessions; rose alert on the neglect & SI ones. */
const HISTORY: Array<NavHistoryItem & { scenarioId: string }> = [
  { id: "h1", label: "Marcus B-Q · neglect", sub: "90834 · $89.64", alert: true, scenarioId: "neglect" },
  { id: "h2", label: "Aanya F-P · IEP check-in", sub: "H2027 · $40.22", scenarioId: "iep_checkin" },
  { id: "h3", label: "Devon M-U · crisis SI", sub: "Non-billable · safety plan", alert: true, scenarioId: "si_crisis" },
  { id: "h4", label: "Priya S · reassessment", sub: "90832 · $58.10", scenarioId: "iep_checkin" },
];

/* ------------------------------- edit helpers ------------------------------ */

type Drafts = Record<string, string>;

function buildCaseNoteDrafts(view: TrinityResult): Drafts {
  const d: Drafts = {};
  if (view.case_note) {
    for (const k of FIELD_ORDER) d[`cn:${k}`] = view.case_note.fields[k] ?? "";
  }
  return d;
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let curr = new Array(n + 1).fill(0);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

/* --------------------------- feature-local pieces -------------------------- */

function DetailRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <div className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
        {label}
      </div>
      <div className="text-sm text-ink">{children}</div>
    </div>
  );
}

/** Compact run-status card for the header (before completion). */
function RunStatusCard({ stage, active }: { stage: Stage; active: boolean }) {
  const labelFor: Record<Stage, string> = {
    scrubbing: "Scrubbing PII locally…",
    classifying: "Classifying the session…",
    drafting: "Drafting the artifacts…",
    done: "Done",
  };
  return (
    <Card className="flex h-full items-center gap-4 px-6 py-5">
      <span className="flex size-11 items-center justify-center rounded-[var(--radius-input)] bg-brand-soft text-brand">
        {active ? <Spinner className="[&_svg]:size-5" /> : <ListChecks className="size-5" />}
      </span>
      <div>
        <div className="text-xs font-medium uppercase tracking-wide text-ink-soft">
          {active ? "Running pipeline" : "Ready"}
        </div>
        <div className="text-lg font-semibold text-ink">
          {active ? labelFor[stage] : "Load a session to begin"}
        </div>
      </div>
    </Card>
  );
}

function CostPlaceholder() {
  return (
    <Card className="flex h-full items-center gap-4 px-6 py-5">
      <span className="flex size-11 items-center justify-center rounded-[var(--radius-input)] bg-surface-2 text-ink-soft">
        <Cpu className="size-5" />
      </span>
      <div>
        <div className="text-xs font-medium uppercase tracking-wide text-ink-soft">
          Live cost meter
        </div>
        <div className="text-sm text-ink-muted">
          Spend vs. all-frontier populates as steps route to their models.
        </div>
      </div>
    </Card>
  );
}

/**
 * Collapsed composer — a one-line bar shown while the pipeline is running or
 * after completion. Clicking it (or the chevron) expands the full composer back;
 * "New session" resets the whole flow.
 */
function ComposerBar({
  summary,
  status,
  alert,
  onExpand,
  onNewSession,
}: {
  summary: string;
  status: "running" | "done" | "failed";
  alert?: boolean;
  onExpand: () => void;
  onNewSession: () => void;
}) {
  const leading =
    status === "running" ? (
      <Spinner className="text-brand [&_svg]:size-4" />
    ) : status === "failed" ? (
      <WifiOff className="size-4 text-alert" />
    ) : alert ? (
      <AlertTriangle className="size-4 text-alert" />
    ) : (
      <CheckCircle2 className="size-4 text-success" />
    );

  return (
    <Card className="flex items-center gap-2 px-3 py-2.5">
      <button
        type="button"
        onClick={onExpand}
        title="Expand the composer"
        className="group flex min-w-0 flex-1 items-center gap-3 rounded-[var(--radius-input)] px-1.5 py-1 text-left outline-none transition-colors hover:bg-surface-2/60 focus-visible:ring-2 focus-visible:ring-brand/40"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-input)] bg-surface-2">
          {leading}
        </span>
        <span className="min-w-0">
          <span className="block text-[11px] font-medium uppercase tracking-wide text-ink-soft">
            {status === "running"
              ? "Processing session"
              : status === "failed"
                ? "Run failed"
                : "Submitted session"}
          </span>
          <span className="block truncate text-sm font-medium text-ink">
            {summary || "Session transcript"}
          </span>
        </span>
        <ChevronDown className="ml-auto size-4 shrink-0 text-ink-soft transition-colors group-hover:text-ink" />
      </button>
      <Button
        variant="secondary"
        size="sm"
        icon={<Plus className="size-4" />}
        onClick={onNewSession}
      >
        New session
      </Button>
    </Card>
  );
}

/* ------------------------------- the screen -------------------------------- */

export function CaseScribeScreen() {
  const [jobId, setJobId] = useState<string | null>(null);
  const [runText, setRunText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [signed, setSigned] = useState(false);
  const [edits, setEdits] = useState<Drafts>({});
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [activeHistoryId, setActiveHistoryId] = useState<string | undefined>(undefined);
  const [collapsed, setCollapsed] = useState(false);
  const [composerKey, setComposerKey] = useState(0);
  const [composerForceOpen, setComposerForceOpen] = useState(false);
  const draftsRef = useRef<Drafts>({});
  const initForJob = useRef<string | null>(null);
  const composerRef = useRef<HTMLDivElement>(null);

  const job = useJobPoll(jobId);
  const stage: Stage = job?.stage ?? "scrubbing";
  const completed = job?.status === "completed";
  const failed = job?.status === "failed";
  const active = !!jobId && !completed && !failed;
  const models = job?.models ?? [];

  // Re-inject tokens -> real identities for DISPLAY (browser only).
  const view = useMemo<TrinityResult | undefined>(
    () => (job?.result ? reinject(job.result, job.result.token_map) : undefined),
    [job?.result],
  );

  const rf = view?.reporter_flag;
  const md = view?.medicaid;
  const cn = view?.case_note;
  const format = cn?.format ?? "SOAP";

  // Initialize editable case-note drafts once, when the note lands (completion).
  useEffect(() => {
    if (completed && view && initForJob.current !== jobId) {
      const d = buildCaseNoteDrafts(view);
      draftsRef.current = d;
      setEdits(d);
      initForJob.current = jobId;
    }
  }, [completed, view, jobId]);

  // Auto-select a meaningful artifact in the center once the run completes —
  // the reporter flag if it fired, otherwise the case note ready for signature.
  useEffect(() => {
    if (completed && view && activeKey === null) {
      setActiveKey(view.reporter_flag?.triggered ? "reporter" : "casenote");
    }
  }, [completed, view, activeKey]);

  const startRun = useCallback(async (text: string) => {
    setEdits({});
    draftsRef.current = {};
    initForJob.current = null;
    setSigned(false);
    setActiveKey(null);
    setComposerForceOpen(false); // collapse the composer while running
    setRunText(text);
    setSubmitting(true);
    try {
      const id = await runJob(text);
      setJobId(id);
    } finally {
      setSubmitting(false);
    }
  }, []);

  const handleNewSession = useCallback(() => {
    setJobId(null);
    setRunText("");
    setEdits({});
    draftsRef.current = {};
    initForJob.current = null;
    setSigned(false);
    setActiveKey(null);
    setActiveHistoryId(undefined);
    setComposerForceOpen(false);
    setComposerKey((k) => k + 1); // remount InputPanel -> clears its textarea
    requestAnimationFrame(() => {
      composerRef.current?.querySelector("textarea")?.focus();
    });
  }, []);

  const handleScenario = useCallback(
    (key: string) => {
      const s = MOCK_SCENARIOS.find((x) => x.id === key);
      if (!s) return;
      setActiveHistoryId(undefined);
      void startRun(s.dictation);
    },
    [startRun],
  );

  const handleHistory = useCallback(
    (id: string) => {
      const h = HISTORY.find((x) => x.id === id);
      if (!h) return;
      const s = MOCK_SCENARIOS.find((x) => x.id === h.scenarioId);
      if (!s) return;
      setActiveHistoryId(id);
      void startRun(s.dictation);
    },
    [startRun],
  );

  const setField = useCallback((id: string, v: string) => {
    setEdits((prev) => ({ ...prev, [id]: v }));
  }, []);

  const fieldVal = (id: string, fallback: string) =>
    completed && id in edits ? edits[id] : fallback;

  const editCount = useMemo(() => {
    let n = 0;
    for (const id of Object.keys(draftsRef.current)) {
      if ((edits[id] ?? "") !== (draftsRef.current[id] ?? "")) n++;
    }
    return n;
  }, [edits]);

  const cost = useMemo(() => costSummary(models), [models]);

  const modelByStep = useMemo(() => {
    const m: Record<string, { model: string; input_tokens: number }> = {};
    for (const r of models) m[r.step] = { model: r.model, input_tokens: r.input_tokens };
    return m;
  }, [models]);

  const onSign = useCallback(() => {
    const tokenMap = job?.result?.token_map;
    const ids = FIELD_ORDER.map((k) => `cn:${k}`);
    const changed = ids.some((id) => (edits[id] ?? "") !== (draftsRef.current[id] ?? ""));
    const records: EditCaptureRecord[] = [];
    if (changed) {
      const draftText = ids.map((id) => draftsRef.current[id] ?? "").join("\n");
      const finalText = ids.map((id) => edits[id] ?? "").join("\n");
      records.push({
        artifact_type: "case_note",
        model_used: modelByStep["casenote"]?.model ?? "anthropic/claude-sonnet-4.6",
        // Persist tokenized only — re-scrub originals back out before capture.
        draft: tokenMap ? scrubString(draftText, tokenMap) : draftText,
        final: tokenMap ? scrubString(finalText, tokenMap) : finalText,
        edit_distance: levenshtein(draftText, finalText),
        input_tokens: modelByStep["casenote"]?.input_tokens ?? 0,
      });
    }
    void captureEdits(records);
    setSigned(true);
  }, [edits, job?.result?.token_map, modelByStep]);

  /* ----- timeline nodes: pending -> running -> done from models_used ----- */
  const stepInfo = useMemo(() => {
    const m = new Map<string, (typeof models)[number]>();
    for (const r of models) m.set(r.step, r);
    return m;
  }, [models]);

  const tokenCount = view?.token_map ? Object.keys(view.token_map).length : 0;

  const summaryFor = useCallback(
    (key: string): string | undefined => {
      switch (key) {
        case "scrub":
          return tokenCount ? `${tokenCount} identifiers tokenized locally` : undefined;
        case "classify":
          return `${format} note · ${rf?.triggered ? "trigger candidate found" : "no trigger candidate"}`;
        case "reporter":
          return rf?.triggered
            ? `${CATEGORY_LABEL[rf.category] ?? rf.category} · ${Math.round(rf.confidence * 100)}%`
            : "No mandated report required";
        case "medicaid":
          return md?.billable
            ? `${md.cpt_code} · $${md.estimated_reimbursement_usd.toFixed(2)}`
            : "Non-billable encounter";
        case "casenote":
          return cn ? `${format} draft ready for signature` : undefined;
        default:
          return undefined;
      }
    },
    [format, rf, md, cn, tokenCount],
  );

  const stages: StageNode[] = useMemo(() => {
    let runningAssigned = false;
    return TIMELINE.map((t) => {
      const info = stepInfo.get(t.step);
      let status: ArtifactStatus;
      if (info) status = "done";
      else if (active && !runningAssigned) {
        status = "running";
        runningAssigned = true;
      } else status = "pending";

      let latencyMs = info?.latency_ms;
      let tokens = info ? info.input_tokens + info.output_tokens : undefined;
      if (t.key === "reporter") {
        const esc = stepInfo.get("reporter_escalation");
        if (esc) {
          latencyMs = (latencyMs ?? 0) + esc.latency_ms;
          tokens = (tokens ?? 0) + esc.input_tokens + esc.output_tokens;
        }
      }

      return {
        key: t.key,
        label: t.label,
        model: t.model,
        status,
        latencyMs,
        tokens,
        alert: t.key === "reporter" && !!rf?.triggered,
        summary: status === "done" ? summaryFor(t.key) : undefined,
      };
    });
  }, [stepInfo, active, rf?.triggered, summaryFor]);

  /* ------------------------------ derived nav ----------------------------- */

  const scenarioButtons = MOCK_SCENARIOS.map((s) => ({ label: s.short, text: s.dictation }));
  const navScenarios = MOCK_SCENARIOS.map((s) => ({ key: s.id, label: s.short }));

  const timecard = {
    sessions: completed ? 42 : 41,
    recoveredUsd: 3142.18 + (completed ? (md?.estimated_reimbursement_usd ?? 0) : 0),
    hoursSaved:
      58.5 +
      (completed && view?.elapsed_ms
        ? Math.max(90 * 60 - view.elapsed_ms / 1000, 0) / 3600
        : 0),
  };

  /* ------------------------------ detail body ----------------------------- */

  const reinjectedCaseNote = cn
    ? FIELD_ORDER.map((k) => `${FIELD_LABELS[format][k]}: ${cn.fields[k] ?? ""}`).join("\n\n")
    : "Re-injected result appears once the case note is drafted.";

  const scrubbedText = useMemo(
    () => (view?.token_map ? scrubString(runText, view.token_map) : runText),
    [runText, view?.token_map],
  );

  const activeNode = TIMELINE.find((t) => t.key === activeKey);

  const detailTitle = activeNode?.label ?? "";
  const detailSub = activeNode?.model;
  const reporterOpenAlert = activeKey === "reporter" && rf?.triggered;
  const detailLeading =
    activeKey === "reporter" ? (
      rf?.triggered ? (
        <span className="text-alert">
          <AlertTriangle />
        </span>
      ) : (
        <span className="text-success">
          <ShieldCheck />
        </span>
      )
    ) : activeKey === "medicaid" ? (
      <span className="text-ink-soft">
        <Receipt />
      </span>
    ) : activeKey === "casenote" ? (
      <span className="text-ink-soft">
        <Stethoscope />
      </span>
    ) : activeKey === "scrub" ? (
      <span className="text-success">
        <ShieldCheck />
      </span>
    ) : (
      <span className="text-ink-soft">
        <Layers />
      </span>
    );

  function renderDetailBody() {
    switch (activeKey) {
      case "scrub":
        return (
          <ScrubViewer
            raw={runText}
            scrubbed={scrubbedText}
            reinjected={
              rf?.triggered && rf.draft_filing
                ? `${reinjectedCaseNote}\n\n— MANDATED REPORT —\n${rf.draft_filing}`
                : reinjectedCaseNote
            }
            className="border-0 shadow-none"
          />
        );

      case "classify":
        return (
          <div className="space-y-5">
            <DetailRow label="Session type">Individual counseling</DetailRow>
            <DetailRow label="Note format">
              <Badge tone="brand" pill>
                {format}
              </Badge>
            </DetailRow>
            <DetailRow label="Modality">Pull-out · counselor office</DetailRow>
            <DetailRow label="Service window">
              {md?.description ?? "—"}
            </DetailRow>
            <DetailRow label="Candidate triggers">
              {rf?.triggered ? (
                <Badge tone="alert" pill>
                  {CATEGORY_LABEL[rf.category] ?? rf.category}
                </Badge>
              ) : (
                <Badge tone="success" pill>
                  None detected
                </Badge>
              )}
            </DetailRow>
            <p className="text-xs text-ink-muted">
              Routed by {activeNode?.model} on the scrubbed transcript — no PII
              left the browser.
            </p>
          </div>
        );

      case "reporter":
        if (!rf) return null;
        if (!rf.triggered)
          return (
            <div className="space-y-3 text-sm">
              <Pill tone="success">No mandated report</Pill>
              <p className="text-ink-muted">
                No CANRA reasonable-suspicion threshold met. Routine session —
                documented, no filing required.
              </p>
            </div>
          );
        return (
          <div className="space-y-4 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="alert" pill>
                {CATEGORY_LABEL[rf.category] ?? rf.category}
              </Badge>
              <Badge tone="alert">{Math.round(rf.confidence * 100)}% confidence</Badge>
              {rf.regex_hit && rf.llm_hit && <Badge tone="neutral">regex + LLM</Badge>}
            </div>
            <p className="rounded-md bg-alert-soft p-3 font-mono text-[12px] leading-relaxed text-alert-ink">
              “{rf.snippet}”
            </p>
            <p className="text-ink-muted">
              {rf.state} ·{" "}
              {rf.category === "child_abuse_neglect" ? (
                <>
                  file within{" "}
                  <span className="tnum font-medium text-ink">{rf.timeline_hours}h</span>{" "}
                  (DOJ SS 8572)
                </>
              ) : (
                "suicide-prevention protocol — not a CANRA filing"
              )}
            </p>
            <Separator />
            <DetailRow
              label={
                rf.category === "child_abuse_neglect"
                  ? "Draft SCAR filing"
                  : "Draft safety plan"
              }
            >
              <p className="whitespace-pre-wrap font-mono text-[12px] leading-relaxed text-ink">
                {rf.draft_filing ?? rf.snippet}
              </p>
            </DetailRow>
            <p className="text-xs text-ink-muted">
              Draft for {SIGNER} to review before submission.
            </p>
          </div>
        );

      case "medicaid":
        if (!md) return null;
        return (
          <div className="space-y-4 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              {md.billable ? (
                <Badge tone="success" pill>
                  Billable
                </Badge>
              ) : (
                <Badge tone="neutral" pill>
                  Not billable
                </Badge>
              )}
              {md.billable && (
                <Badge tone="info" className="font-mono">
                  {md.cpt_code}
                </Badge>
              )}
              {md.billable && md.units != null && (
                <Badge tone="neutral">{md.units} units</Badge>
              )}
            </div>
            <p className="text-ink-muted">{md.description}</p>
            <Stat
              label="Est. reimbursement"
              value={
                <CountUp value={md.estimated_reimbursement_usd} decimals={2} prefix="$" />
              }
              tone={md.billable ? "success" : "neutral"}
            />
            <Separator />
            <DetailRow label="Justification">
              <p className="whitespace-pre-wrap leading-relaxed text-ink">
                {md.justification}
              </p>
            </DetailRow>
          </div>
        );

      case "casenote":
        if (!cn) return null;
        return (
          <div className="space-y-4">
            <Badge tone="brand" pill>
              {format}
            </Badge>
            {FIELD_ORDER.map((k) => (
              <div key={k} className="space-y-1.5">
                <div className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
                  {FIELD_LABELS[format][k]}
                </div>
                <Textarea
                  autosize
                  minRows={2}
                  value={fieldVal(`cn:${k}`, cn.fields[k] ?? "")}
                  onChange={(e) => setField(`cn:${k}`, e.target.value)}
                  className="text-sm"
                />
              </div>
            ))}
            <p className="text-xs text-ink-muted">
              Edits are tracked and captured on sign — re-scrubbed to tokens
              before they feed the flywheel.
            </p>
          </div>
        );

      default:
        return null;
    }
  }

  /* -------------------------------- sidebar ------------------------------- */
  const sidebar = (
    <SidebarNav
      collapsed={collapsed}
      onToggleCollapsed={() => setCollapsed((c) => !c)}
      onNewSession={handleNewSession}
      scenarios={navScenarios}
      onScenario={handleScenario}
      history={HISTORY}
      activeHistoryId={activeHistoryId}
      onHistory={handleHistory}
      timecard={timecard}
    />
  );

  /* --------------------------------- header ------------------------------- */
  const header = (
    <div className="flex flex-wrap items-stretch gap-4 px-6 py-4">
      <div className="min-w-[280px] flex-1">
        {completed && view?.elapsed_ms ? (
          <HeroBand elapsedMs={view.elapsed_ms} className="h-full" />
        ) : (
          <RunStatusCard stage={stage} active={active} />
        )}
      </div>
      <div className="min-w-[280px] flex-1">
        {models.length > 0 ? (
          <CostMeter
            thisRunUsd={cost.actualUsd}
            allFrontierUsd={cost.allFrontierUsd}
            className="h-full"
          />
        ) : (
          <CostPlaceholder />
        )}
      </div>
      <div className="flex items-center gap-2 self-center">
        <Pill tone={IS_MOCK ? "info" : "success"}>{IS_MOCK ? "Demo data" : "Live"}</Pill>
        <a
          href="/gallery"
          className="rounded-lg px-2.5 py-1.5 text-sm text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
        >
          Gallery
        </a>
      </div>
    </div>
  );

  /* ----------------------------- right rail ------------------------------- */
  const railStatus: "running" | "done" | "failed" = failed
    ? "failed"
    : completed
      ? "done"
      : "running";

  const rightRail = (
    <div className="flex flex-col gap-4 p-4">
      <StageTimeline
        stages={stages}
        activeKey={activeKey ?? undefined}
        onNodeClick={(k) => setActiveKey(k)}
      />
      {models.length > 0 ? (
        <ModelAttribution rows={models} />
      ) : (
        <Card className="px-5 py-6 text-center">
          <span className="mx-auto mb-2 flex size-9 items-center justify-center rounded-full bg-surface-2 text-ink-soft">
            <Cpu className="size-4" />
          </span>
          <p className="text-sm font-medium text-ink">Live pipeline</p>
          <p className="mt-1 text-xs text-ink-muted">
            Each stage lights up here with the model that handled it. Click a
            completed node to inspect its artifact in the workspace.
          </p>
        </Card>
      )}
      {railStatus === "running" && jobId && (
        <p className="px-1 text-center text-xs text-ink-soft">
          Routing each step to its model · PII scrubbed locally first.
        </p>
      )}
    </div>
  );

  /* ---------------------------------- main -------------------------------- */
  const showFullComposer = !jobId || composerForceOpen;

  const matchedScenario = MOCK_SCENARIOS.find((s) => s.dictation === runText);
  const composerSummary =
    matchedScenario?.short ??
    (runText.length > 90 ? `${runText.slice(0, 90).trim()}…` : runText);

  return (
    <TooltipProvider>
      <AppShell sidebar={sidebar} header={header} rightRail={rightRail}>
        <div className="space-y-6">
          {/* Composer — full when idle, compact bar once a run is underway */}
          <div ref={composerRef}>
            {showFullComposer ? (
              <InputPanel
                key={composerKey}
                scenarios={scenarioButtons}
                loading={submitting || active}
                onRun={startRun}
              />
            ) : (
              <ComposerBar
                summary={composerSummary}
                status={railStatus}
                alert={!!rf?.triggered}
                onExpand={() => setComposerForceOpen(true)}
                onNewSession={handleNewSession}
              />
            )}
          </div>

          {failed && (
            <Card tone="alert" className="flex flex-col items-center gap-2 py-8 text-center">
              <span className="flex size-10 items-center justify-center rounded-full bg-alert-soft text-alert">
                <WifiOff className="size-5" />
              </span>
              <p className="text-sm font-medium text-ink">
                Couldn’t reach the model service
              </p>
              <p className="max-w-md text-sm text-ink-muted">
                {job?.error ?? "The job failed."} Your transcript is safe and was
                not sent.
              </p>
              <Button
                variant="secondary"
                size="sm"
                icon={<RefreshCw className="size-4" />}
                onClick={() => runText && startRun(runText)}
              >
                Retry
              </Button>
            </Card>
          )}

          {/* Idle hint */}
          {!jobId && (
            <Card className="flex flex-col items-center gap-2 py-10 text-center">
              <span className="flex size-10 items-center justify-center rounded-full bg-brand-soft text-brand">
                <Layers className="size-5" />
              </span>
              <p className="text-sm font-medium text-ink">No session loaded yet</p>
              <p className="max-w-md text-sm text-ink-muted">
                Load a scenario from the sidebar (or paste a transcript) and press
                Run. The pipeline lights up in the right rail, stage by stage, and
                each artifact opens here in the workspace.
              </p>
            </Card>
          )}

          {/* Running placeholder (before any result lands) */}
          {jobId && !completed && !failed && (
            <Card className="flex flex-col items-center gap-3 py-12 text-center">
              <Spinner className="text-brand [&_svg]:size-6" />
              <p className="text-sm font-medium text-ink">
                {stage === "scrubbing"
                  ? "Scrubbing PII locally…"
                  : stage === "classifying"
                    ? "Classifying the session…"
                    : "Drafting the artifacts…"}
              </p>
              <p className="max-w-md text-sm text-ink-muted">
                Watch the right-rail timeline — artifacts appear here as each
                model finishes its step.
              </p>
            </Card>
          )}

          {/* Inline artifact detail — the primary detail surface */}
          {completed && view && activeKey && (
            <>
              <Card
                tone={reporterOpenAlert ? "alert" : "neutral"}
                className={reporterOpenAlert ? "border-l-4 border-l-alert" : undefined}
              >
                <CardHeader>
                  <CardTitle icon={detailLeading} sub={detailSub}>
                    {detailTitle}
                  </CardTitle>
                  {reporterOpenAlert && (
                    <Badge tone="alert" pill>
                      <AlertTriangle className="size-3" /> Mandated report
                    </Badge>
                  )}
                </CardHeader>
                <CardContent>{renderDetailBody()}</CardContent>
              </Card>

              {activeKey === "casenote" && (
                <SignBar
                  editCount={editCount}
                  signer={SIGNER}
                  signed={signed}
                  onSign={onSign}
                />
              )}
            </>
          )}

          {completed && (
            <div className="flex items-center justify-center gap-2 pb-2 text-sm text-ink-soft">
              {signed ? (
                <>
                  <CheckCircle2 className="size-4 text-success" />
                  Signed by {SIGNER}
                </>
              ) : (
                <>
                  <Stethoscope className="size-4" />
                  {activeKey === "casenote"
                    ? `Edit the case note and sign · ${editCount} edits so far`
                    : "Open the Case note draft from the timeline to edit & sign"}
                </>
              )}
            </div>
          )}

          <footer className="pt-1 text-center text-xs text-ink-soft">
            {IS_MOCK
              ? "Running on demo fixtures · zero backend (SPEC §15)"
              : "Live · AgentBox job pipeline"}{" "}
            · PII scrubbed locally before any model call
          </footer>
        </div>
      </AppShell>
    </TooltipProvider>
  );
}
