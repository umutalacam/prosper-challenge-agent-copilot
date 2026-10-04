import type { Agent, AgentNode } from "@/shared/types/agent";

/** How a node was touched by an edit; the canvas highlights it for a moment. */
export type NodeHighlight = "added" | "changed";

/** A node's content, ignoring its canvas position. */
const content = ({ position: _position, ...node }: AgentNode) => JSON.stringify(node);

/** Which nodes `next` added or changed relative to `prev` (by name; a rename counts as added). */
export function diffNodes(prev: Agent, next: Agent): Map<string, NodeHighlight> {
  const before = new Map(prev.nodes.map((node) => [node.name, content(node)]));
  const result = new Map<string, NodeHighlight>();
  for (const node of next.nodes) {
    const old = before.get(node.name);
    if (old === undefined) result.set(node.name, "added");
    else if (old !== content(node)) result.set(node.name, "changed");
  }
  return result;
}
