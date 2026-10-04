import { act, renderHook } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Agent } from "@/shared/types/agent";
import { EMPTY_DIFF, type AgentDiff } from "../lib/agentDiff";
import { HIGHLIGHT_MS, useEditHighlights } from "./useEditHighlights";

const agent: Agent = {
  name: "A",
  persona: "",
  initial_node: "a",
  nodes: [
    {
      name: "a",
      task_messages: [],
      edges: [{ function: "to_b", description: "", target: "b", properties: {}, required: [] }],
    },
    { name: "b", task_messages: [], edges: [] },
  ],
};

const touched = (
  nodes: [string, "added" | "changed"][],
  actions: AgentDiff["actions"] = new Map(),
) => ({
  nodes: new Map(nodes),
  actions,
});

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useEditHighlights", () => {
  it("highlights what an edit touched, then lets it go", () => {
    const { result } = renderHook(() => useEditHighlights());
    act(() => {
      result.current.show(touched([["b", "added"]]), agent);
    });
    expect(result.current.highlights.nodes.get("b")).toBe("added");
    act(() => {
      vi.advanceTimersByTime(HIGHLIGHT_MS);
    });
    expect(result.current.highlights.nodes.size).toBe(0);
  });

  it("lets go of actions too, under StrictMode (state updaters run twice)", () => {
    const { result } = renderHook(() => useEditHighlights(), { wrapper: StrictMode });
    act(() => {
      result.current.show(touched([["b", "added"]], new Map([["a/to_b", "added"]])), agent);
    });
    act(() => {
      vi.advanceTimersByTime(HIGHLIGHT_MS);
    });
    expect(result.current.highlights.nodes.size).toBe(0);
    expect(result.current.highlights.actions.size).toBe(0);
  });

  it("keeps an item highlighted for the full time after its latest edit", () => {
    const { result } = renderHook(() => useEditHighlights());
    act(() => {
      result.current.show(touched([["b", "added"]]), agent);
    });
    act(() => {
      vi.advanceTimersByTime(HIGHLIGHT_MS - 100);
      result.current.show(touched([["b", "changed"]]), agent);
    });
    act(() => {
      vi.advanceTimersByTime(200); // the first edit's timer fires
    });
    expect(result.current.highlights.nodes.get("b")).toBe("changed");
    act(() => {
      vi.advanceTimersByTime(HIGHLIGHT_MS);
    });
    expect(result.current.highlights.nodes.size).toBe(0);
  });

  it("asks to bring both ends of a touched action into view", () => {
    const { result } = renderHook(() => useEditHighlights());
    act(() => {
      result.current.show(touched([], new Map([["a/to_b", "added"]])), agent);
    });
    expect(result.current.highlights.actions.get("a/to_b")).toBe("added");
    expect(result.current.focusRequest).toEqual({ nodes: ["a", "b"], seq: 1 });
  });

  it("ignores an edit that touched nothing", () => {
    const { result } = renderHook(() => useEditHighlights());
    act(() => {
      result.current.show(EMPTY_DIFF, agent);
    });
    expect(result.current.focusRequest).toBeNull();
  });
});
