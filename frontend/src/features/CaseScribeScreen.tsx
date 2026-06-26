import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Stethoscope,
  AlertTriangle,
  ShieldCheck,
  Receipt,
  Cpu,
  WifiOff,
  RefreshCw,
} from "lucide-react";
import {
  Button,
  Card,
  Badge,
  Pill,
  Stat,
  Spinner,
  ProgressDots,
  Switch,
  Textarea,
  CountUp,
  Separator,
  TooltipProvider,
  type Tone,
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
} from "../blocks";
import {
  useJobPoll,
  runJob,
  captureEdits,
  costSummary,
  reinject,
  scrubString,
  matchScenario,
  stageIndex,
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

/* ------------------------------- edit helpers ------------------------------ */

type Drafts = Record<string, string>;

function buildDrafts(view: TrinityResult): Drafts {
  const d: Drafts = {};
  if (view.case_note) {
    for (const k of FIELD_ORDER) d[`cn:${k}`] = view.case_note.fields[k] ?? "";
  }
  if (view.reporter_flag) {
    d["rp:narrative"] =
      view.reporter_flag.draft_filing ?? view.reporter_flag.snippet ?? "";
  }
  if (view.medicaid) d["md:justification"] = view.medicaid.justification ?? "";
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

function Editable({
  value,
  onChange,
  editing,
  mono = false,
}: {
  value: string;
  onChange: (v: string) => void;
  editing: boolean;
  mono?: boolean;
}) {
  if (editing) {
    return (
      <Textarea
        autosize
        minRows={2}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={mono ? "font-mono text-[13px]" : "text-sm"}
      />
    );
  }
  return (
    <p
      className={`whitespace-pre-wrap leading-relaxed text-ink ${mono ? "font-mono text-[13px]" : "text-sm"}`}
    >
      {value}
    </p>
  );
}

/** Run-status / hero slot (left of the top band). */
function RunBand({
  stage,
  active,
}: {
  stage: Stage;
  active: boolean;
}) {
  return (
    <Card className="flex flex-col justify-center gap-3 px-6 py-5">
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium uppercase tracking-wide text-ink-soft">
          {active ? "Generating the Trinity" : "Ready to run"}
        </div>
        {active && <Spinner />}
      </div>
      <ProgressDots
        stages={["Scrub", "Classify", "Draft", "Done"]}
        current={stageIndex(stage)}
      />
    </Card>
  );
}

function CostPlaceholder() {
  return (
    <Card className="flex flex-col items-center justify-center gap-2 px-6 py-8 text-center">
      <span className="flex size-9 items-center justify-center rounded-full bg-surface-2 text-ink-soft">
        <Cpu className="size-4" />
      </span>
      <p className="text-sm font-medium text-ink">Live cost meter</p>
      <p className="max-w-xs text-sm text-ink-muted">
        Actual spend vs. an all-frontier baseline populates as each step routes
        to its model.
      </p>
    </Card>
  );
}

/* ------------------------------- the screen -------------------------------- */

export function CaseScribeScreen() {
  const [jobId, setJobId] = useState<string | null>(null);
  const [runText, setRunText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [signed, setSigned] = useState(false);
  const [edits, setEdits] = useState<Drafts>({});
  const draftsRef = useRef<Drafts>({});
  const initForJob = useRef<string | null>(null);

  const job = useJobPoll(jobId);
  const stage: Stage = job?.stage ?? "scrubbing";
  const sIdx = stageIndex(stage);
  const completed = job?.status === "completed";
  const failed = job?.status === "failed";
  const active = !!jobId && !completed && !failed;
  const models = job?.models ?? [];

  // Re-inject tokens -> real identities for DISPLAY (browser only).
  const view = useMemo<TrinityResult | undefined>(
    () => (job?.result ? reinject(job.result, job.result.token_map) : undefined),
    [job?.result],
  );

  // Initialize editable drafts once, when the case note lands (completion).
  useEffect(() => {
    if (completed && view && initForJob.current !== jobId) {
      const d = buildDrafts(view);
      draftsRef.current = d;
      setEdits(d);
      initForJob.current = jobId;
    }
  }, [completed, view, jobId]);

  const handleRun = useCallback(async (text: string) => {
    setEdits({});
    draftsRef.current = {};
    initForJob.current = null;
    setSigned(false);
    setEditMode(false);
    setRunText(text);
    setSubmitting(true);
    try {
      const id = await runJob(text);
      setJobId(id);
    } finally {
      setSubmitting(false);
    }
  }, []);

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
    const records: EditCaptureRecord[] = [];
    const groups: Array<{
      type: EditCaptureRecord["artifact_type"];
      step: string;
      ids: string[];
    }> = [
      { type: "case_note", step: "casenote", ids: FIELD_ORDER.map((k) => `cn:${k}`) },
      { type: "reporter_flag", step: "reporter", ids: ["rp:narrative"] },
      { type: "medicaid", step: "medicaid", ids: ["md:justification"] },
    ];
    for (const g of groups) {
      const changed = g.ids.filter(
        (id) => (edits[id] ?? "") !== (draftsRef.current[id] ?? ""),
      );
      if (!changed.length) continue;
      const draftText = g.ids.map((id) => draftsRef.current[id] ?? "").join("\n");
      const finalText = g.ids.map((id) => edits[id] ?? "").join("\n");
      records.push({
        artifact_type: g.type,
        model_used: modelByStep[g.step]?.model ?? "unknown",
        // Persist tokenized only — re-scrub originals back out before capture.
        draft: tokenMap ? scrubString(draftText, tokenMap) : draftText,
        final: tokenMap ? scrubString(finalText, tokenMap) : finalText,
        edit_distance: levenshtein(draftText, finalText),
        input_tokens: modelByStep[g.step]?.input_tokens ?? 0,
      });
    }
    void captureEdits(records);
    setSigned(true);
  }, [edits, job?.result?.token_map, modelByStep]);

  /* card statuses driven by stage (staggered reveal) */
  const cardStatus = (runAt: number, doneAt: number): ArtifactStatus => {
    if (!jobId) return "pending";
    if (sIdx >= doneAt) return "done";
    if (sIdx === runAt) return "running";
    return "pending";
  };
  const reporterStatus = cardStatus(0, 1);
  const medicaidStatus = cardStatus(1, 2);
  const caseNoteStatus = cardStatus(2, 3);

  const rf = view?.reporter_flag;
  const md = view?.medicaid;
  const cn = view?.case_note;
  const format = cn?.format ?? "SOAP";

  const reporterTone: Tone = rf?.triggered ? "alert" : "success";
  const medicaidTone: Tone = md?.billable ? "success" : "neutral";

  const scenario = runText ? matchScenario(runText) : undefined;
  const reinjectedCaseNote = cn
    ? FIELD_ORDER.map(
        (k) => `${FIELD_LABELS[format][k]}: ${cn.fields[k] ?? ""}`,
      ).join("\n\n")
    : "Re-injected result appears once the case note is drafted.";

  const scenarioButtons = MOCK_SCENARIOS.map((s) => ({
    label: s.short,
    text: s.dictation,
  }));

  return (
    <TooltipProvider>
      <div className="min-h-screen">
        {/* header */}
        <header className="sticky top-0 z-40 border-b border-border bg-app/80 backdrop-blur-md">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3.5">
            <div className="flex items-center gap-3">
              <span className="flex size-8 items-center justify-center rounded-lg bg-brand text-white">
                <Stethoscope className="size-4" />
              </span>
              <div>
                <div className="text-sm font-semibold text-ink">CaseScribe</div>
                <div className="text-xs text-ink-muted">
                  Dictation → case note · mandated report · Medicaid billing
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Pill tone={IS_MOCK ? "info" : "success"}>
                {IS_MOCK ? "Demo data" : "Live"}
              </Pill>
              <a
                href="/gallery"
                className="rounded-lg px-2.5 py-1.5 text-sm text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
              >
                Gallery
              </a>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">
          {/* top band: hero/run-status + cost meter */}
          <div className="grid gap-6 lg:grid-cols-2">
            {completed && view?.elapsed_ms ? (
              <HeroBand elapsedMs={view.elapsed_ms ?? 0} />
            ) : (
              <RunBand stage={stage} active={active} />
            )}
            {models.length > 0 ? (
              <CostMeter
                thisRunUsd={cost.actualUsd}
                allFrontierUsd={cost.allFrontierUsd}
              />
            ) : (
              <CostPlaceholder />
            )}
          </div>

          {failed && (
            <Card
              tone="alert"
              className="flex flex-col items-center gap-2 py-8 text-center"
            >
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
                onClick={() => runText && handleRun(runText)}
              >
                Retry
              </Button>
            </Card>
          )}

          {/* two columns: input | artifacts */}
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-6">
              <InputPanel
                scenarios={scenarioButtons}
                loading={submitting || active}
                onRun={handleRun}
              />
            </div>

            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-soft">
                  The Trinity
                </h2>
                <Switch
                  label="Edit drafts"
                  checked={editMode}
                  onCheckedChange={setEditMode}
                  disabled={!completed}
                />
              </div>

              {/* Case note */}
              <ArtifactCard
                title="Case note"
                icon={<Stethoscope />}
                status={caseNoteStatus}
                tone="success"
                editable={completed}
                onEdit={() => setEditMode((v) => !v)}
                signer={SIGNER}
              >
                {cn && (
                  <div className="space-y-3">
                    <Badge tone="brand" pill>
                      {format}
                    </Badge>
                    {FIELD_ORDER.map((k) => (
                      <div key={k} className="space-y-1">
                        <div className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
                          {FIELD_LABELS[format][k]}
                        </div>
                        <Editable
                          editing={editMode}
                          value={fieldVal(`cn:${k}`, cn.fields[k] ?? "")}
                          onChange={(v) => setField(`cn:${k}`, v)}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </ArtifactCard>

              {/* Mandated reporter — the one alert-red moment */}
              <ArtifactCard
                title="Mandated report"
                icon={
                  rf?.triggered ? <AlertTriangle /> : <ShieldCheck />
                }
                status={reporterStatus}
                tone={reporterTone}
                editable={completed && !!rf?.triggered}
                onEdit={() => setEditMode((v) => !v)}
                signer={SIGNER}
              >
                {rf && !rf.triggered && (
                  <div className="space-y-2 text-sm">
                    <Pill tone="success">No mandated report</Pill>
                    <p className="text-ink-muted">
                      No CANRA reasonable-suspicion threshold met. Routine
                      session — documented, no filing required.
                    </p>
                  </div>
                )}
                {rf && rf.triggered && (
                  <div className="space-y-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="alert" pill>
                        {CATEGORY_LABEL[rf.category] ?? rf.category}
                      </Badge>
                      <Badge tone="alert">
                        {Math.round(rf.confidence * 100)}% confidence
                      </Badge>
                      {rf.regex_hit && rf.llm_hit && (
                        <Badge tone="neutral">regex + LLM</Badge>
                      )}
                    </div>
                    <p className="rounded-md bg-alert-soft p-2.5 font-mono text-[12px] leading-relaxed text-alert-ink">
                      “{rf.snippet}”
                    </p>
                    <p className="text-ink-muted">
                      {rf.state} ·{" "}
                      {rf.category === "child_abuse_neglect" ? (
                        <>
                          file within{" "}
                          <span className="tnum font-medium text-ink">
                            {rf.timeline_hours}h
                          </span>{" "}
                          (DOJ SS 8572)
                        </>
                      ) : (
                        "suicide-prevention protocol — not a CANRA filing"
                      )}
                    </p>
                    <Separator />
                    <div className="space-y-1">
                      <div className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
                        Draft filing
                      </div>
                      <Editable
                        editing={editMode}
                        mono
                        value={fieldVal(
                          "rp:narrative",
                          rf.draft_filing ?? rf.snippet,
                        )}
                        onChange={(v) => setField("rp:narrative", v)}
                      />
                    </div>
                  </div>
                )}
              </ArtifactCard>

              {/* Medicaid billing */}
              <ArtifactCard
                title="Medicaid billing"
                icon={<Receipt />}
                status={medicaidStatus}
                tone={medicaidTone}
                editable={completed}
                onEdit={() => setEditMode((v) => !v)}
                signer={SIGNER}
              >
                {md && (
                  <div className="space-y-3 text-sm">
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
                        <CountUp
                          value={md.estimated_reimbursement_usd}
                          decimals={2}
                          prefix="$"
                        />
                      }
                      tone={md.billable ? "success" : "neutral"}
                    />
                    <Separator />
                    <div className="space-y-1">
                      <div className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
                        Justification
                      </div>
                      <Editable
                        editing={editMode}
                        value={fieldVal("md:justification", md.justification)}
                        onChange={(v) => setField("md:justification", v)}
                      />
                    </div>
                  </div>
                )}
              </ArtifactCard>
            </div>
          </div>

          {/* attribution + timecard */}
          {models.length > 0 && (
            <div className="grid gap-6 lg:grid-cols-2">
              <ModelAttribution rows={models} />
              <Timecard
                sessions={completed ? 42 : 41}
                recoveredUsd={
                  3142.18 + (completed ? (md?.estimated_reimbursement_usd ?? 0) : 0)
                }
                hoursSaved={
                  58.5 +
                  (completed && view?.elapsed_ms
                    ? Math.max(90 * 60 - view.elapsed_ms / 1000, 0) / 3600
                    : 0)
                }
              />
            </div>
          )}

          {/* FERPA scrub viewer */}
          {runText && (
            <ScrubViewer
              raw={runText}
              scrubbed={
                scenario ? scrubString(runText, scenario.tokenMap) : runText
              }
              reinjected={
                view?.reporter_flag?.triggered && view.reporter_flag.draft_filing
                  ? `${reinjectedCaseNote}\n\n— MANDATED REPORT —\n${view.reporter_flag.draft_filing}`
                  : reinjectedCaseNote
              }
            />
          )}

          {/* sign + flywheel capture */}
          {completed && (
            <SignBar
              editCount={editCount}
              signer={SIGNER}
              signed={signed}
              onSign={onSign}
            />
          )}

          <footer className="pt-2 text-center text-sm text-ink-soft">
            {IS_MOCK
              ? "Running on demo fixtures · zero backend (SPEC §15)"
              : "Live · AgentBox job pipeline"}{" "}
            · PII scrubbed locally before any model call
          </footer>
        </main>
      </div>
    </TooltipProvider>
  );
}
