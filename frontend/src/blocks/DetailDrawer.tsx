import { type ReactNode } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "../ui";

export interface DetailDrawerProps {
  /** Controlled open state. */
  open: boolean;
  /** Fired on ESC, overlay click, or close-button press. */
  onOpenChange: (open: boolean) => void;
  /** Header title (left of the close button). */
  title: ReactNode;
  /** Optional muted sub-label under the title. */
  sub?: ReactNode;
  /** Optional accent dot / icon shown before the title (e.g. stage status). */
  leading?: ReactNode;
  /** Scrollable body. */
  children: ReactNode;
  /** Optional sticky footer slot (e.g. SignBar). */
  footer?: ReactNode;
  className?: string;
}

/**
 * Right-side slide-in sheet built on Radix Dialog. ~440px on desktop,
 * full-width on mobile. Focus-trapped, ESC/overlay closes, reduced-motion safe
 * (entrance animation is disabled by the .drawer-content media query).
 */
export function DetailDrawer({
  open,
  onOpenChange,
  title,
  sub,
  leading,
  children,
  footer,
  className,
}: DetailDrawerProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="dlg-overlay fixed inset-0 z-50 bg-ink/40 backdrop-blur-[1px]" />
        <DialogPrimitive.Content
          className={cn(
            "drawer-content fixed inset-y-0 right-0 z-50 flex w-full max-w-full flex-col sm:w-[440px]",
            "bg-surface shadow-[var(--shadow-pop)] outline-none",
            "border-l border-border",
            className,
          )}
        >
          {/* header */}
          <div className="flex items-start justify-between gap-3 border-b border-border px-6 py-4">
            <div className="flex min-w-0 items-center gap-2.5">
              {leading && (
                <span className="flex shrink-0 items-center [&_svg]:size-5">
                  {leading}
                </span>
              )}
              <div className="min-w-0 leading-tight">
                <DialogPrimitive.Title className="truncate text-base font-semibold text-ink">
                  {title}
                </DialogPrimitive.Title>
                {sub && (
                  <DialogPrimitive.Description className="truncate text-sm text-ink-muted">
                    {sub}
                  </DialogPrimitive.Description>
                )}
              </div>
            </div>
            <DialogPrimitive.Close
              className="-mr-1 rounded-md p-1.5 text-ink-soft outline-none transition-colors hover:bg-surface-2 hover:text-ink focus-visible:ring-2 focus-visible:ring-brand/40"
              aria-label="Close"
            >
              <X className="size-4" />
            </DialogPrimitive.Close>
          </div>

          {/* scrollable body */}
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
            {children}
          </div>

          {/* sticky footer */}
          {footer && (
            <div className="border-t border-border bg-surface-2/40 px-6 py-4">
              {footer}
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
