import { useOutletContext } from "react-router";

/** What the layout shares with routed pages, so floating chrome can avoid the sidebar. */
export interface AgentsLayoutContext {
  sidebarOpen: boolean;
}

export function useAgentsLayout(): AgentsLayoutContext {
  return useOutletContext<AgentsLayoutContext>();
}
