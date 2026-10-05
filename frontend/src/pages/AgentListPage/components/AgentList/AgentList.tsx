import { clsx } from "clsx";
import { Link } from "react-router";
import { formatRelative } from "@/shared/lib/time";
import type { AgentSummary } from "@/shared/types/agent";
import { ArrowRightIcon, Badge, Button, RobotIcon } from "@/shared/ui";
import { deployState, type DeployState, type Deployed } from "./deployState";
import { orderAgents } from "./orderAgents";
import styles from "./AgentList.module.scss";

export interface AgentListProps {
  agents: AgentSummary[];
  /** What the voice bot answers calls with; null when nothing is deployed. */
  deployed: Deployed | null;
  /** The agent a deploy is in flight for. */
  deployingAgentId: string | null | undefined;
  onDeploy: (agentId: string) => void;
  /** The clock relative times are told against. */
  now: Date;
}

const count = new Intl.NumberFormat();

/**
 * Every agent as a row — the deployed one first, then by last save — to open it in
 * the editor, see whether it's live and how much it's used, and deploy it.
 */
export function AgentList({ agents, deployed, deployingAgentId, onDeploy, now }: AgentListProps) {
  return (
    <ul className={styles.list} aria-label="Agents">
      {orderAgents(agents, deployed?.agentId).map((agent) => (
        <AgentRow
          key={agent.id}
          agent={agent}
          state={deployState(agent, deployed, deployingAgentId)}
          deployDisabled={deployingAgentId != null}
          onDeploy={onDeploy}
          now={now}
        />
      ))}
    </ul>
  );
}

function AgentRow({
  agent,
  state,
  deployDisabled,
  onDeploy,
  now,
}: {
  agent: AgentSummary;
  state: DeployState;
  deployDisabled: boolean;
  onDeploy: (agentId: string) => void;
  now: Date;
}) {
  const live = state.kind === "deployed" || state.kind === "outdated";
  return (
    <li className={clsx(styles.row, live && styles.live)}>
      <span className={styles.mark} aria-hidden="true">
        <RobotIcon width={18} height={18} />
      </span>

      <div className={styles.main}>
        <div className={styles.titleLine}>
          {/* The whole row opens the agent: this link's ::after covers it. */}
          <Link to={`/agents/${agent.id}`} className={styles.name}>
            {agent.name}
          </Link>
          <Status state={state} saved={agent.version} />
        </div>
        <div className={styles.meta}>
          {agent.node_count} {agent.node_count === 1 ? "node" : "nodes"} · v{agent.version} · saved{" "}
          {formatRelative(new Date(agent.updated_at), now)}
        </div>
      </div>

      <div className={styles.usage}>
        {agent.call_count > 0 ? (
          <>
            <span className={styles.calls}>
              <strong>{count.format(agent.call_count)}</strong>{" "}
              {agent.call_count === 1 ? "call" : "calls"}
            </span>
            {agent.last_call_at && (
              <span className={styles.lastCall}>
                last {formatRelative(new Date(agent.last_call_at), now)}
              </span>
            )}
          </>
        ) : (
          <span className={styles.lastCall}>no calls yet</span>
        )}
      </div>

      {state.kind !== "deployed" && (
        <Button
          size="sm"
          variant={state.kind === "outdated" ? "primary" : "secondary"}
          className={styles.deploy}
          disabled={deployDisabled}
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

      <ArrowRightIcon className={styles.arrow} width={16} height={16} />
    </li>
  );
}

/** The deployment badge: live (and at which version), a deploy in flight, or not deployed. */
function Status({ state, saved }: { state: DeployState; saved: number }) {
  switch (state.kind) {
    case "deploying":
      return <Badge>Deploying…</Badge>;
    case "deployed":
      return <Badge tone="success">● Deployed v{state.version}</Badge>;
    case "outdated":
      return (
        <span className={styles.status}>
          <Badge tone="success">● Deployed v{state.version}</Badge>
          <span className={styles.saved}>v{saved} saved</span>
        </span>
      );
    case "none":
      return <Badge>Not deployed</Badge>;
  }
}
