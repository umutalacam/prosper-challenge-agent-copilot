import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CopilotTurn } from "../../hooks/useCopilot";
import { callerName } from "../../lib/callerName";
import { CopilotPane } from "./CopilotPane";

const fix = {
  call_id: "c1",
  node: "greeting",
  step: 0,
  cause: "No action for insurance questions.",
  suggestion: "Add an action for them.",
};

function renderTurns(turns: CopilotTurn[]) {
  render(<CopilotPane turns={turns} onAnswer={vi.fn()} onClose={vi.fn()} footer={null} />);
}

describe("CopilotPane", () => {
  it("shows a fix turn as the finding's card, not the prompt", () => {
    renderTurns([
      {
        id: 1,
        prompt: "Fix the problem a call ran into…",
        fix,
        status: "running",
        activity: "Planning…",
        steps: [],
      },
    ]);
    expect(screen.getByText("Fix from a call")).toBeTruthy();
    expect(screen.getByText(callerName("c1"), { exact: false })).toBeTruthy();
    expect(screen.getByText("greeting")).toBeTruthy();
    expect(screen.getByText("Add an action for them.")).toBeTruthy();
    expect(screen.queryByText("No action for insurance questions.")).toBeNull(); // only the suggestion
    expect(screen.queryByText("Fix the problem a call ran into…")).toBeNull();
    expect(screen.getByText("Planning…")).toBeTruthy();
  });

  it("shows a typed prompt as before", () => {
    renderTurns([{ id: 1, prompt: "Add a goodbye", status: "done", activity: null, steps: [] }]);
    expect(screen.getByText("Add a goodbye")).toBeTruthy();
    expect(screen.queryByText("Fix from a call")).toBeNull();
  });

  it("shows a group fix turn as the issue across calls", () => {
    renderTurns([
      {
        id: 1,
        prompt: 'Fix "Stuck in greeting" across 3 calls (v4).',
        group_fix: { kind: "stuck", node: "greeting", version: 4, call_count: 3, causes: ["x"] },
        status: "done",
        activity: null,
        steps: [],
      },
    ]);
    expect(screen.getByText("Fix across calls")).toBeTruthy();
    expect(screen.getByText("3 calls · v4")).toBeTruthy();
    expect(screen.getByText("Stuck in greeting")).toBeTruthy();
  });

  it("keeps the whole conversation in one scroll, each message in its turn's pinned header", () => {
    renderTurns([
      {
        id: 1,
        prompt: "Build a dental desk",
        status: "done",
        activity: null,
        steps: [],
        reply: "Built it.",
        questions: [{ question: "Who calls?" }],
      },
      { id: 2, prompt: "Make it friendlier", status: "running", activity: "Planning…", steps: [] },
    ]);
    const turns = screen.getAllByRole("article");
    expect(turns).toHaveLength(2);
    expect(within(turns[0]!).getByText("Build a dental desk")).toBeTruthy();
    expect(within(turns[0]!).getByText("Who calls?")).toBeTruthy(); // answered since: just the text
    expect(within(turns[0]!).queryByRole("button")).toBeNull();
    expect(within(turns[1]!).getByText("Make it friendlier")).toBeTruthy();
    expect(within(turns[1]!).getByText("Planning…")).toBeTruthy();
  });
});
