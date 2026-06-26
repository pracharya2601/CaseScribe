import { type ReactNode } from "react";
import { cn } from "../ui";

export interface AppShellProps {
  /** Persistent left rail — typically <SidebarNav />. */
  sidebar: ReactNode;
  /** Top header strip over the main column (HeroBand timer · CostMeter). */
  header?: ReactNode;
  /** Main content column. */
  children: ReactNode;
  /**
   * Persistent right rail — the live-pipeline home for <StageTimeline />. A
   * ~320px column with its own vertical scroll and a hairline left border.
   * Hidden below `lg`, where it collapses out of the frame (use `drawer` for
   * the small-screen overlay path instead).
   */
  rightRail?: ReactNode;
  /**
   * Right detail drawer — typically <DetailDrawer />. It self-portals as an
   * overlay sheet, so it sits outside the layout flow; passed here so the shell
   * owns the full frame in one place. Remains available as an optional overlay
   * (e.g. mobile / on-demand detail), independent of `rightRail`.
   */
  drawer?: ReactNode;
  className?: string;
  /** Constrain the main column width; defaults to a comfortable reading max. */
  mainClassName?: string;
  /** Override the persistent right-rail width/box. Defaults to ~320px. */
  railClassName?: string;
}

/**
 * The app-shell layout frame: a three-column fixed-height flex frame —
 * persistent left sidebar · center workspace (fixed header + scrolling main) ·
 * persistent right rail (the live `StageTimeline`). The center main column and
 * the right rail scroll independently; the header stays fixed. A `drawer` slot
 * remains for an optional self-portaling overlay sheet. Composes `ui` only.
 */
export function AppShell({
  sidebar,
  header,
  children,
  rightRail,
  drawer,
  className,
  mainClassName,
  railClassName,
}: AppShellProps) {
  return (
    <div className={cn("flex h-screen w-full overflow-hidden bg-app", className)}>
      {/* left rail (hidden on the smallest screens; collapse to icons above) */}
      <aside className="hidden shrink-0 sm:flex">{sidebar}</aside>

      {/* center workspace: fixed header + independently-scrolling main */}
      <div className="flex min-w-0 flex-1 flex-col">
        {header && (
          <header className="shrink-0 border-b border-border bg-surface/80 backdrop-blur-md">
            {header}
          </header>
        )}
        <main className="min-h-0 flex-1 overflow-y-auto">
          <div className={cn("mx-auto w-full max-w-3xl px-6 py-8", mainClassName)}>
            {children}
          </div>
        </main>
      </div>

      {/* persistent right rail — scrolls independently; hidden below lg */}
      {rightRail && (
        <aside
          className={cn(
            "hidden min-h-0 min-w-0 shrink-0 flex-col overflow-y-auto overflow-x-hidden border-l border-border bg-surface/40 lg:flex",
            "w-[320px]",
            railClassName,
          )}
        >
          {rightRail}
        </aside>
      )}

      {/* right drawer (self-portaling overlay sheet) */}
      {drawer}
    </div>
  );
}
