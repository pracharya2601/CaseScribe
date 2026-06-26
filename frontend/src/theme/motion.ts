import type { Transition, Variants } from "framer-motion";

/** True when the OS requests reduced motion. Guarded for SSR/build. */
export const prefersReducedMotion = (): boolean =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---- Spring + ease presets (snappy: 200–450ms) ---- */
export const springSoft: Transition = {
  type: "spring",
  stiffness: 320,
  damping: 30,
  mass: 0.8,
};

export const springPop: Transition = {
  type: "spring",
  stiffness: 520,
  damping: 22,
  mass: 0.7,
};

export const easeOut: Transition = {
  duration: 0.28,
  ease: [0.16, 1, 0.3, 1],
};

/* ---- Reveal variants ---- */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: easeOut },
};

/** Parent that staggers its children's reveal — the progressive Trinity drop. */
export const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09, delayChildren: 0.05 } },
};

/** The checkmark pop when a sub-agent completes. */
export const checkPop: Variants = {
  hidden: { scale: 0, opacity: 0 },
  show: { scale: 1, opacity: 1, transition: springPop },
};

/** Card spring-in used by ArtifactCard when status flips to done. */
export const cardReveal: Variants = {
  hidden: { opacity: 0, y: 10, scale: 0.985 },
  show: { opacity: 1, y: 0, scale: 1, transition: springSoft },
};

/** Easing + duration for animated counters (CountUp). */
export const countUp = {
  duration: 1.1,
  ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
};
