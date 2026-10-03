import type {
  Agent,
  AgentAction,
  AgentNode,
  AgentSummary,
  StoredAgent,
} from "@/shared/types/agent";
import { request } from "./http";

type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

/** What the API may actually return: schema.py gives these fields defaults, so JSON can omit them. */
type WireAction = Optional<AgentAction, "properties" | "required">;
type WireNode = Optional<Omit<AgentNode, "edges">, "task_messages"> & { edges?: WireAction[] };
type WireAgent = Optional<Omit<StoredAgent, "nodes">, "persona"> & { nodes: WireNode[] };

/**
 * Fill the fields schema.py treats as optional so the editor can rely on them
 * (e.g. a terminal node in hand-written JSON usually omits `edges`).
 */
export function normalizeAgent(agent: WireAgent): StoredAgent {
  return {
    ...agent,
    persona: agent.persona ?? "",
    nodes: agent.nodes.map((node) => ({
      ...node,
      task_messages: node.task_messages ?? [],
      edges: (node.edges ?? []).map((edge) => ({
        ...edge,
        properties: edge.properties ?? {},
        required: edge.required ?? [],
      })),
    })),
  };
}

/** Strip the API id: the backend derives it from the URL, not the body. */
function toBody({ id: _id, ...agent }: Agent & { id?: string }): string {
  return JSON.stringify(agent);
}

export const agentsApi = {
  list: () => request<AgentSummary[]>("/agents"),

  get: async (id: string) =>
    normalizeAgent(await request<WireAgent>(`/agents/${encodeURIComponent(id)}`)),

  create: async (agent: Agent) =>
    normalizeAgent(await request<WireAgent>("/agents", { method: "POST", body: toBody(agent) })),

  update: async (id: string, agent: Agent) =>
    normalizeAgent(
      await request<WireAgent>(`/agents/${encodeURIComponent(id)}`, {
        method: "PUT",
        body: toBody(agent),
      }),
    ),

  remove: (id: string) =>
    request<undefined>(`/agents/${encodeURIComponent(id)}`, { method: "DELETE" }),
};
