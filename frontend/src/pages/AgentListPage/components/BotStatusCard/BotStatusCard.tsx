import type { AgentSummary } from "@/shared/types/agent";
import type { BotStatus } from "@/shared/types/bot";
import { Badge } from "@/shared/ui";
import styles from "./BotStatusCard.module.scss";

export interface BotStatusCardProps {
  status: BotStatus | undefined;
  error: string | null;
  /** To show the deployed agent by name. */
  agents: AgentSummary[] | undefined;
}

/** Which agent version the voice bot answers with right now, and where to talk to it. */
export function BotStatusCard({ status, error, agents }: BotStatusCardProps) {
  const deployed = status?.agent_id
    ? (agents?.find((agent) => agent.id === status.agent_id)?.name ?? status.agent_id)
    : null;
  const calls = status?.active_calls ?? 0;

  return (
    <section className={styles.card} aria-label="Voice bot">
      <div className={styles.summary}>
        <span className={styles.label}>Voice bot</span>
        {error ? (
          <span className={styles.error}>Unavailable: {error}</span>
        ) : !status ? (
          <span className={styles.muted}>Checking…</span>
        ) : (
          <span className={styles.value}>
            {deployed ? (
              <span>
                Answering with <strong>{deployed}</strong> v{status.version}
              </span>
            ) : (
              <span className={styles.muted}>No agent deployed — deploy one to take calls</span>
            )}
            <Badge tone={calls > 0 ? "brand" : "neutral"}>
              {calls} {calls === 1 ? "call" : "calls"} live
            </Badge>
          </span>
        )}
      </div>
      {status && (
        <a className={styles.link} href={status.client_url} target="_blank" rel="noreferrer">
          Open voice client ↗
        </a>
      )}
    </section>
  );
}
