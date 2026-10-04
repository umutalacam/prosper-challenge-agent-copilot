import { clsx } from "clsx";
import { useState } from "react";
import { CloseIcon, IconButton, SparklesIcon } from "@/shared/ui";
import type { CopilotTurn } from "../../hooks/useCopilot";
import styles from "./CopilotCard.module.scss";

export interface CopilotCardProps {
  turns: CopilotTurn[];
  /** A suggested answer was picked: it goes into the prompt box. */
  onPickAnswer: (answer: string) => void;
  onClose: () => void;
}

/**
 * The copilot conversation, top-left: the latest prompt, what the copilot is doing
 * and has done, its reply and any questions. Earlier turns fold away.
 */
export function CopilotCard({ turns, onPickAnswer, onClose }: CopilotCardProps) {
  const [showEarlier, setShowEarlier] = useState(false);
  const latest = turns.at(-1);
  if (!latest) return null;
  const earlier = turns.slice(0, -1);

  return (
    <section className={styles.card} aria-label="Copilot">
      <header className={styles.header}>
        <SparklesIcon className={styles.mark} width={16} height={16} />
        <h2 className={styles.title}>Copilot</h2>
        <IconButton label="Hide the copilot" onClick={onClose}>
          <CloseIcon width={16} height={16} />
        </IconButton>
      </header>

      <div className={styles.body}>
        {earlier.length > 0 && (
          <>
            <button
              type="button"
              className={styles.earlierToggle}
              aria-expanded={showEarlier}
              onClick={() => {
                setShowEarlier(!showEarlier);
              }}
            >
              {showEarlier ? "Hide" : "Show"} earlier ({earlier.length})
            </button>
            {showEarlier && (
              <ol className={styles.earlier}>
                {earlier.map((turn) => (
                  <li key={turn.id}>
                    <p className={styles.earlierPrompt}>{turn.prompt}</p>
                    {(turn.reply ?? turn.error) && (
                      <p className={styles.earlierReply}>{turn.reply ?? turn.error}</p>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </>
        )}

        <Turn turn={latest} onPickAnswer={onPickAnswer} />
      </div>
    </section>
  );
}

function Turn({
  turn,
  onPickAnswer,
}: {
  turn: CopilotTurn;
  onPickAnswer: (answer: string) => void;
}) {
  return (
    <article className={styles.turn}>
      <p className={styles.prompt}>{turn.prompt}</p>

      {/* Announced as it changes: what the copilot is doing, then what it did. */}
      <div aria-live="polite">
        {turn.steps.length > 0 && (
          <ul className={styles.steps}>
            {turn.steps.map((step, i) =>
              step.kind === "note" ? (
                <li key={i} className={styles.note}>
                  {step.text}
                </li>
              ) : (
                <li key={i} className={clsx(styles.step, !step.ok && styles.refused)}>
                  <span className={styles.stepMark} aria-hidden="true">
                    {step.ok ? "✓" : "✕"}
                  </span>
                  <span>
                    {step.text}
                    {!step.ok && <span className={styles.visuallyHidden}> (refused)</span>}
                  </span>
                </li>
              ),
            )}
          </ul>
        )}

        {turn.status === "running" && (
          <p className={styles.activity}>
            <span className={styles.spinner} aria-hidden="true" />
            {turn.activity ?? "Working…"}
          </p>
        )}

        {turn.reply && <p className={styles.reply}>{turn.reply}</p>}

        {turn.questions && turn.questions.length > 0 && (
          <ol className={styles.questions}>
            {turn.questions.map((q, i) => (
              <li key={i}>
                <p className={styles.question}>{q.question}</p>
                {q.options && q.options.length > 0 && (
                  <div className={styles.options}>
                    {q.options.map((option) => (
                      <button
                        key={option}
                        type="button"
                        className={styles.option}
                        onClick={() => {
                          onPickAnswer(option);
                        }}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ol>
        )}

        {turn.status === "stopped" && (
          <p className={styles.muted}>Stopped. Edits made so far are kept.</p>
        )}
        {turn.error && (
          <p className={styles.error} role="alert">
            {turn.error}
          </p>
        )}
      </div>
    </article>
  );
}
