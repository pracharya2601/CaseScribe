import { useEffect, useRef, useState } from "react";
import { animate } from "framer-motion";
import { cn } from "./cn";
import { countUp, prefersReducedMotion } from "../theme/motion";

export interface CountUpProps {
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  duration?: number;
  className?: string;
}

/** Animated, tabular-num counter — the timer, cost meter, reimbursement. */
export function CountUp({
  value,
  decimals = 0,
  prefix = "",
  suffix = "",
  duration = countUp.duration,
  className,
}: CountUpProps) {
  const [display, setDisplay] = useState(value);
  const from = useRef(value);

  useEffect(() => {
    if (prefersReducedMotion()) {
      setDisplay(value);
      from.current = value;
      return;
    }
    const controls = animate(from.current, value, {
      duration,
      ease: countUp.ease,
      onUpdate: (v) => setDisplay(v),
    });
    from.current = value;
    return () => controls.stop();
  }, [value, duration]);

  const formatted = display.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  return (
    <span className={cn("tnum", className)}>
      {prefix}
      {formatted}
      {suffix}
    </span>
  );
}
