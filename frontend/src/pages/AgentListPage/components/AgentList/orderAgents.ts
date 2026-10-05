import type { AgentSummary } from "@/shared/types/agent";

/**
 * The home page's order: the deployed agent first, then the rest by when they
 * were last saved, newest first. Returns a new array.
 */
export function orderAgents(
  agents: readonly AgentSummary[],
  deployedAgentId: string | null | undefined,
): AgentSummary[] {
  return [...agents].sort((a, b) => {
    const live = Number(b.id === deployedAgentId) - Number(a.id === deployedAgentId);
    return live || Date.parse(b.updated_at) - Date.parse(a.updated_at);
  });
}
