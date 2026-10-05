import { render, screen } from "@testing-library/react";
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
});
