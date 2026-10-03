import { clsx } from "clsx";
import { Link } from "react-router";
import type { AgentSummary } from "@/shared/types/agent";
import { Badge, Button, ButtonLink } from "@/shared/ui";
import styles from "./AgentTable.module.scss";

export interface AgentTableProps {
  agents: AgentSummary[];
  /** The agent the voice bot answers new calls with. */
  runningAgentId: string | null;
  clientUrl: string | undefined;
  /** The agent a deploy is in flight for. */
  deployingAgentId: string | null | undefined;
  onDeploy: (agentId: string) => void;
}

const savedAt = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

export function AgentTable({
  agents,
  runningAgentId,
  clientUrl,
  deployingAgentId,
  onDeploy,
}: AgentTableProps) {
  return (
    <div className={styles.scroller}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">Agent</th>
            <th scope="col" className={styles.secondary}>
              Nodes
            </th>
            <th scope="col" className={styles.secondary}>
              Last saved
            </th>
            <th scope="col">Status</th>
            <th scope="col">
              <span className={styles.visuallyHidden}>Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {agents.map((agent) => {
            const running = agent.id === runningAgentId;
            const deploying = agent.id === deployingAgentId;
            return (
              <tr key={agent.id} className={running ? styles.running : undefined}>
                <th scope="row">
                  <Link to={`/agents/${agent.id}`} className={styles.name}>
                    {agent.name}
                  </Link>
                  <span className={styles.id}>{agent.id}</span>
                </th>
                <td className={styles.secondary}>{agent.node_count}</td>
                <td className={clsx(styles.secondary, styles.muted)}>
                  <time dateTime={agent.updated_at}>
                    {savedAt.format(new Date(agent.updated_at))}
                  </time>{" "}
                  · v{agent.version}
                </td>
                <td>
                  {running ? (
                    <Badge tone="success">● Running</Badge>
                  ) : (
                    <span className={styles.muted}>Not deployed</span>
                  )}
                </td>
                <td>
                  <div className={styles.actions}>
                    {running ? (
                      clientUrl && (
                        <a
                          className={styles.talk}
                          href={clientUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Talk to it ↗
                        </a>
                      )
                    ) : (
                      <Button
                        size="sm"
                        variant="primary"
                        disabled={deployingAgentId != null}
                        aria-label={`Deploy ${agent.name}`}
                        onClick={() => {
                          onDeploy(agent.id);
                        }}
                      >
                        {deploying ? "Deploying…" : "Deploy"}
                      </Button>
                    )}
                    <ButtonLink to={`/agents/${agent.id}`} size="sm" variant="secondary">
                      Edit
                    </ButtonLink>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
