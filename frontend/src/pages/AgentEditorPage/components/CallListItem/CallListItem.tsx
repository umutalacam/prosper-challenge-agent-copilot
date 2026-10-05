import type { CallSummary } from "@/shared/types/call";
import { Badge, ClockIcon } from "@/shared/ui";
import { callerName } from "../../lib/callerName";
import { OUTCOMES } from "../../lib/callOutcomes";
import { formatDuration, formatRelative } from "@/shared/lib/time";
import { CallAvatar } from "../CallAvatar/CallAvatar";
import styles from "./CallListItem.module.scss";

const exactTime = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

export interface CallListItemProps {
  call: CallSummary;
  /** The clock relative times are told against. */
  now: Date;
  onOpen: (callId: string) => void;
}

/** One call in the log: who (a face and a made-up name), how it ended, how long, how long ago. */
export function CallListItem({ call, now, onOpen }: CallListItemProps) {
  const outcome = OUTCOMES[call.outcome];
  const startedAt = new Date(call.started_at);
  // Only a real failure is flagged here; long stays in calls that moved on show in the overview.
  const stuck = call.issues.find((issue) => issue.kind === "stuck")?.node;
  return (
    <li>
      <button
        type="button"
        className={styles.item}
        onClick={() => {
          onOpen(call.id);
        }}
      >
        <CallAvatar seed={call.id} />
        <span className={styles.body}>
          <span className={styles.line}>
            <span className={styles.name}>{callerName(call.id)}</span>
            <Badge tone={outcome.tone}>{outcome.label}</Badge>
            {stuck && <Badge tone="brand">Stuck in {stuck}</Badge>}
          </span>
          <span className={styles.meta}>
            <span className={styles.duration}>
              <ClockIcon width={12} height={12} />
              {formatDuration(call.duration_ms)}
            </span>
            <span aria-hidden="true">·</span>
            <time dateTime={call.started_at} title={exactTime.format(startedAt)}>
              {formatRelative(startedAt, now)}
            </time>
            <span aria-hidden="true">·</span>
            <span>v{call.agent_version}</span>
          </span>
        </span>
      </button>
    </li>
  );
}
