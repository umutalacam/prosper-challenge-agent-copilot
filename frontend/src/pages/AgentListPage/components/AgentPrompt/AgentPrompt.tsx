import { useRef, useState, type KeyboardEvent } from "react";
import { useNavigate } from "react-router";
import type { NewAgentState } from "@/shared/types/agent";
import { Button, SparklesIcon } from "@/shared/ui";
import styles from "./AgentPrompt.module.scss";

/** Starting points for the prompt box: a short label; a click fills in the prompt, ready to edit or send. */
const SUGGESTIONS = [
  {
    label: "Dental clinic receptionist",
    prompt: "A receptionist for a dental clinic that books, reschedules and cancels cleanings",
  },
  {
    label: "New patient intake",
    prompt: "A scheduler that books new patients and collects their insurance details",
  },
  {
    label: "After-hours answering line",
    prompt: "An after-hours line that takes messages and flags urgent calls",
  },
  {
    label: "Appointment confirmations",
    prompt: "A clinic line that confirms tomorrow's appointments and handles cancellations",
  },
] as const;

/**
 * The home page's prompt box: describe an agent and the copilot builds it. Sending
 * opens a new agent in the editor with the text as the copilot's first request.
 * Enter sends, Shift+Enter breaks the line.
 */
export function AgentPrompt() {
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const navigate = useNavigate();
  const canSend = text.trim().length > 0;

  const build = () => {
    if (!canSend) return;
    const state: NewAgentState = { prompt: text.trim() };
    void navigate("/agents/new", { state });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      build();
    }
  };

  return (
    <div className={styles.prompt}>
      <form
        className={styles.box}
        onSubmit={(e) => {
          e.preventDefault();
          build();
        }}
      >
        <textarea
          ref={inputRef}
          className={styles.input}
          rows={3}
          value={text}
          aria-label="Describe your voice agent"
          placeholder="Describe your voice agent… e.g. “A receptionist for a physiotherapy clinic that books first visits and follow-ups”"
          onChange={(e) => {
            setText(e.target.value);
          }}
          onKeyDown={onKeyDown}
        />
        <div className={styles.footer}>
          <span className={styles.hint}>Enter to build · Shift+Enter for a new line</span>
          <Button type="submit" variant="primary" disabled={!canSend}>
            <SparklesIcon width={14} height={14} />
            Build agent
          </Button>
        </div>
      </form>

      <ul className={styles.suggestions} aria-label="Suggestions">
        {SUGGESTIONS.map(({ label, prompt }) => (
          <li key={label}>
            <button
              type="button"
              className={styles.suggestion}
              title={prompt}
              onClick={() => {
                setText(prompt);
                inputRef.current?.focus();
              }}
            >
              {label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
