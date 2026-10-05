import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EditorToolbar, type EditorToolbarProps } from "./EditorToolbar";

function renderToolbar(props: Partial<EditorToolbarProps>) {
  render(
    <EditorToolbar
      title="Desk"
      dirty={false}
      saving={false}
      persisted
      settingsOpen={false}
      locked={false}
      callsOpen={false}
      callsDisabled={false}
      onToggleCalls={vi.fn()}
      issuesOpen={false}
      newIssues={0}
      onToggleIssues={vi.fn()}
      onToggleSettings={vi.fn()}
      onShowJson={vi.fn()}
      onAddNode={vi.fn()}
      onAutoLayout={vi.fn()}
      onDelete={vi.fn()}
      onSave={vi.fn()}
      {...props}
    />,
  );
}

describe("EditorToolbar", () => {
  it("badges the Issues toggle with new issues", () => {
    renderToolbar({ newIssues: 3 });
    const issues = screen.getByRole("button", { name: "Issues, 3 new" });
    expect(issues.textContent).toBe("Issues3");
  });

  it("shows no badge when nothing is new", () => {
    renderToolbar({ newIssues: 0 });
    expect(screen.getByRole("button", { name: "Issues" }).textContent).toBe("Issues");
  });

  it("caps a big count", () => {
    renderToolbar({ newIssues: 140 });
    expect(screen.getByRole("button", { name: "Issues, 140 new" }).textContent).toBe("Issues99+");
  });

  it("disables Issues until the agent is saved, like Calls", () => {
    renderToolbar({ callsDisabled: true });
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Issues" }).disabled).toBe(true);
  });
});
