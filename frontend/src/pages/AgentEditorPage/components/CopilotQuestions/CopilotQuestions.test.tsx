import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CopilotQuestions } from "./CopilotQuestions";

const questions = [
  { question: "Who calls this agent?", options: ["Patients", "Staff"] },
  { question: "What tone should it use?" },
];

function setup() {
  const onSubmit = vi.fn<(message: string) => void>();
  render(<CopilotQuestions questions={questions} onSubmit={onSubmit} />);
  return { onSubmit, user: userEvent.setup() };
}

describe("CopilotQuestions", () => {
  it("asks one question at a time, with its options as buttons", () => {
    setup();
    screen.getByText("Question 1 of 2"); // throws if missing
    screen.getByText("Who calls this agent?"); // throws if missing
    expect(screen.queryByText("What tone should it use?")).toBeNull();
    screen.getByRole("button", { name: "Patients" }); // throws if missing
    screen.getByRole("textbox", { name: "Who calls this agent?" }); // throws if missing
  });

  it("sends every answer as Q: / A: once the last one is in", async () => {
    const { onSubmit, user } = setup();
    await user.click(screen.getByRole("button", { name: "Patients" }));
    screen.getByText("Question 2 of 2"); // throws if missing
    expect(onSubmit).not.toHaveBeenCalled();

    const box = screen.getByRole("textbox", { name: "What tone should it use?" });
    expect(document.activeElement).toBe(box); // the flow keeps the keyboard
    await user.type(box, "Warm but brief{Enter}");
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith(
      "Q: Who calls this agent?\nA: Patients\n\nQ: What tone should it use?\nA: Warm but brief",
    );
    screen.getByText("Answers sent."); // throws if missing
  });

  it("takes a typed answer even when there are options", async () => {
    const { onSubmit, user } = setup();
    await user.type(screen.getByRole("textbox"), "Both, mostly patients{Enter}");
    await user.type(screen.getByRole("textbox"), "Friendly{Enter}");
    expect(onSubmit.mock.calls[0]![0]).toContain("A: Both, mostly patients");
  });

  it("lets a multiple-choice question take several options plus typed text", async () => {
    const onSubmit = vi.fn<(message: string) => void>();
    render(
      <CopilotQuestions
        questions={[
          {
            question: "What should the agent do?",
            options: [
              "Collect contact information",
              "Ask for vehicle details",
              "Confirm the appointment",
            ],
            multiple: true,
          },
        ]}
        onSubmit={onSubmit}
      />,
    );
    const user = userEvent.setup();
    screen.getByText("Pick all that apply"); // throws if missing
    const contact = screen.getByRole("checkbox", { name: "Collect contact information" });
    await user.click(contact);
    await user.click(screen.getByRole("checkbox", { name: "Confirm the appointment" }));
    expect(contact.getAttribute("aria-checked")).toBe("true");
    expect(onSubmit).not.toHaveBeenCalled(); // picking doesn't answer yet

    await user.type(screen.getByRole("textbox"), "Payments{Enter}");
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith(
      "Q: What should the agent do?\nA: Collect contact information, Confirm the appointment, Payments",
    );
  });

  it("restores toggles and text when going back to a multiple-choice question", async () => {
    render(
      <CopilotQuestions
        questions={[
          { question: "Which requests?", options: ["Booking", "Rescheduling"], multiple: true },
          { question: "What tone?" },
        ]}
        onSubmit={vi.fn()}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("checkbox", { name: "Rescheduling" }));
    await user.type(screen.getByRole("textbox"), "Billing{Enter}");
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(
      screen.getByRole("checkbox", { name: "Rescheduling" }).getAttribute("aria-checked"),
    ).toBe("true");
    expect(screen.getByRole("checkbox", { name: "Booking" }).getAttribute("aria-checked")).toBe(
      "false",
    );
    expect(screen.getByRole<HTMLInputElement>("textbox").value).toBe("Billing");
  });

  it("goes back to the previous question with its answer to edit", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: "Staff" }));
    await user.click(screen.getByRole("button", { name: "Back" }));
    screen.getByText("Question 1 of 2"); // throws if missing
    expect(screen.getByRole<HTMLInputElement>("textbox").value).toBe("Staff");
  });

  it("doesn't take an empty answer", async () => {
    const { user } = setup();
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Next" }).disabled).toBe(true);
    await user.type(screen.getByRole("textbox"), "   {Enter}");
    screen.getByText("Question 1 of 2"); // throws if missing
  });
});
