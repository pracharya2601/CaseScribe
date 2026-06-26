import { forwardRef } from "react";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import { cn } from "./cn";

export interface SwitchProps
  extends React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root> {
  label?: string;
}

export const Switch = forwardRef<
  React.ElementRef<typeof SwitchPrimitive.Root>,
  SwitchProps
>(({ className, label, id, ...props }, ref) => {
  const control = (
    <SwitchPrimitive.Root
      id={id}
      ref={ref}
      className={cn(
        "peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-[var(--radius-pill)] border-2 border-transparent transition-colors outline-none",
        "focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-1 focus-visible:ring-offset-app",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "data-[state=unchecked]:bg-border-strong data-[state=checked]:bg-brand",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          "pointer-events-none block size-5 rounded-full bg-white shadow-sm transition-transform",
          "data-[state=unchecked]:translate-x-0 data-[state=checked]:translate-x-5",
        )}
      />
    </SwitchPrimitive.Root>
  );

  if (!label) return control;
  return (
    <label htmlFor={id} className="inline-flex items-center gap-2.5 cursor-pointer">
      {control}
      <span className="text-sm font-medium text-ink select-none">{label}</span>
    </label>
  );
});
Switch.displayName = "Switch";
