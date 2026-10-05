import { clsx } from "clsx";
import { useState, type ReactNode } from "react";
import type { CopilotFix } from "@/shared/types/copilot";
import { CloseIcon, FixIcon, IconButton, SparklesIcon } from "@/shared/ui";
import type { CopilotTurn } from "../../hooks/useCopilot";
import { callerName } from "../../lib/callerName";
import { useStickToBottom } from "../../hooks/useStickToBottom";
import { CopilotQuestions } from "../CopilotQuestions/CopilotQuestions";
import { TypedText } from "../TypedText/TypedText";
import styles from "./CopilotPane.module.scss";

export interface CopilotPaneProps {
  turns: CopilotTurn[];
  /** The copilot's questions are all answered: the `Q: … / A: …` message to send it. */
  onAnswer: (message: string) => void;
  onClose: () => void;
  /** Docked at the bottom of the pane: the prompt box. */
  footer: ReactNode;
}

/**
 * The copilot's pane, docked on the left for the full height below the menu
 * button: the conversation (latest prompt, what the copilot is doing and has
 * done, its reply and any questions; earlier turns fold away), with the prompt
 * box at the bottom.
 */
export function CopilotPane({ turns, onAnswer, onClose, footer }: CopilotPaneProps) {
  const [showEarlier, setShowEarlier] = useState(false);
  const latest = turns.at(-1);
  // Follow the copilot's output as it streams in; each new prompt starts following again.
  const { ref: bodyRef, onScroll: onBodyScroll } = useStickToBottom<HTMLDivElement>(
    latest,
    latest?.id,
  );
  const earlier = turns.slice(0, -1);

  return (
    <section className={styles.pane} aria-label="Copilot">
      <header className={styles.header}>
        <SparklesIcon className={styles.mark} width={16} height={16} />
        <h2 className={styles.title}>Copilot</h2>
        <IconButton label="Hide the copilot" onClick={onClose}>
          <CloseIcon width={16} height={16} />
        </IconButton>
      </header>

      <div className={styles.body} ref={bodyRef} onScroll={onBodyScroll}>
        {latest ? (
          <div className={styles.content}>
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
                        <p className={styles.earlierPrompt}>
                          {turn.fix ? `Fix: ${turn.fix.node ?? "the call"}` : turn.prompt}
                        </p>
                        {(turn.reply ?? turn.error) && (
                          <p className={styles.earlierReply}>{turn.reply ?? turn.error}</p>
                        )}
                      </li>
                    ))}
                  </ol>
                )}
              </>
            )}

            <Turn turn={latest} onAnswer={onAnswer} />
          </div>
        ) : (
          <div className={styles.intro}>
            <SparklesIcon className={styles.introMark} width={24} height={24} />
            <p className={styles.introTitle}>Build with the copilot</p>
            <p className={styles.introText}>
              Describe the agent you want, or ask for a change to this one. Edits appear live on the
              canvas.
            </p>
          </div>
        )}
      </div>

      <div className={styles.footer}>{footer}</div>
    </section>
  );
}

function Turn({ turn, onAnswer }: { turn: CopilotTurn; onAnswer: (message: string) => void }) {
  return (
    <article className={styles.turn}>
      {turn.fix ? <FixCard fix={turn.fix} /> : <p className={styles.prompt}>{turn.prompt}</p>}

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

        {/* Always mounted, so a reply arriving types itself out (an existing one on
            reopening the pane shows at once). */}
        <TypedText text={turn.reply ?? ""} className={styles.reply} />

        {turn.questions && turn.questions.length > 0 && (
          <CopilotQuestions key={turn.id} questions={turn.questions} onSubmit={onAnswer} />
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

/** A fix turn's "prompt": where the finding is from and the suggested fix (the copilot also gets the cause). */
function FixCard({ fix }: { fix: CopilotFix }) {
  return (
    <div className={styles.fixCard}>
      <p className={styles.fixHeader}>
        <FixIcon width={12} height={12} />
        Fix from a call
        <span className={styles.fixSource}>
          {callerName(fix.call_id)}
          {fix.node && (
            <>
              {" · "}
              <span className={styles.fixNode}>{fix.node}</span>
            </>
          )}
        </span>
      </p>
      <p>{fix.suggestion || fix.cause}</p>
    </div>
  );
}
