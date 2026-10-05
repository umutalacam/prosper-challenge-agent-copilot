import type { AgentSummary } from "@/shared/types/agent";

/** The live deployment: an agent and the version callers get. */
export interface Deployed {
  agentId: string;
  version: number;
}

/**
 * An agent's deployment state: a deploy in flight, deployed at its latest save,
 * deployed at an older version (newer saves don't reach callers until a
 * redeploy), or not deployed.
 */
export type DeployState =
  | { kind: "deploying" }
  | { kind: "deployed"; version: number }
  | { kind: "outdated"; version: number }
  | { kind: "none" };

export function deployState(
  agent: AgentSummary,
  deployed: Deployed | null,
  deployingAgentId: string | null | undefined,
): DeployState {
  if (agent.id === deployingAgentId) return { kind: "deploying" };
  if (agent.id !== deployed?.agentId) return { kind: "none" };
  return deployed.version < agent.version
    ? { kind: "outdated", version: deployed.version }
    : { kind: "deployed", version: deployed.version };
}
