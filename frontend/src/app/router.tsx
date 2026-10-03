import { createBrowserRouter } from "react-router";
import { AgentsIndexPage } from "@/pages/AgentsIndexPage/AgentsIndexPage";
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
    element: <AgentsLayout />,
    errorElement: <RouteErrorPage />,
    children: [
      { index: true, element: <AgentsIndexPage /> },
      { path: "agents/new", ...agentEditorRoute },
      { path: "agents/:agentId", ...agentEditorRoute },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);
