// Every edit to the agent being composed, as a pure state transition. Cascades that
// keep the graph consistent (renames, deletions) live here and nowhere else.

import type { Agent, AgentAction, AgentNode } from "@/shared/types/agent";
import { uniqueName } from "../lib/naming";
import type { EditorAction, EditorState, Selection } from "./types";

export const NO_SELECTION: Selection = { kind: "none" };

export function createEditorState(agent: Agent, selection: Selection = NO_SELECTION): EditorState {
  return { agent, dirty: false, selection };
}

const mapNodes = (agent: Agent, fn: (node: AgentNode) => AgentNode): Agent => ({
  ...agent,
  nodes: agent.nodes.map(fn),
});

const mapNode = (agent: Agent, name: string, fn: (node: AgentNode) => AgentNode): Agent =>
  mapNodes(agent, (node) => (node.name === name ? fn(node) : node));

/** Apply an edit: marks dirty and optionally moves the selection. */
const edit = (state: EditorState, agent: Agent, selection = state.selection): EditorState => ({
  agent,
  selection,
  dirty: true,
});

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  const { agent } = state;

  switch (action.type) {
    case "saved":
      // Edits made while the save was in flight produce a new agent object.
      return { ...state, dirty: state.agent !== action.agent };

    case "select":
      return { ...state, selection: action.selection };

    case "updateAgent":
      return edit(state, { ...agent, ...action.patch });

    case "replaceAgent":
      // Whatever was selected may no longer exist.
      return edit(state, action.agent, NO_SELECTION);

    case "addNode": {
      const name = uniqueName(
        "new_node",
        agent.nodes.map((n) => n.name),
      );
      const node: AgentNode = {
        name,
        task_messages: [{ role: "developer", content: "" }],
        edges: [],
        position: action.position,
      };
      return edit(state, { ...agent, nodes: [...agent.nodes, node] }, { kind: "node", node: name });
    }

    case "updateNode":
      return edit(
        state,
        mapNode(agent, action.node, (n) => ({ ...n, ...action.patch })),
      );

    case "renameNode": {
      const { from, to } = action;
      if (!to || from === to || agent.nodes.some((n) => n.name === to)) return state;
      const renamed = mapNodes(agent, (n) => ({
        ...n,
        name: n.name === from ? to : n.name,
        edges: n.edges.map((e) => (e.target === from ? { ...e, target: to } : e)),
      }));
      const initial_node = agent.initial_node === from ? to : agent.initial_node;
      const sel = state.selection;
      const selection: Selection = "node" in sel && sel.node === from ? { ...sel, node: to } : sel;
      return edit(state, { ...renamed, initial_node }, selection);
    }

    case "deleteNode": {
      // The start node can't be removed; the UI asks for another start node first.
      if (action.node === agent.initial_node) return state;
      const nodes = agent.nodes
        .filter((n) => n.name !== action.node)
        .map((n) => ({ ...n, edges: n.edges.filter((e) => e.target !== action.node) }));
      return edit(state, { ...agent, nodes }, NO_SELECTION);
    }

    case "moveNodes":
      return edit(
        state,
        mapNodes(agent, (n) => {
          const position = action.positions[n.name];
          return position ? { ...n, position } : n;
        }),
      );

    case "addAction": {
      const source = agent.nodes.find((n) => n.name === action.source);
      if (!source || !agent.nodes.some((n) => n.name === action.target)) return state;
      const newAction: AgentAction = {
        function: uniqueName(
          `go_to_${action.target}`,
          source.edges.map((e) => e.function),
        ),
        description: "",
        target: action.target,
        properties: {},
        required: [],
      };
      return edit(
        state,
        mapNode(agent, source.name, (n) => ({ ...n, edges: [...n.edges, newAction] })),
        { kind: "action", node: source.name, index: source.edges.length },
      );
    }

    case "updateAction":
      return edit(
        state,
        mapNode(agent, action.node, (n) => ({
          ...n,
          edges: n.edges.map((e, i) => (i === action.index ? { ...e, ...action.patch } : e)),
        })),
      );

    case "deleteAction":
      return edit(
        state,
        mapNode(agent, action.node, (n) => ({
          ...n,
          edges: n.edges.filter((_, i) => i !== action.index),
        })),
        { kind: "node", node: action.node },
      );
  }
}
