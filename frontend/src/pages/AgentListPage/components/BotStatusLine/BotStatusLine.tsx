import type { AgentSummary } from "@/shared/types/agent";
import type { BotStatus } from "@/shared/types/bot";
import styles from "./BotStatusLine.module.scss";

export interface BotStatusLineProps {
  status: BotStatus | undefined;
  error: string | null;
  /** To name the deployed agent. */
  agents: AgentSummary[] | undefined;
}

/** One line over the agent list: which agent answers calls now, live calls, and the voice client. */
export function BotStatusLine({ status, error, agents }: BotStatusLineProps) {
  if (error) return <p className={styles.line}>Voice bot unavailable: {error}</p>;
  if (!status) return <p className={styles.line}>Checking the voice bot…</p>;

  const deployed = status.agent_id
    ? (agents?.find((agent) => agent.id === status.agent_id)?.name ?? status.agent_id)
    : null;
  const calls = status.active_calls;
  return (
    <p className={styles.line}>
      <span className={deployed ? styles.dotLive : styles.dot} aria-hidden="true" />
      {deployed ? (
        <span>
          Answering calls with <strong>{deployed}</strong> v{status.version}
          {" · "}
          {calls} {calls === 1 ? "call" : "calls"} live
        </span>
      ) : (
        <span>No agent deployed — deploy one to take calls</span>
      )}
      <a className={styles.link} href={status.client_url} target="_blank" rel="noreferrer">
        Open voice client ↗
      </a>
    </p>
  );
}
