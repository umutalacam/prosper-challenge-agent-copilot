import type { AgentAction, AgentNode } from "@/shared/types/agent";
import type { EditorState } from "./types";

export function findNode(state: EditorState, name: string): AgentNode | undefined {
  return state.agent.nodes.find((n) => n.name === name);
}

export function selectedNode(state: EditorState): AgentNode | undefined {
  const { selection } = state;
  return "node" in selection ? findNode(state, selection.node) : undefined;
}

export function selectedAction(state: EditorState): AgentAction | undefined {
  const { selection } = state;
  return selection.kind === "action"
    ? findNode(state, selection.node)?.edges[selection.index]
    : undefined;
}

export function nodeNames(state: EditorState): string[] {
  return state.agent.nodes.map((n) => n.name);
}
