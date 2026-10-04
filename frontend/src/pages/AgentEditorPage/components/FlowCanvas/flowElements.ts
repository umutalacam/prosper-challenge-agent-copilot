// Pure mapping from the agent model to React Flow elements. Kept separate from the
// component so the derivation is unit-testable and the canvas stays declarative.

import { MarkerType, type Edge } from "@xyflow/react";
import type { Agent } from "@/shared/types/agent";
import { actionKey, EMPTY_DIFF, type ActionKey, type Highlight } from "../../lib/agentDiff";
import type { NodeCardNode } from "../NodeCard/NodeCard";
import type { Selection } from "../../state/types";

export interface ActionEdgeData extends Record<string, unknown> {
  node: string;
  index: number;
  /** Just added / changed by the copilot: draws in or glows for a moment. */
  highlight?: Highlight;
}

export type ActionEdge = Edge<ActionEdgeData>;

export type Dimensions = Record<string, { width: number; height: number }>;

export const actionEdgeId = (node: string, index: number) => `${node}::${index}`;

export function toFlowNodes(
  agent: Agent,
  selection: Selection,
  measured: Dimensions,
  /** Nodes the copilot just added or changed, shown with a short highlight. */
  highlights: ReadonlyMap<string, Highlight> = EMPTY_DIFF.nodes,
): NodeCardNode[] {
  return agent.nodes.map((node) => {
    const dimensions = measured[node.name];
    return {
      id: node.name,
      type: "agentNode",
      position: node.position ?? { x: 0, y: 0 },
      // Controlled nodes must carry their measured size or React Flow keeps them hidden.
      ...(dimensions && { measured: dimensions }),
      selected: selection.kind === "node" && selection.node === node.name,
      data: {
        node,
        isStart: node.name === agent.initial_node,
        highlight: highlights.get(node.name),
      },
    };
  });
}

/**
 * `working`: the copilot is editing, so every arrow shows flowing dashes, except
 * the `highlights` (actions it just added or changed), which play their own animation.
 */
export function toFlowEdges(
  agent: Agent,
  selection: Selection,
  working = false,
  highlights: ReadonlyMap<ActionKey, Highlight> = EMPTY_DIFF.actions,
): ActionEdge[] {
  return agent.nodes.flatMap((node) =>
    node.edges.map((action, index) => {
      const highlight = highlights.get(actionKey(node.name, action));
      return {
        id: actionEdgeId(node.name, index),
        source: node.name,
        target: action.target,
        label: action.function,
        selected:
          selection.kind === "action" && selection.node === node.name && selection.index === index,
        markerEnd: { type: MarkerType.ArrowClosed },
        animated: working && !highlight,
        data: { node: node.name, index, ...(highlight && { highlight }) },
      };
    }),
  );
}
