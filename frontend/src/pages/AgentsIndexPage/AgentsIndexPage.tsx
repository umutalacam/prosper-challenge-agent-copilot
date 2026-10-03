import { Navigate } from "react-router";
import { useAgentList } from "@/shared/api";
import { ButtonLink, EmptyState } from "@/shared/ui";

/** Route: / — opens the first agent, or invites creating one. */
export function AgentsIndexPage() {
  const agents = useAgentList();

  if (agents.isPending) return <EmptyState title="Loading agents…" />;

  const first = agents.data?.[0];
  if (first) return <Navigate to={`/agents/${first.id}`} replace />;

  return (
    <EmptyState
      title={agents.isError ? "Agent API unavailable" : "No agents yet"}
      description={
        agents.isError
          ? "Start it with `make api` (or `make dev`), then reload."
          : "An agent is a graph of conversation nodes connected by actions."
      }
      action={
        !agents.isError && (
          <ButtonLink to="/agents/new" variant="primary">
            Create your first agent
          </ButtonLink>
        )
      }
    />
  );
}
