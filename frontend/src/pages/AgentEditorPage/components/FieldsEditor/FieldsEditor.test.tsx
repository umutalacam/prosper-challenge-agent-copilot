import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import type { AgentAction } from "@/shared/types/agent";
import { FieldsEditor } from "./FieldsEditor";

const baseAction: AgentAction = {
  function: "record",
  description: "",
  target: "next",
  properties: { full_name: { type: "string", description: "Name" } },
  required: ["full_name"],
};

/** Hosts FieldsEditor with real state so edits round-trip like in the app. */
function Harness({ onState }: { onState: (a: AgentAction) => void }) {
  const [action, setAction] = useState(baseAction);
  return (
    <FieldsEditor
      action={action}
      onChange={(fields) => {
        const next = { ...action, ...fields };
        setAction(next);
        onState(next);
      }}
    />
  );
}

function setup() {
  let latest = baseAction;
  const user = userEvent.setup();
  render(
    <Harness
      onState={(a) => {
        latest = a;
      }}
    />,
  );
  return { user, latest: () => latest };
}

describe("FieldsEditor", () => {
  it("renames a field on Enter and keeps it required", async () => {
    const { user, latest } = setup();
    const name = screen.getByRole("textbox", { name: "Field name" });
    await user.clear(name);
    await user.type(name, "caller_name{Enter}");

    expect(Object.keys(latest().properties)).toEqual(["caller_name"]);
    expect(latest().required).toEqual(["caller_name"]);
  });

  it("rejects an invalid name and reverts it on blur", async () => {
    const { user, latest } = setup();
    const name = screen.getByRole("textbox", { name: "Field name" });
    await user.clear(name);
    await user.type(name, "2bad");

    expect(screen.getByRole("alert").textContent).toMatch(/letters, digits/i);
    await user.tab();
    expect(Object.keys(latest().properties)).toEqual(["full_name"]);
    expect((name as HTMLInputElement).value).toBe("full_name");
  });

  it("adds, toggles required and removes fields", async () => {
    const { user, latest } = setup();
    await user.click(screen.getByRole("button", { name: "+ Add field" }));
    expect(Object.keys(latest().properties)).toEqual(["full_name", "field"]);

    const fieldGroup = screen.getByRole("group", { name: "Field field" });
    await user.click(fieldGroup.querySelector<HTMLInputElement>('input[type="checkbox"]')!);
    expect(latest().required).toEqual(["full_name"]);

    await user.click(screen.getByRole("button", { name: "Remove field full_name" }));
    expect(Object.keys(latest().properties)).toEqual(["field"]);
    expect(latest().required).toEqual([]);
  });

  it("stores allowed values as an enum", async () => {
    const { user, latest } = setup();
    await user.type(screen.getByRole("textbox", { name: "Allowed values" }), "a, b{Enter}");
    expect(latest().properties.full_name!.enum).toEqual(["a", "b"]);
  });
});
