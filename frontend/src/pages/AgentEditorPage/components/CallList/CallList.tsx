import type { CallSummary } from "@/shared/types/call";
import { CallListItem } from "../CallListItem/CallListItem";
import styles from "./CallList.module.scss";

export interface CallListProps {
  calls: readonly CallSummary[];
  /** The clock relative times are told against. */
  now: Date;
  onOpen: (callId: string) => void;
}

/** An agent's calls, newest first. */
export function CallList({ calls, now, onOpen }: CallListProps) {
  return (
    <ul className={styles.list} aria-label="Calls">
      {calls.map((call) => (
        <CallListItem key={call.id} call={call} now={now} onOpen={onOpen} />
      ))}
    </ul>
  );
}
