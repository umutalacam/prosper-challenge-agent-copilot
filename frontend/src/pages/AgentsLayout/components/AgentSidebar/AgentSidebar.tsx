import { clsx } from "clsx";
import { NavLink, useMatch } from "react-router";
import { errorMessage, useAgentList } from "@/shared/api";
import { BrandLogo, ButtonLink } from "@/shared/ui";
import styles from "./AgentSidebar.module.scss";

const itemClass = ({ isActive }: { isActive: boolean }) =>
  clsx(styles.item, isActive && styles.active);

export function AgentSidebar() {
  const agents = useAgentList();
  const creating = useMatch("/agents/new") !== null;

  return (
    <nav className={styles.sidebar} aria-label="Agents">
      <div className={styles.brand}>
        <BrandLogo product="Agent Composer" />
      </div>

      <div className={styles.header}>
        <h2 className={styles.heading}>Agents</h2>
        <ButtonLink to="/agents/new" variant="primary" size="sm">
          + New
        </ButtonLink>
      </div>

      <ul className={styles.list}>
        {creating && (
          <li>
            <NavLink to="/agents/new" className={itemClass}>
              <span className={styles.name}>Unsaved agent</span>
            </NavLink>
          </li>
        )}
        {agents.data?.map((agent) => (
          <li key={agent.id}>
            <NavLink to={`/agents/${agent.id}`} className={itemClass}>
              <span className={styles.name}>{agent.name}</span>
              <span className={styles.meta}>
                {agent.node_count} {agent.node_count === 1 ? "node" : "nodes"}
              </span>
            </NavLink>
          </li>
        ))}
      </ul>

      {agents.isPending && <p className={styles.status}>Loading…</p>}
      {agents.isError && (
        <p className={clsx(styles.status, styles.error)} role="alert">
          Can't reach the agent API ({errorMessage(agents.error)}). Is <code>make api</code>{" "}
          running?
        </p>
      )}
      {agents.data?.length === 0 && !creating && <p className={styles.status}>No agents yet.</p>}
    </nav>
  );
}
