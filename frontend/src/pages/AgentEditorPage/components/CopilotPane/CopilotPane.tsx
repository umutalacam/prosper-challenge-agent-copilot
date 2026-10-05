import { clsx } from "clsx";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { CopilotFix, CopilotGroupFix } from "@/shared/types/copilot";
import { CloseIcon, FixIcon, IconButton, IssuesIcon, SparklesIcon } from "@/shared/ui";
import type { CopilotTurn } from "../../hooks/useCopilot";
import { callerName } from "../../lib/callerName";
import { groupLabel } from "../../lib/issueGroups";
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
 * button: the whole conversation in one scroll, with the prompt box at the
 * bottom. Like a chat: each turn's message stays pinned at the top while its
 * output scrolls under it, and hands over to the previous message when you scroll
 * past the start of its turn.
 */
export function CopilotPane({ turns, onAnswer, onClose, footer }: CopilotPaneProps) {
  const latest = turns.at(-1);
  // Follow the copilot's output as it streams in; each new prompt starts following again.
  const { ref: bodyRef, onScroll: onBodyScroll } = useStickToBottom<HTMLDivElement>(
    latest,
    latest?.id,
  );

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
            {turns.map((turn) => (
              <Turn key={turn.id} turn={turn} latest={turn === latest} onAnswer={onAnswer} />
            ))}
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

function Turn({
  turn,
  latest,
  onAnswer,
}: {
  turn: CopilotTurn;
  /** Only the latest turn's questions can still be answered. */
  latest: boolean;
  onAnswer: (message: string) => void;
}) {
  return (
    <article className={styles.turn}>
      {/* Pinned to the top of the scroll while this turn's output scrolls under it. */}
      <div className={styles.ask}>
        {turn.fix ? (
          <FixCard fix={turn.fix} />
        ) : turn.group_fix ? (
          <GroupFixCard group={turn.group_fix} />
        ) : (
          <Prompt text={turn.prompt} />
        )}
      </div>

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

        {turn.questions &&
          turn.questions.length > 0 &&
          (latest ? (
            <CopilotQuestions key={turn.id} questions={turn.questions} onSubmit={onAnswer} />
          ) : (
            <ul className={styles.askedBefore}>
              {turn.questions.map((q) => (
                <li key={q.question}>{q.question}</li>
              ))}
            </ul>
          ))}

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

/** A group fix turn's "prompt": the issue across calls (the copilot also gets their causes). */
function GroupFixCard({ group }: { group: CopilotGroupFix }) {
  return (
    <div className={styles.fixCard}>
      <p className={styles.fixHeader}>
        <IssuesIcon width={12} height={12} />
        Fix across calls
        <span className={styles.fixSource}>
          {group.call_count} {group.call_count === 1 ? "call" : "calls"} · v{group.version}
        </span>
      </p>
      <p>{groupLabel(group)}</p>
    </div>
  );
}

/**
 * The user's message. Clamped to a few lines, so a pinned message never takes
 * over the pane; "Show more" opens a long one.
 */
function Prompt({ text }: { text: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [clamped, setClamped] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && !expanded) setClamped(el.scrollHeight > el.clientHeight + 1);
  }, [text, expanded]);

  return (
    <div className={styles.prompt}>
      <p ref={ref} className={clsx(styles.promptText, !expanded && styles.clamped)}>
        {text}
      </p>
      {(clamped || expanded) && (
        <button
          type="button"
          className={styles.more}
          aria-expanded={expanded}
          onClick={() => {
            setExpanded(!expanded);
          }}
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}
