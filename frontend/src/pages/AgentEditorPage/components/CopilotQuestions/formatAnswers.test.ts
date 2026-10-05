import { describe, expect, it } from "vitest";
import { answerText, formatAnswers } from "./formatAnswers";

describe("answerText", () => {
  it("joins the picked options and the typed text", () => {
    expect(answerText({ picked: ["Booking", "Rescheduling"], text: " Billing " })).toBe(
      "Booking, Rescheduling, Billing",
    );
    expect(answerText({ picked: [], text: "  " })).toBe("");
  });
});

describe("formatAnswers", () => {
  it("pairs each question with its answer, Q: / A:, a blank line apart", () => {
    const questions = [
      { question: "Which requests?", options: ["Booking", "Rescheduling"], multiple: true },
      { question: "What tone?" },
    ];
    expect(
      formatAnswers(questions, [
        { picked: ["Booking", "Rescheduling"], text: "" },
        { picked: [], text: "  Warm but brief " },
      ]),
    ).toBe("Q: Which requests?\nA: Booking, Rescheduling\n\nQ: What tone?\nA: Warm but brief");
  });
});
