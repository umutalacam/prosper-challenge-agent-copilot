// The layout values the canvas math needs, mirrored from shared/styles/_tokens.scss
// (SCSS variables don't reach TypeScript). Keep the two in step.

const FLOAT_GAP = 16; // $float-gap
const COPILOT_PANE_WIDTH = 360; // $copilot-pane-width
const BREAKPOINT_SM = 640; // $breakpoint-sm

/** How much of the canvas's left edge the open copilot pane covers, in px. */
export const COPILOT_PANE_INSET = FLOAT_GAP + COPILOT_PANE_WIDTH;

/**
 * The canvas width covered on the left right now: the pane's inset while it's
 * open on a wide screen. On phones the pane covers the whole canvas (it's closed
 * to see the graph), so nothing is left out there.
 */
export function coveredLeft(paneOpen: boolean): number {
  if (!paneOpen) return 0;
  return window.matchMedia(`(width >= ${BREAKPOINT_SM}px)`).matches ? COPILOT_PANE_INSET : 0;
}
