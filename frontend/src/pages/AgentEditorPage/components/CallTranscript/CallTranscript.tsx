import { clsx } from "clsx";
import type { TranscriptTurn } from "@/shared/types/call";
import styles from "./CallTranscript.module.scss";

export interface CallTranscriptProps {
  turns: readonly TranscriptTurn[];
}

/** What was said, as chat bubbles (agent left, caller right); a label marks each move to another node. */
export function CallTranscript({ turns }: CallTranscriptProps) {
  if (turns.length === 0) {
    return <p className={styles.muted}>Nothing was said on this call.</p>;
  }
  return (
    <ol className={styles.transcript} aria-label="Transcript">
      {turns.map((turn, i) => {
        const newNode = turn.node !== null && turn.node !== turns[i - 1]?.node;
        return (
          <li key={`${String(turn.at_ms)}-${String(i)}`} className={styles.turnRow}>
            {newNode && <span className={styles.node}>{turn.node}</span>}
            <p className={clsx(styles.bubble, styles[turn.speaker])}>
              <span className={styles.visuallyHidden}>
                {turn.speaker === "caller" ? "Caller" : "Agent"}:{" "}
              </span>
              {turn.text}
              {turn.interrupted && <span className={styles.interrupted}> — interrupted</span>}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
