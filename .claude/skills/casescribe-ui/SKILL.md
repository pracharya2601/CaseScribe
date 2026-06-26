---
name: casescribe-ui
description: The CaseScribe frontend design system — stack, design tokens (the 2-accent clinical palette), the 3-layer architecture (ui primitives → blocks → features), the reusable component inventory with prop contracts, motion/animation conventions, and the demo-grade polish bar. Load before building ANY frontend UI so primitives stay reusable and the look stays consistent and slick.
---

# CaseScribe — UI Design System

The goal is a UI that looks like a funded product on a projector, built fast, with **reusable primitives** so no two cards are styled by hand. The aesthetic is "clinical calm": lots of whitespace, crisp hierarchy, restrained color, tasteful motion. The contrast between the *raw input* pane and the *structured artifact* pane is the demo — design for that gap.

## Stack (locked)

- **React 18 + TypeScript + Vite** — fast HMR, builds to `frontend/dist/` (served by the FastAPI app).
- **Tailwind CSS v4** — utility styling + design tokens as CSS variables in `@theme`.
- **Radix UI primitives** (`@radix-ui/react-*`) under the hood for accessible Dialog/Tooltip/Switch/Tabs — wrap them, don't expose them raw.
- **Framer Motion** — the reveal animations, count-ups, layout transitions. Motion is a feature here (progressive artifact reveal), not decoration.
- **lucide-react** — icon set (consistent stroke weight).
- No component mega-frameworks (no MUI/AntD) — they look generic on stage. We build a small shadcn-style kit we own.

## Design tokens (`src/theme/tokens.css`, exposed via Tailwind `@theme`)

Two accent colors only, per `SPEC.md` §9 — everything else is neutral.

- **Neutrals**: slate scale. App bg `slate-50` (#F8FAFC), surfaces white, borders `slate-200`, primary text `slate-900`, secondary `slate-500`.
- **Success accent** (completion, billable, "all clear"): emerald — `emerald-600` (#059669).
- **Alert accent** (reporter trigger, non-billable warning): rose/red — `rose-600` (#E11D48). Use sparingly; its rarity is what makes it land.
- **Brand/interactive**: a single indigo `indigo-600` for primary buttons/links (keeps green/red reserved for *semantic* status, not chrome).
- **Type**: Inter (or system-ui fallback). Tabular numerals (`font-variant-numeric: tabular-nums`) for the timer, cost meter, reimbursement, latency — numbers must not jitter while animating.
- **Mono**: `ui-monospace` for PII tokens (`[PERSON_A]`), CPT codes, penal-code citations — signals "machine-precise."
- **Radius**: `rounded-2xl` on cards, `rounded-lg` on inputs/buttons. **Shadow**: `shadow-sm` resting, `shadow-md` on hover/active card. **Spacing**: generous — `p-6` card padding, `gap-6` between cards.
- Define all of the above as tokens so a future dark mode / district white-label is a token swap, not a rewrite.

## Architecture — 3 layers (this is how reuse happens)

```
src/
  theme/        tokens.css, motion.ts (shared transition presets)
  ui/           PRIMITIVES — dumb, reusable, zero business logic
  blocks/       COMPOSED patterns — built from ui/, still domain-agnostic-ish
  features/     PAGE-level — the actual CaseScribe screens, wired to data
  lib/          api client, mock data, the polling hook
  routes:       App (the screen) + /gallery (component preview)
```

Rule: **a component only imports from its own layer or below** (`features` → `blocks` → `ui` → `theme`). Never the reverse. If a feature needs a one-off style, first ask whether it belongs in `blocks` as a reusable pattern. This keeps the kit DRY and lets multiple agents build features in parallel against stable primitives.

### `/gallery` route (do this early)

A single page that renders every primitive and block in all variants/states (loading, success, alert, empty). It is your **Storybook-lite**: it lets the UI-kit agent finish *before* features exist, lets feature agents see what's available, and doubles as a polish surface. Cheap, high-leverage.

## `ui/` primitives (inventory + contracts)

Build these first; everything composes from them.

| Primitive | Key props / variants |
|---|---|
| `Button` | `variant: primary\|secondary\|ghost\|destructive`, `size`, `loading`, `icon` |
| `Card` + `CardHeader/Title/Content/Footer` | `tone?: neutral\|success\|alert` (drives border/icon accent) |
| `Badge` / `Pill` | `tone: neutral\|success\|alert\|info`, used for status ("Billable", "FLAG", "47s") |
| `Stat` | `label`, `value`, `sub?`, `tone?` — the timecard/cost building block |
| `Skeleton` | shimmer placeholder for pending artifacts |
| `ProgressDots` / `Spinner` | stage indicator while polling |
| `Switch` / `Toggle` | Radix-backed; for the scrub-viewer + edit mode |
| `Tabs` | Radix-backed; the 3-state scrub viewer |
| `Textarea` | autosize, the input panel |
| `FileDrop` | drag-drop txt/pdf, calls back with text |
| `Tooltip` | Radix-backed; explain model names, codes |
| `Dialog` | Radix-backed; confirm sign |
| `CountUp` | animated number (Framer) — timer, cost, reimbursement |
| `Separator` | hairline divider |

Each primitive: forwardRef, `className` merge (use a `cn()` helper = clsx + tailwind-merge), keyboard-accessible, no hardcoded colors (tokens only).

## `blocks/` composed patterns (CaseScribe-specific, reusable across states)

- **`ArtifactCard`** — the workhorse. Props: `title`, `icon`, `status: pending|running|done`, `tone`, `children` (body), `editable`, `onEdit`, and a fixed **draft footer stamp** ("DRAFT — Requires [name], LCSW signature"). Renders `Skeleton` while pending, springs in with a checkmark when done. The three Trinity artifacts are three instances of this — do not hand-build them separately.
- **`HeroBand`** — the count-up run timer vs muted "~90 min manual" baseline.
- **`CostMeter`** — "$0.04 this run vs $0.19 all-frontier" with the delta emphasized; animates from token data.
- **`ModelAttribution`** — list of `{step, model, latency_ms, tokens}` rows; the visible multi-model story.
- **`Timecard`** — aggregate `Stat`s ("sessions · $ recovered · hours saved") — the "hired employee" framing.
- **`ScrubViewer`** — `Tabs`: Raw → Model sees (`[PERSON_A]`) → Re-injected. The FERPA visual.
- **`InputPanel`** — `Textarea` + 3 scenario quick-load buttons + `FileDrop` + Run `Button` (lives in the New-Session composer).
- **`SignBar`** — sign action + "✎ N edits captured" flywheel readout (lives inside the Case Note drawer).
- **`AppShell`** — the layout frame: persistent left `SidebarNav`, a top header strip, the main content column, and a right `DetailDrawer` slot. Collapsible nav; respects the import rule (composes `ui` only).
- **`SidebarNav`** — brand + "New Session" + Demo scenarios + History, with a footer `Timecard` summary and a FERPA/PII badge.
- **`StageTimeline`** — the centerpiece: a vertical timeline of the 5 pipeline stages (`scrub → classify → reporter → medicaid → casenote`). Each node shows icon, stage name, status (pending `Skeleton`/running `Spinner`/done check), the **engine/model used** (e.g. "local Presidio", "Nemotron Nano", "Qwen3-Next T=0", "Claude Sonnet 4.6"), and latency + tokens. The reporter node carries the **single rose alert dot** when triggered. A completed node is clickable → opens the drawer. Nodes light up sequentially as `stage` advances.
- **`DetailDrawer`** — right-side drawer (Radix Dialog/Sheet) that slides in with the clicked stage's artifact: Scrub→`ScrubViewer`; Classify→classification fields; Reporter→flag detail (category, snippet, 36h timeline, draft SCAR / safety-plan, alert styling); Medicaid→code/units/reimbursement/justification; Case Note→SOAP/GIRP fields, editable + `SignBar`.

## Layout v2 — the app shell (current direction)

The screen is an **app shell**, not the old two-column split:

```
┌──────────┬───────────────────────────────────┬──────────┐
│ Sidebar  │ Header: HeroBand timer · CostMeter │          │
│ Nav      ├───────────────────────────────────┤ Detail   │
│ • New    │ New-Session composer (InputPanel)  │ Drawer   │
│ • Demos  │ ───────────────────────────────    │ (opens   │
│ • Hist.  │ StageTimeline                      │  on node │
│          │  ● Scrub      ✓ Presidio           │  click)  │
│ ┌──────┐ │  ● Classify   ✓ Nemotron Nano      │          │
│ │Time- │ │  ● Reporter ⚠ ✓ Qwen3-Next         │          │
│ │card  │ │  ● Medicaid   ✓ Qwen3-Coder         │          │
│ └──────┘ │  ● Case note  ⟳ Claude Sonnet 4.6  │          │
└──────────┴───────────────────────────────────┴──────────┘
```

- **Timeline = live pipeline stages** (not the 3 artifacts): nodes reveal sequentially as the job polls, each labeling its model — this is the multi-model attribution story, made central.
- **Detail drawer** holds the full artifact per stage; the Case Note drawer owns editing + Sign (flywheel capture).
- **Theme stays clinical light** (slate-50 shell, white surfaces, emerald success, the lone rose alert on the reporter node). Two accents only still holds.

## Motion conventions (`src/theme/motion.ts`)

Centralize presets so motion is consistent: a `springSoft` (cards), `fadeUp` (stagger reveal), `countUp` timing. Artifact cards reveal **staggered** as each sub-agent completes (driven by `stage`/poll), each with a checkmark pop. Keep durations 200–450ms — snappy, not sluggish. Respect `prefers-reduced-motion`.

## Demo-grade polish bar (what makes it look funded)

- Perfect vertical rhythm and alignment; nothing touching edges (generous padding).
- One alert-red moment in the whole screen (the reporter flag) — its scarcity is the impact.
- Numbers animate and use tabular-nums; tokens/codes in mono.
- Empty/loading/error states all designed (use the gallery to prove it) — a half-loaded card on stage reads as broken.
- The raw-input ↔ structured-artifact contrast is unmistakable at a glance.
- Runs entirely on `MOCK_TRINITY` with zero backend, so the UI demos even if the API is down (the WiFi will die — `SPEC.md` §15).

## How to add a new component (the recipe)

1. Lowest layer that fits (`ui` if reusable/dumb, `blocks` if it composes primitives for a pattern). 2. Tokens only, no hardcoded hex. 3. Add it to `/gallery` with every state. 4. Export from the layer's `index.ts`. 5. Only then consume it in a `feature`.
