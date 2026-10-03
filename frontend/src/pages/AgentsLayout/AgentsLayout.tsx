import { Outlet } from "react-router";
import { useStoredState } from "@/shared/lib/useStoredState";
import { AgentSidebar } from "./components/AgentSidebar/AgentSidebar";
import type { AgentsLayoutContext } from "./layoutContext";
import styles from "./AgentsLayout.module.scss";

/**
 * App shell: the routed page fills the viewport (the editor's canvas runs edge to
 * edge) and the agent list floats over it, collapsible to just its header.
 */
export function AgentsLayout() {
  const [sidebarOpen, setSidebarOpen] = useStoredState("composer.sidebarOpen", true);
  const context: AgentsLayoutContext = { sidebarOpen };

  return (
    <div className={styles.layout}>
      <AgentSidebar
        open={sidebarOpen}
        onToggle={() => {
          setSidebarOpen(!sidebarOpen);
        }}
      />
      <main className={styles.main}>
        <Outlet context={context} />
      </main>
    </div>
  );
}
