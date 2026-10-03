import dagre from "@dagrejs/dagre";
import type { AgentNode, Position } from "@/shared/types/agent";

/** Must match the NodeCard's rendered size closely enough for dagre to avoid overlaps. */
export const NODE_SIZE = { width: 240, height: 110 } as const;

/** dagre writes the computed center into x/y. */
interface LayoutNode {
  width: number;
  height: number;
  x?: number;
  y?: number;
}

/** Top-to-bottom layered layout. Returns node name -> top-left position. */
export function autoLayout(nodes: readonly AgentNode[]): Record<string, Position> {
  const graph = new dagre.graphlib.Graph<object, LayoutNode>();
  graph.setGraph({ rankdir: "TB", nodesep: 60, ranksep: 80 });
  graph.setDefaultEdgeLabel(() => ({}));

  for (const node of nodes) graph.setNode(node.name, { ...NODE_SIZE });
  for (const node of nodes) {
    for (const action of node.edges) {
      if (action.target !== node.name) graph.setEdge(node.name, action.target);
    }
  }
  dagre.layout(graph);

  return Object.fromEntries(
    nodes.map((node) => {
      const { x = 0, y = 0 } = graph.node(node.name);
      return [node.name, { x: x - NODE_SIZE.width / 2, y: y - NODE_SIZE.height / 2 }];
    }),
  );
}

/** Where to drop a newly added node: below the lowest existing one. */
export function nextNodePosition(nodes: readonly AgentNode[]): Position {
  const lowest = Math.max(0, ...nodes.map((n) => n.position?.y ?? 0));
  const left = Math.min(0, ...nodes.map((n) => n.position?.x ?? 0));
  return { x: left, y: lowest + NODE_SIZE.height + 60 };
}

const BELOW_GAP = { x: 40, y: 80 };

/**
 * Where the canvas "+" puts a node added under `source`: straight below it,
 * stepped right past any node already in the way (e.g. an earlier sibling).
 */
export function positionBelow(nodes: readonly AgentNode[], source: string): Position {
  const origin = nodes.find((n) => n.name === source)?.position ?? { x: 0, y: 0 };
  const position = { x: origin.x, y: origin.y + NODE_SIZE.height + BELOW_GAP.y };
  const taken = (p: Position) =>
    nodes.some(
      (n) =>
        n.position &&
        Math.abs(n.position.x - p.x) < NODE_SIZE.width + BELOW_GAP.x &&
        Math.abs(n.position.y - p.y) < NODE_SIZE.height,
    );
  while (taken(position)) position.x += NODE_SIZE.width + BELOW_GAP.x;
  return position;
}

/** Give every node a position, laying out the ones saved without one. */
export function withPositions<T extends { nodes: AgentNode[] }>(agent: T): T {
  if (agent.nodes.every((n) => n.position)) return agent;
  const positions = autoLayout(agent.nodes);
  return {
    ...agent,
    nodes: agent.nodes.map((n) => ({ ...n, position: n.position ?? positions[n.name] })),
  };
}
