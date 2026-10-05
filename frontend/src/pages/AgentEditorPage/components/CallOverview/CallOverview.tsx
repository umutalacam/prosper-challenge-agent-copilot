import { useId } from "react";
import type { CallDetail } from "@/shared/types/call";
import { Badge, ClockIcon } from "@/shared/ui";
import { callerName } from "../../lib/callerName";
import { OUTCOMES } from "../../lib/callOutcomes";
import { formatDuration, formatRelative } from "../../lib/time";
import { CallAvatar } from "../CallAvatar/CallAvatar";
import { CallPath } from "../CallPath/CallPath";
import styles from "./CallOverview.module.scss";

export interface CallOverviewProps {
  call: CallDetail;
  /** The clock relative times are told against. */
  now: Date;
}

/**
 * How a call went at a glance: who, outcome, length, the path through the agent,
 * and anything worth a look. (CallDetail puts the transcript button under it.)
 */
export function CallOverview({ call, now }: CallOverviewProps) {
  const outcome = OUTCOMES[call.outcome];
  const stuck = call.issues.find((issue) => issue.kind === "stuck")?.node ?? null;
  const failure = call.issues.find((issue) => issue.kind === "error");
  // Long stays show on the path itself; these are the things that went wrong.
  const hasNotes = failure !== undefined || stuck !== null;
  const id = useId();

  return (
    <div className={styles.overview}>
      <header className={styles.header}>
        <CallAvatar seed={call.id} size={40} />
        <div className={styles.summary}>
          <span className={styles.titleLine}>
            <h3 className={styles.caller}>{callerName(call.id)}</h3>
            <Badge tone={outcome.tone}>{outcome.label}</Badge>
          </span>
          <span className={styles.meta}>
            <ClockIcon width={12} height={12} />
            {formatDuration(call.duration_ms)}
            <span aria-hidden="true">·</span>
            <time dateTime={call.started_at}>{formatRelative(new Date(call.started_at), now)}</time>
            <span aria-hidden="true">·</span>v{call.agent_version}
          </span>
        </div>
      </header>

      <section className={styles.section} aria-labelledby={`${id}-path`}>
        <h3 id={`${id}-path`} className={styles.heading}>
          Path
        </h3>
        <CallPath call={call} />
      </section>

      {hasNotes && (
        <section className={styles.section} aria-labelledby={`${id}-notes`}>
          <h3 id={`${id}-notes`} className={styles.heading}>
            Worth a look
          </h3>
          <ul className={styles.notes}>
            {failure && <li className={styles.error}>{failure.message}</li>}
            {stuck && (
              <li className={styles.warning}>
                Stuck in {stuck}: the agent kept replying without moving on, and the call ended
                there.
              </li>
            )}
          </ul>
        </section>
      )}
    </div>
  );
}
