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
/** An agent document as JSON may hold it: schema.py's optional fields may be missing. */
export type WireAgentDocument = Optional<Omit<Agent, "nodes">, "persona"> & { nodes: WireNode[] };
type WireAgent = WireAgentDocument & Pick<StoredAgent, "id" | "version" | "updated_at">;

/**
 * Fill the fields schema.py treats as optional so the editor can rely on them
 * (e.g. a terminal node in hand-written JSON usually omits `edges`). Keeps any
 * other fields, such as a stored agent's id and version.
 */
export function normalizeAgent<T extends WireAgentDocument>(
  agent: T,
): Omit<T, "persona" | "nodes"> & Pick<Agent, "persona" | "nodes"> {
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

/** Send only the agent document; id/version/updated_at are the server's metadata. */
function toBody({
  id: _id,
  version: _version,
  updated_at: _updatedAt,
  ...agent
}: Agent & Partial<Pick<StoredAgent, "id" | "version" | "updated_at">>): string {
  return JSON.stringify(agent);
}

export const agentsApi = {
  list: () => request<AgentSummary[]>("/agents"),

  get: async (id: string) =>
    normalizeAgent(await request<WireAgent>(`/agents/${encodeURIComponent(id)}`)),

  create: async (agent: Agent) =>
    normalizeAgent(await request<WireAgent>("/agents", { method: "POST", body: toBody(agent) })),

  /** Save over `version`; the server answers 409 if it has moved on since. */
  update: async (id: string, agent: Agent, version: number) =>
    normalizeAgent(
      await request<WireAgent>(`/agents/${encodeURIComponent(id)}`, {
        method: "PUT",
        headers: { "If-Match": `"${version}"` },
        body: toBody(agent),
      }),
    ),

  remove: (id: string) =>
    request<undefined>(`/agents/${encodeURIComponent(id)}`, { method: "DELETE" }),
};
