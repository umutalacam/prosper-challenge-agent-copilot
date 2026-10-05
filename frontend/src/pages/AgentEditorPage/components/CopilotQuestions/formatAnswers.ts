import type { CopilotQuestion } from "@/shared/types/copilot";

/** One answer: the options picked (one, or any number for a multiple-choice question) and/or typed text. */
export interface Answer {
  readonly picked: readonly string[];
  readonly text: string;
}

/** The answer as one line: picked options first, then the typed text, comma-separated. */
export function answerText({ picked, text }: Answer): string {
  return [...picked, text.trim()].filter(Boolean).join(", ");
}

/**
 * The copilot's questions with the user's answers, as the message sent back to it:
 *
 *   Q: Which requests should it handle?
 *   A: Booking, Rescheduling
 *
 *   Q: What tone should it use?
 *   A: Warm but brief
 */
export function formatAnswers(
  questions: readonly CopilotQuestion[],
  answers: readonly Answer[],
): string {
  return questions
    .map((q, i) => {
      const answer = answers[i];
      return `Q: ${q.question}\nA: ${answer ? answerText(answer) : ""}`;
    })
    .join("\n\n");
}
