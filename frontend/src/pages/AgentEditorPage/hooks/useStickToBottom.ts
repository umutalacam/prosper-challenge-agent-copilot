import { useCallback, useLayoutEffect, useRef } from "react";

/** How close to the bottom (px) still counts as "at the bottom". */
const STICK_THRESHOLD = 24;

/**
 * Keeps a scroll container pinned to its bottom while `content` grows, like a
 * chat. Scrolling up to read stops the following; scrolling back down, or a new
 * `resetKey` (e.g. a new turn), resumes it. Attach `ref` and `onScroll` to the
 * scrolling element.
 */
export function useStickToBottom<T extends HTMLElement>(content: unknown, resetKey: unknown) {
  const ref = useRef<T>(null);
  const stick = useRef(true);

  const onScroll = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight <= STICK_THRESHOLD;
  }, []);

  // Declared before the scroll effect so a new turn sticks in the same commit.
  useLayoutEffect(() => {
    stick.current = true;
  }, [resetKey]);

  // Layout effect: scroll before paint, so new content never flashes below the fold.
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [content]);

  return { ref, onScroll };
}
