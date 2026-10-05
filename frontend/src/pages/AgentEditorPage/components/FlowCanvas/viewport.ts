// Viewport math for bringing nodes into view. Pure, so it's unit-testable apart
// from React Flow.

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

/** The smallest box containing every box in `boxes`, or null if there are none. */
export function unionBox(boxes: readonly Box[]): Box | null {
  const [first, ...rest] = boxes;
  if (!first) return null;
  let left = first.x;
  let top = first.y;
  let right = first.x + first.width;
  let bottom = first.y + first.height;
  for (const box of rest) {
    left = Math.min(left, box.x);
    top = Math.min(top, box.y);
    right = Math.max(right, box.x + box.width);
    bottom = Math.max(bottom, box.y + box.height);
  }
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/**
 * The `setCenter` arguments that show `target` centered in the visible part of a
 * `view`-sized canvas, whose left `coveredLeft` px are under a panel: keeps the
 * `current` zoom unless `target` doesn't fit there (with `padding`, a fraction
 * of the visible area on each side), then zooms out just enough. Never zooms in.
 */
export function focusView(
  target: Box,
  view: Size,
  current: number,
  coveredLeft = 0,
  padding = 0.15,
): { x: number; y: number; zoom: number } {
  const usable = 1 - 2 * padding;
  const visibleWidth = Math.max(view.width - coveredLeft, 1);
  const fit = Math.min(
    target.width > 0 ? (visibleWidth * usable) / target.width : Infinity,
    target.height > 0 ? (view.height * usable) / target.height : Infinity,
  );
  const zoom = Math.min(current, fit);
  // setCenter centers on the whole canvas; the visible part's center is
  // coveredLeft / 2 px to the right of it, so aim that far (in flow units) left.
  return {
    x: target.x + target.width / 2 - coveredLeft / 2 / zoom,
    y: target.y + target.height / 2,
    zoom,
  };
}
