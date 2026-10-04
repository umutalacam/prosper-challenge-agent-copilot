import { useLayoutEffect, useRef, useState, type RefObject } from "react";

/**
 * An explicit pixel height for a card that follows its content, so CSS can
 * transition it as the content grows or shrinks (a transition never fires while
 * the height is `auto`). Attach `container` to the card and `content` to a wrapper
 * around everything inside `scroller`, the card's scrolling part (passed in, as
 * it usually has a ref of its own). The height is the
 * card's own chrome (header, borders) + the scroller's padding + the content;
 * the card's `max-height` still caps it, past which the scroller scrolls.
 *
 * `height` is undefined until the first measurement, so the card's CSS decides
 * where the transition starts from. Pass `active` = whether the card is rendered,
 * so measuring starts once its elements exist.
 */
export function useContentHeight<C extends HTMLElement, I extends HTMLElement>(
  active: boolean,
  scroller: RefObject<HTMLElement | null>,
) {
  const container = useRef<C>(null);
  const content = useRef<I>(null);
  const [height, setHeight] = useState<number>();

  useLayoutEffect(() => {
    const card = container.current;
    const scroll = scroller.current;
    const inner = content.current;
    if (!card || !scroll || !inner || typeof ResizeObserver === "undefined") return;

    const measure = () => {
      const style = getComputedStyle(scroll);
      const padding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
      const chrome = card.offsetHeight - scroll.offsetHeight;
      setHeight(Math.ceil(chrome + padding + inner.offsetHeight));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(inner);
    return () => {
      observer.disconnect();
    };
  }, [active, scroller]);

  return { container, content, height };
}
