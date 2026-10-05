import { clsx } from "clsx";
import { Link } from "react-router";
import type { AgentSummary } from "@/shared/types/agent";
import { Badge, Button, ButtonLink } from "@/shared/ui";
import { deployState, type Deployed } from "./deployState";
import styles from "./AgentTable.module.scss";

export interface AgentTableProps {
  agents: AgentSummary[];
  /** What the voice bot answers calls with; null when nothing is deployed. */
  deployed: Deployed | null;
  clientUrl: string | undefined;
  /** The agent a deploy is in flight for. */
  deployingAgentId: string | null | undefined;
  onDeploy: (agentId: string) => void;
}

const savedAt = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

export function AgentTable({
  agents,
  deployed,
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
            const state = deployState(agent, deployed, deployingAgentId);
            const live = state.kind === "deployed" || state.kind === "outdated";
            return (
              <tr key={agent.id} className={live ? styles.deployed : undefined}>
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
                  {state.kind === "deploying" ? (
                    <Badge tone="neutral">Deploying…</Badge>
                  ) : state.kind === "deployed" ? (
                    <Badge tone="success">● Deployed v{state.version}</Badge>
                  ) : state.kind === "outdated" ? (
                    <span className={styles.status}>
                      <Badge tone="success">● Deployed v{state.version}</Badge>
                      <span className={styles.muted}>v{agent.version} saved</span>
                    </span>
                  ) : (
                    <span className={styles.muted}>Not deployed</span>
                  )}
                </td>
                <td>
                  <div className={styles.actions}>
                    {live && clientUrl && (
                      <a className={styles.talk} href={clientUrl} target="_blank" rel="noreferrer">
                        Talk to it ↗
                      </a>
                    )}
                    {state.kind !== "deployed" && (
                      <Button
                        size="sm"
                        variant="primary"
                        disabled={deployingAgentId != null}
                        aria-label={`${state.kind === "outdated" ? "Redeploy" : "Deploy"} ${agent.name}`}
                        onClick={() => {
                          onDeploy(agent.id);
                        }}
                      >
                        {state.kind === "deploying"
                          ? "Deploying…"
                          : state.kind === "outdated"
                            ? `Redeploy v${agent.version}`
                            : "Deploy"}
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
