import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useStickToBottom } from "./useStickToBottom";

function Feed({ content, turn }: { content: string; turn: number }) {
  const { ref, onScroll } = useStickToBottom<HTMLDivElement>(content, turn);
  return (
    <div data-testid="feed" ref={ref} onScroll={onScroll}>
      {content}
    </div>
  );
}

/** jsdom has no layout: give the element a fixed viewport and a growing content height. */
function withLayout(el: HTMLElement, sizes: { scrollHeight: number; clientHeight: number }) {
  Object.defineProperty(el, "clientHeight", { configurable: true, get: () => sizes.clientHeight });
  Object.defineProperty(el, "scrollHeight", { configurable: true, get: () => sizes.scrollHeight });
  return sizes;
}

function setup() {
  const view = render(<Feed content="a" turn={1} />);
  const feed = screen.getByTestId("feed");
  const sizes = withLayout(feed, { scrollHeight: 300, clientHeight: 100 });
  return { ...view, feed, sizes };
}

describe("useStickToBottom", () => {
  it("follows new content to the bottom", () => {
    const { rerender, feed, sizes } = setup();
    sizes.scrollHeight = 500;
    rerender(<Feed content="ab" turn={1} />);
    expect(feed.scrollTop).toBe(500);
  });

  it("stops following once the reader scrolls up, and resumes at the bottom", () => {
    const { rerender, feed, sizes } = setup();
    feed.scrollTop = 50; // well above the bottom (300 - 100 = 200)
    fireEvent.scroll(feed);
    sizes.scrollHeight = 500;
    rerender(<Feed content="ab" turn={1} />);
    expect(feed.scrollTop).toBe(50);

    feed.scrollTop = 400; // back at the bottom (500 - 100)
    fireEvent.scroll(feed);
    sizes.scrollHeight = 700;
    rerender(<Feed content="abc" turn={1} />);
    expect(feed.scrollTop).toBe(700);
  });

  it("follows again when a new turn starts", () => {
    const { rerender, feed, sizes } = setup();
    feed.scrollTop = 0;
    fireEvent.scroll(feed);
    sizes.scrollHeight = 500;
    rerender(<Feed content="next" turn={2} />);
    expect(feed.scrollTop).toBe(500);
  });
});
