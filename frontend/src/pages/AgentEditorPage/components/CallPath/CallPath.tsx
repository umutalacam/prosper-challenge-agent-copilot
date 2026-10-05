import { clsx } from "clsx";
import type { CallDetail, CallIssue, CallOutcome, PathStep } from "@/shared/types/call";
import { ActionIcon, Badge, CheckIcon, CloseIcon } from "@/shared/ui";
import { formatDuration } from "../../lib/time";
import styles from "./CallPath.module.scss";

/** How the last step reads, by how the call ended there. */
const ENDINGS: Record<CallOutcome, string> = {
  completed: "Call completed",
  abandoned: "Caller left here",
  not_started: "The flow never started",
  error: "Call failed here",
};

/** A value an action collected, as text. */
function shown(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

export interface CallPathProps {
  call: CallDetail;
}

/**
 * The call's walk through the agent as a vertical timeline: each node with when
 * it was reached and how long the call stayed, what was collected there and the
 * action that moved it on, and how it ended. Steps and their issues come from
 * the backend; this only lays them out.
 */
export function CallPath({ call }: CallPathProps) {
  if (call.steps.length === 0) return <p className={styles.muted}>The flow never started.</p>;
  return (
    <ol className={styles.timeline} aria-label="Path through the agent">
      {call.steps.map((step, i) => (
        <Step
          key={`${step.node}-${String(i)}`}
          step={step}
          issues={call.issues.filter((issue) => issue.step === i)}
        />
      ))}
    </ol>
  );
}

function Step({ step, issues }: { step: PathStep; issues: CallIssue[] }) {
  const args = step.exit ? Object.entries(step.exit.args) : [];
  const stuck = issues.some((issue) => issue.kind === "stuck");
  const longStay = issues.some((issue) => issue.kind === "long_stay");
  return (
    <li className={clsx(styles.step, step.ending && styles[step.ending], stuck && styles.stuck)}>
      <span className={styles.marker} aria-hidden="true">
        {step.ending === "completed" && <CheckIcon width={10} height={10} />}
        {step.ending === "error" && <CloseIcon width={9} height={9} />}
      </span>
      <div className={styles.body}>
        <div className={styles.title}>
          <span className={styles.node}>{step.node}</span>
          {stuck && <Badge tone="brand">Stuck here</Badge>}
          {longStay && (
            <span title={`The agent replied ${String(step.replies)} times here before moving on`}>
              <Badge>Long stay</Badge>
            </span>
          )}
        </div>
        <div className={styles.meta}>
          at {formatDuration(step.entered_ms)} · {formatDuration(step.stay_ms)} here
        </div>
        {step.exit && (
          // What was collected (if anything), then the action on its own line.
          <div className={styles.exit}>
            {args.length > 0 && (
              <div className={styles.args}>
                {args.map(([key, value]) => (
                  <span key={key} className={styles.arg}>
                    {key}: {shown(value)}
                  </span>
                ))}
              </div>
            )}
            <span className={styles.function} title="The action that moved the call on">
              <ActionIcon width={11} height={11} />
              {step.exit.function}
            </span>
          </div>
        )}
        {step.ending && <div className={styles.ending}>{ENDINGS[step.ending]}</div>}
      </div>
    </li>
  );
}
