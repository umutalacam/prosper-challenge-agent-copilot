import { Outlet } from "react-router";
import { AgentSidebar } from "./components/AgentSidebar/AgentSidebar";
import styles from "./AgentsLayout.module.scss";

/** App shell: the agent list on the left, the routed page on the right. */
export function AgentsLayout() {
  return (
    <div className={styles.layout}>
      <AgentSidebar />
      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}
