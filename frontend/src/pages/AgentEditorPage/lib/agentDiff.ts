// What an edit to the agent touched, so the canvas can animate it and bring it
// into view. Pure: compares two snapshots of the working copy.

import type { Agent, AgentAction, AgentNode } from "@/shared/types/agent";

/** How an edit touched a node or an action; the canvas animates it for a moment. */
export type Highlight = "added" | "changed";

/** Identifies an action across edits: its index shifts when an earlier one is deleted. */
export type ActionKey = `${string}/${string}`;

export const actionKey = (node: string, action: Pick<AgentAction, "function">): ActionKey =>
  `${node}/${action.function}`;

/** What one edit touched: nodes by name, actions by `actionKey`. */
export interface AgentDiff {
  readonly nodes: ReadonlyMap<string, Highlight>;
  readonly actions: ReadonlyMap<ActionKey, Highlight>;
}

export const EMPTY_DIFF: AgentDiff = { nodes: new Map(), actions: new Map() };

export const isEmptyDiff = (diff: AgentDiff): boolean =>
  diff.nodes.size === 0 && diff.actions.size === 0;

/** A node's own content: not its canvas position, not its actions (diffed on their own). */
const nodeContent = ({ position: _position, edges: _edges, ...node }: AgentNode) =>
  JSON.stringify(node);

/**
 * Which nodes and actions `next` added or changed relative to `prev`. A rename
 * counts as added (names are identities). A deleted action leaves no edge to
 * animate, so its source node counts as changed instead; a deleted node shows
 * through the nodes that lost their actions into it.
 */
export function diffAgents(prev: Agent, next: Agent): AgentDiff {
  const before = new Map(prev.nodes.map((node) => [node.name, node]));
  const nodes = new Map<string, Highlight>();
  const actions = new Map<ActionKey, Highlight>();

  for (const node of next.nodes) {
    const old = before.get(node.name);
    if (!old) nodes.set(node.name, "added");
    else if (nodeContent(old) !== nodeContent(node)) nodes.set(node.name, "changed");

    const oldActions = new Map(old?.edges.map((a) => [a.function, JSON.stringify(a)]));
    for (const action of node.edges) {
      const was = oldActions.get(action.function);
      if (was === undefined) actions.set(actionKey(node.name, action), "added");
      else if (was !== JSON.stringify(action)) actions.set(actionKey(node.name, action), "changed");
    }

    if (old && !nodes.has(node.name)) {
      const kept = new Set(node.edges.map((a) => a.function));
      if (old.edges.some((a) => !kept.has(a.function))) nodes.set(node.name, "changed");
    }
  }
  return { nodes, actions };
}

/** The nodes to bring into view for `diff`: touched nodes and both ends of touched actions. */
export function nodesInView(diff: AgentDiff, agent: Agent): string[] {
  const names = new Set(diff.nodes.keys());
  for (const node of agent.nodes) {
    for (const action of node.edges) {
      if (diff.actions.has(actionKey(node.name, action))) {
        names.add(node.name);
        names.add(action.target);
      }
    }
  }
  return [...names];
}
