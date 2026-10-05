import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import { ApiError, errorMessage, useAgent } from "@/shared/api";
import type { NewAgentState } from "@/shared/types/agent";
import { Button, ButtonLink, EmptyState } from "@/shared/ui";
import { AgentEditor } from "./AgentEditor";
import { createDraftAgent } from "./lib/draftAgent";

/** Route: /agents/new and /agents/:agentId. */
export function AgentEditorPage() {
  const { agentId } = useParams();
  return agentId ? <StoredAgentEditor key={agentId} agentId={agentId} /> : <NewAgentEditor />;
}

function promptOf(state: unknown): string | undefined {
  const prompt = (state as Partial<NewAgentState> | null)?.prompt;
  return typeof prompt === "string" && prompt.trim() ? prompt : undefined;
}

function NewAgentEditor() {
  const [draft] = useState(createDraftAgent);
  const location = useLocation();
  const navigate = useNavigate();
  const [prompt] = useState(() => promptOf(location.state));
  // Taken once: drop it from history so a reload doesn't send it again.
  useEffect(() => {
    if (prompt) void navigate(".", { replace: true, state: null });
  }, [prompt, navigate]);
  return <AgentEditor agentId={null} initialAgent={draft} initialPrompt={prompt} />;
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
