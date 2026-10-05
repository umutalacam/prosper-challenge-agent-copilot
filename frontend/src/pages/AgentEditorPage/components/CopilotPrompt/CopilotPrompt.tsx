import type { KeyboardEvent, Ref } from "react";
import { clsx } from "clsx";
import { SendIcon, SparklesIcon, StopIcon } from "@/shared/ui";
import styles from "./CopilotPrompt.module.scss";

export interface CopilotPromptProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  running: boolean;
  /** The copilot asked something (answered in its card): the box offers a new request instead. */
  awaitingAnswer: boolean;
  ref?: Ref<HTMLTextAreaElement>;
}

const MAX_ROWS = 6;

/** The prompt bar at the bottom of the canvas. Enter sends, Shift+Enter breaks the line. */
export function CopilotPrompt({
  value,
  onChange,
  onSend,
  onStop,
  running,
  awaitingAnswer,
  ref,
}: CopilotPromptProps) {
  const rows = Math.min(MAX_ROWS, Math.max(1, value.split("\n").length));
  const canSend = !running && value.trim().length > 0;

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (canSend) onSend();
    }
  };

  return (
    <form
      className={clsx(styles.bar, running && styles.working)}
      onSubmit={(e) => {
        e.preventDefault();
        if (canSend) onSend();
      }}
    >
      <SparklesIcon className={styles.icon} />
      <textarea
        ref={ref}
        className={styles.input}
        rows={rows}
        value={value}
        aria-label="Message the copilot"
        placeholder={
          awaitingAnswer
            ? "Answer in the card, or ask for something else…"
            : "Ask the copilot to build or change this agent…"
        }
        onChange={(e) => {
          onChange(e.target.value);
        }}
        onKeyDown={onKeyDown}
      />
      {running ? (
        <button
          type="button"
          className={styles.action}
          aria-label="Stop the copilot"
          title="Stop"
          onClick={onStop}
        >
          <StopIcon width={16} height={16} />
        </button>
      ) : (
        <button
          type="submit"
          className={styles.action}
          aria-label="Send to the copilot"
          title="Send (Enter)"
          disabled={!canSend}
        >
          <SendIcon width={16} height={16} />
        </button>
      )}
    </form>
  );
}
