import { useState } from "react";
import { useParams } from "react-router";
import { ApiError, errorMessage, useAgent } from "@/shared/api";
import { Button, ButtonLink, EmptyState } from "@/shared/ui";
import { AgentEditor } from "./AgentEditor";
import { createDraftAgent } from "./lib/draftAgent";

/** Route: /agents/new and /agents/:agentId. */
export function AgentEditorPage() {
  const { agentId } = useParams();
  return agentId ? <StoredAgentEditor key={agentId} agentId={agentId} /> : <NewAgentEditor />;
}

function NewAgentEditor() {
  const [draft] = useState(createDraftAgent);
  return <AgentEditor agentId={null} initialAgent={draft} />;
}

function StoredAgentEditor({ agentId }: { agentId: string }) {
  const query = useAgent(agentId);

  if (query.isPending) return <EmptyState title="Loading agent…" />;

  if (query.isError) {
    const notFound = query.error instanceof ApiError && query.error.isNotFound;
    return (
      <EmptyState
        title={notFound ? "Agent not found" : "Couldn't load this agent"}
        description={
          notFound ? `There's no agent with id “${agentId}”.` : errorMessage(query.error)
        }
        action={
          notFound ? (
            <ButtonLink to="/" variant="primary">
              Back to agents
            </ButtonLink>
          ) : (
            <Button variant="primary" onClick={() => void query.refetch()}>
              Try again
            </Button>
          )
        }
      />
    );
  }

  const { id: _id, version, updated_at: _updatedAt, ...agent } = query.data;
  return <AgentEditor agentId={agentId} initialAgent={agent} initialVersion={version} />;
}
