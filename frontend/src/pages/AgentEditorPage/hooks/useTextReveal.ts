import { useCallback, useState } from "react";

const MAX_STAGGER_MS = 8;
const MAX_TOTAL_STAGGER_MS = 500;

/** The delay between one character starting to fade in and the next: fast, capped for long texts. */
export function revealStagger(length: number): number {
  return length > 0 ? Math.min(MAX_STAGGER_MS, MAX_TOTAL_STAGGER_MS / length) : 0;
}

const prefersReducedMotion = () =>
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Whether `text` should play its fade-in: yes when it changes while mounted,
 * until the animation reports it's finished. Text that's there at mount shows at
 * once (nothing replays), and so does everything under reduced motion.
 */
export function useTextReveal(text: string): { revealing: boolean; finish: () => void } {
  const [state, setState] = useState({ text, revealing: false });

  // A new text: reveal it (adjusted while rendering, not in an effect).
  if (text !== state.text) {
    setState({ text, revealing: text.length > 0 && !prefersReducedMotion() });
  }

  const finish = useCallback(() => {
    setState((current) => ({ ...current, revealing: false }));
  }, []);

  return { revealing: state.revealing, finish };
}
