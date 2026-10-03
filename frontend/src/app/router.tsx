import { createBrowserRouter } from "react-router";
import { AgentListPage } from "@/pages/AgentListPage/AgentListPage";
import { AgentsLayout } from "@/pages/AgentsLayout/AgentsLayout";
import { NotFoundPage } from "@/pages/NotFoundPage/NotFoundPage";
import { RouteErrorPage } from "@/pages/RouteErrorPage/RouteErrorPage";

// The editor pulls in React Flow + dagre, so it's split into its own chunk.
const agentEditorRoute = {
  lazy: async () => {
    const { AgentEditorPage } = await import("@/pages/AgentEditorPage/AgentEditorPage");
    return { Component: AgentEditorPage };
  },
};

export const router = createBrowserRouter([
  {
    path: "/",
    errorElement: <RouteErrorPage />,
    children: [
      { index: true, element: <AgentListPage /> },
      {
        // The editor's shell: full-viewport canvas with the hamburger menu over it.
        element: <AgentsLayout />,
        children: [
          { path: "agents/new", ...agentEditorRoute },
          { path: "agents/:agentId", ...agentEditorRoute },
        ],
      },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);
