import type { Agent } from "@/shared/types/agent";

export const DEFAULT_START_NODE = "greeting";

/** The starting point for a brand-new agent: one start node, ready to edit. */
export function createDraftAgent(): Agent {
  return {
    name: "New agent",
    persona: "",
    initial_node: DEFAULT_START_NODE,
    nodes: [
      {
        name: DEFAULT_START_NODE,
        task_messages: [{ role: "developer", content: "" }],
        edges: [],
        position: { x: 0, y: 0 },
      },
    ],
  };
}
