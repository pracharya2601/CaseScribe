import { type ReactNode } from "react";
import {
  Stethoscope,
  Plus,
  Sparkles,
  Clock,
  ShieldCheck,
  PanelLeftClose,
  PanelLeft,
  TriangleAlert,
} from "lucide-react";
import { Button, Badge, CountUp, cn } from "../ui";

export interface NavScenario {
  key: string;
  label: string;
}

export interface NavHistoryItem {
  id: string;
  label: string;
  /** e.g. a date or "90834 · $89.64". */
  sub?: string;
  /** Renders a rose dot — a past session that fired a mandatory report. */
  alert?: boolean;
}

export interface SidebarNavProps {
  /** Icons-only rail when true. */
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  onNewSession?: () => void;
  scenarios: NavScenario[];
  onScenario?: (key: string) => void;
  history: NavHistoryItem[];
  activeHistoryId?: string;
  onHistory?: (id: string) => void;
  /** Footer compact timecard summary. */
  timecard: { sessions: number; recoveredUsd: number; hoursSaved: number };
  className?: string;
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="px-3 pb-1.5 pt-4 text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
      {children}
    </div>
  );
}

function NavItem({
  icon,
  label,
  sub,
  active,
  alert,
  collapsed,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  sub?: string;
  active?: boolean;
  alert?: boolean;
  collapsed?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={collapsed ? label : undefined}
      aria-current={active ? "true" : undefined}
      className={cn(
        "group flex w-full items-center gap-2.5 rounded-[var(--radius-input)] px-3 py-2 text-left text-sm outline-none transition-colors",
        "focus-visible:ring-2 focus-visible:ring-brand/40",
        active
          ? "bg-brand-soft/60 text-brand-ink"
          : "text-ink-muted hover:bg-surface-2 hover:text-ink",
        collapsed && "justify-center px-0",
      )}
    >
      <span className="relative flex shrink-0 [&_svg]:size-4">
        {icon}
        {alert && collapsed && (
          <span className="absolute -right-1 -top-1 size-1.5 rounded-full bg-alert" />
        )}
      </span>
      {!collapsed && (
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate font-medium">{label}</span>
            {alert && <span className="size-1.5 shrink-0 rounded-full bg-alert" />}
          </span>
          {sub && <span className="block truncate text-xs text-ink-soft">{sub}</span>}
        </span>
      )}
    </button>
  );
}

/**
 * The persistent left rail: brand, New Session, demo scenarios, history, and a
 * footer holding a compact timecard summary + the FERPA "scrubbed locally"
 * badge. Collapses to an icon rail.
 */
export function SidebarNav({
  collapsed = false,
  onToggleCollapsed,
  onNewSession,
  scenarios,
  onScenario,
  history,
  activeHistoryId,
  onHistory,
  timecard,
  className,
}: SidebarNavProps) {
  return (
    <nav
      className={cn(
        "flex h-full flex-col border-r border-border bg-surface",
        collapsed ? "w-16" : "w-64",
        "transition-[width] duration-200",
        className,
      )}
    >
      {/* brand + collapse toggle */}
      <div
        className={cn(
          "flex items-center gap-2.5 px-4 py-4",
          collapsed && "justify-center px-0",
        )}
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand text-white">
          <Stethoscope className="size-4" />
        </span>
        {!collapsed && (
          <span className="flex-1 text-base font-semibold tracking-tight text-ink">
            CaseScribe
          </span>
        )}
        {onToggleCollapsed && !collapsed && (
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-label="Collapse sidebar"
            className="rounded-md p-1 text-ink-soft outline-none transition-colors hover:bg-surface-2 hover:text-ink focus-visible:ring-2 focus-visible:ring-brand/40"
          >
            <PanelLeftClose className="size-4" />
          </button>
        )}
      </div>

      {collapsed && onToggleCollapsed && (
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label="Expand sidebar"
          className="mx-auto mb-1 rounded-md p-1.5 text-ink-soft outline-none transition-colors hover:bg-surface-2 hover:text-ink focus-visible:ring-2 focus-visible:ring-brand/40"
        >
          <PanelLeft className="size-4" />
        </button>
      )}

      {/* New session */}
      <div className={cn("px-3", collapsed && "px-2")}>
        {collapsed ? (
          <Button
            size="sm"
            onClick={onNewSession}
            aria-label="New session"
            className="w-full justify-center px-0"
            icon={<Plus className="size-4" />}
          />
        ) : (
          <Button
            size="sm"
            onClick={onNewSession}
            className="w-full"
            icon={<Plus className="size-4" />}
          >
            New session
          </Button>
        )}
      </div>

      {/* scrollable lists */}
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-1">
        {!collapsed && <SectionLabel>Demo scenarios</SectionLabel>}
        <div className="flex flex-col gap-0.5">
          {scenarios.map((s) => (
            <NavItem
              key={s.key}
              icon={<Sparkles />}
              label={s.label}
              collapsed={collapsed}
              onClick={() => onScenario?.(s.key)}
            />
          ))}
        </div>

        {!collapsed && <SectionLabel>History</SectionLabel>}
        <div className="flex flex-col gap-0.5">
          {history.map((h) => (
            <NavItem
              key={h.id}
              icon={h.alert ? <TriangleAlert /> : <Clock />}
              label={h.label}
              sub={h.sub}
              alert={h.alert}
              active={h.id === activeHistoryId}
              collapsed={collapsed}
              onClick={() => onHistory?.(h.id)}
            />
          ))}
        </div>
      </div>

      {/* footer: compact timecard + FERPA badge */}
      <div className="border-t border-border p-3">
        {!collapsed ? (
          <div className="space-y-2.5">
            <div className="grid grid-cols-3 gap-2 rounded-[var(--radius-input)] bg-surface-2/60 px-3 py-2.5 text-center">
              <div>
                <div className="tnum text-sm font-semibold text-ink">
                  <CountUp value={timecard.sessions} />
                </div>
                <div className="text-[10px] uppercase tracking-wide text-ink-soft">
                  sessions
                </div>
              </div>
              <div>
                <div className="tnum text-sm font-semibold text-success-ink">
                  <CountUp value={timecard.recoveredUsd} decimals={0} prefix="$" />
                </div>
                <div className="text-[10px] uppercase tracking-wide text-ink-soft">
                  recovered
                </div>
              </div>
              <div>
                <div className="tnum text-sm font-semibold text-brand-ink">
                  <CountUp value={timecard.hoursSaved} decimals={0} suffix="h" />
                </div>
                <div className="text-[10px] uppercase tracking-wide text-ink-soft">
                  saved
                </div>
              </div>
            </div>
            <Badge tone="success" className="w-full justify-center" icon={<ShieldCheck />}>
              PII scrubbed locally · FERPA
            </Badge>
          </div>
        ) : (
          <div className="flex justify-center" title="PII scrubbed locally · FERPA">
            <span className="flex size-9 items-center justify-center rounded-full bg-success-soft text-success">
              <ShieldCheck className="size-4" />
            </span>
          </div>
        )}
      </div>
    </nav>
  );
}
