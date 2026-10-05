import { clsx } from "clsx";
import { useEffect, useId, useRef, useState } from "react";
import { Button, Input } from "@/shared/ui";
import type { CopilotQuestion } from "@/shared/types/copilot";
import { answerText, formatAnswers, type Answer } from "./formatAnswers";
import styles from "./CopilotQuestions.module.scss";

export interface CopilotQuestionsProps {
  questions: readonly CopilotQuestion[];
  /** Every question is answered: the answers as one `Q: … / A: …` message for the copilot. */
  onSubmit: (message: string) => void;
}

/**
 * The copilot's clarifying questions, one at a time. A single-choice question
 * answers on a click; a multiple-choice one (`multiple`) toggles its options and
 * confirms with Next. Either way a typed answer is always possible (added to the
 * picks on a multiple-choice question). Back restores the previous answer to
 * edit. Mount with a `key` per turn so a new set of questions starts fresh.
 */
export function CopilotQuestions({ questions, onSubmit }: CopilotQuestionsProps) {
  const [answers, setAnswers] = useState<readonly Answer[]>([]);
  const [picked, setPicked] = useState<readonly string[]>([]);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const questionId = useId();
  const index = answers.length;
  const current = questions[index];

  // After an answer, keep the keyboard in the flow: focus moves to the next question.
  const answeredOnce = useRef(false);
  useEffect(() => {
    if (answeredOnce.current) inputRef.current?.focus();
  }, [index]);

  if (!current) {
    return <p className={styles.sent}>Answers sent.</p>;
  }

  const options = current.options ?? [];
  const multiple = Boolean(current.multiple) && options.length > 0;
  const pending: Answer = { picked: multiple ? picked : [], text: draft };
  const isLast = index === questions.length - 1;

  const commit = (answer: Answer) => {
    if (!answerText(answer)) return;
    const next = [...answers, answer];
    answeredOnce.current = true;
    setAnswers(next);
    setPicked([]);
    setDraft("");
    if (next.length === questions.length) onSubmit(formatAnswers(questions, next));
  };

  const toggle = (option: string) => {
    setPicked(picked.includes(option) ? picked.filter((o) => o !== option) : [...picked, option]);
  };

  const back = () => {
    const previous = answers.at(-1);
    const previousQuestion = questions[index - 1];
    if (!previous || !previousQuestion) return;
    // A multiple-choice answer comes back as toggles + text; a single choice as text to edit.
    if (previousQuestion.multiple) {
      setPicked(previous.picked);
      setDraft(previous.text);
    } else {
      setPicked([]);
      setDraft(answerText(previous));
    }
    setAnswers(answers.slice(0, -1));
  };

  return (
    <section className={styles.questions} aria-label="The copilot's questions">
      <p className={styles.progress}>
        Question {index + 1} of {questions.length}
      </p>

      <p id={questionId} className={styles.question} aria-live="polite">
        {current.question}
      </p>
      {multiple && <p className={styles.hint}>Pick all that apply</p>}

      {/* Multiple choice: pills you select (any number), confirmed with Next. */}
      {multiple && (
        <div className={styles.pills} role="group" aria-labelledby={questionId}>
          {options.map((option) => {
            const selected = picked.includes(option);
            return (
              <button
                key={option}
                type="button"
                role="checkbox"
                aria-checked={selected}
                className={clsx(styles.pill, selected && styles.selected)}
                onClick={() => {
                  toggle(option);
                }}
              >
                {option}
              </button>
            );
          })}
        </div>
      )}

      {/* Single choice: buttons; a click answers and moves on. */}
      {!multiple && options.length > 0 && (
        <div className={styles.choices} role="group" aria-labelledby={questionId}>
          {options.map((option) => (
            <button
              key={option}
              type="button"
              className={styles.choice}
              onClick={() => {
                commit({ picked: [option], text: "" });
              }}
            >
              <span>{option}</span>
              <span className={styles.choiceArrow} aria-hidden="true">
                →
              </span>
            </button>
          ))}
        </div>
      )}

      <form
        className={styles.answer}
        onSubmit={(e) => {
          e.preventDefault();
          commit(pending);
        }}
      >
        <Input
          ref={inputRef}
          className={styles.input}
          value={draft}
          aria-labelledby={questionId}
          placeholder={
            multiple
              ? "Add something else…"
              : options.length > 0
                ? "Or type your own answer…"
                : "Type your answer…"
          }
          onChange={(e) => {
            setDraft(e.target.value);
          }}
        />
        {/* Footer: Back on the left (from the second question), Next / Send on the right. */}
        <div className={styles.actions}>
          {index > 0 && (
            <Button variant="ghost" size="sm" onClick={back}>
              Back
            </Button>
          )}
          <Button
            type="submit"
            variant="primary"
            size="sm"
            className={styles.submit}
            disabled={!answerText(pending)}
          >
            {isLast ? "Send" : "Next"}
          </Button>
        </div>
      </form>
    </section>
  );
}
