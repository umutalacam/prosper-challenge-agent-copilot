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
 * The view that shows `target` centered in a `view`-sized canvas: keeps the
 * `current` zoom unless `target` doesn't fit (with `padding`, a fraction of the
 * view on each side), then zooms out just enough. Never zooms in.
 */
export function focusView(
  target: Box,
  view: Size,
  current: number,
  padding = 0.15,
): { x: number; y: number; zoom: number } {
  const usable = 1 - 2 * padding;
  const fit = Math.min(
    target.width > 0 ? (view.width * usable) / target.width : Infinity,
    target.height > 0 ? (view.height * usable) / target.height : Infinity,
  );
  return {
    x: target.x + target.width / 2,
    y: target.y + target.height / 2,
    zoom: Math.min(current, fit),
  };
}
