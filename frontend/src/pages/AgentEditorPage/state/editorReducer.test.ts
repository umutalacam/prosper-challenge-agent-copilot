import { describe, expect, it } from "vitest";
import type { Agent } from "@/shared/types/agent";
import { createEditorState, editorReducer } from "./editorReducer";
import type { EditorAction, EditorState } from "./types";

function agent(): Agent {
  return {
    name: "Test",
    persona: "",
    initial_node: "greeting",
    nodes: [
      {
        name: "greeting",
        task_messages: [],
        edges: [
          { function: "next", description: "", target: "collect", properties: {}, required: [] },
        ],
      },
      { name: "collect", task_messages: [], edges: [] },
    ],
  };
}

const run = (actions: EditorAction[], state: EditorState = createEditorState(agent())) =>
  actions.reduce(editorReducer, state);

describe("editorReducer", () => {
  it("starts clean with nothing selected, and becomes dirty on edit", () => {
    const initial = createEditorState(agent());
    expect(initial.dirty).toBe(false);
    expect(initial.selection).toEqual({ kind: "none" });
    expect(run([{ type: "updateAgent", patch: { name: "X" } }]).dirty).toBe(true);
  });

  it("saved clears dirty when nothing changed since the snapshot was sent", () => {
    const edited = run([{ type: "updateAgent", patch: { name: "X" } }]);
    const state = editorReducer(edited, { type: "saved", agent: edited.agent });
    expect(state.dirty).toBe(false);
  });

  it("saved keeps dirty when edits happened during the save", () => {
    const sent = run([{ type: "updateAgent", patch: { name: "X" } }]);
    const editedDuringSave = editorReducer(sent, { type: "updateAgent", patch: { name: "Y" } });
    const state = editorReducer(editedDuringSave, { type: "saved", agent: sent.agent });
    expect(state.dirty).toBe(true);
    expect(state.agent.name).toBe("Y");
  });

  it("replaceAgent swaps the whole document, marks dirty and clears the selection", () => {
    const replacement: Agent = { ...agent(), name: "From JSON", nodes: [agent().nodes[1]!] };
    const state = run([
      { type: "select", selection: { kind: "node", node: "greeting" } },
      { type: "replaceAgent", agent: replacement },
    ]);
    expect(state.agent).toBe(replacement);
    expect(state.dirty).toBe(true);
    expect(state.selection).toEqual({ kind: "none" });
  });

  it("selection changes don't mark dirty", () => {
    const state = run([{ type: "select", selection: { kind: "node", node: "collect" } }]);
    expect(state.dirty).toBe(false);
  });

  describe("renameNode", () => {
    it("cascades to action targets, the start node and the selection", () => {
      const state = run([
        { type: "select", selection: { kind: "node", node: "greeting" } },
        { type: "renameNode", from: "greeting", to: "hello" },
        { type: "renameNode", from: "collect", to: "details" },
      ]);
      expect(state.agent.initial_node).toBe("hello");
      expect(state.agent.nodes[0]!.edges[0]!.target).toBe("details");
      expect(state.selection).toEqual({ kind: "node", node: "hello" });
    });

    it("refuses empty or duplicate names", () => {
      const before = createEditorState(agent());
      expect(editorReducer(before, { type: "renameNode", from: "collect", to: "greeting" })).toBe(
        before,
      );
      expect(editorReducer(before, { type: "renameNode", from: "collect", to: "" })).toBe(before);
    });
  });

  describe("deleteNode", () => {
    it("removes the node and actions pointing at it", () => {
      const state = run([{ type: "deleteNode", node: "collect" }]);
      expect(state.agent.nodes.map((n) => n.name)).toEqual(["greeting"]);
      expect(state.agent.nodes[0]!.edges).toEqual([]);
      expect(state.selection).toEqual({ kind: "none" });
    });

    it("refuses to delete the start node", () => {
      const before = createEditorState(agent());
      expect(editorReducer(before, { type: "deleteNode", node: "greeting" })).toBe(before);
    });
  });

  describe("addNode", () => {
    it("adds a uniquely named node and selects it", () => {
      const state = run([
        { type: "addNode", position: { x: 0, y: 0 } },
        { type: "addNode", position: { x: 0, y: 0 } },
      ]);
      expect(state.agent.nodes.map((n) => n.name)).toEqual([
        "greeting",
        "collect",
        "new_node",
        "new_node_2",
      ]);
      expect(state.selection).toEqual({ kind: "node", node: "new_node_2" });
    });
  });

  describe("actions", () => {
    it("addAction picks a unique function name and selects the new action", () => {
      const state = run([
        { type: "addAction", source: "greeting", target: "collect" },
        { type: "addAction", source: "greeting", target: "collect" },
      ]);
      const fns = state.agent.nodes[0]!.edges.map((e) => e.function);
      expect(fns).toEqual(["next", "go_to_collect", "go_to_collect_2"]);
      expect(state.selection).toEqual({ kind: "action", node: "greeting", index: 2 });
    });

    it("addAction refuses a self-loop and anything out of an end node", () => {
      const before = createEditorState(agent());
      expect(
        editorReducer(before, { type: "addAction", source: "collect", target: "collect" }),
      ).toBe(before);
      const ended = run([{ type: "updateNode", node: "greeting", patch: { end: true } }]);
      expect(
        editorReducer(ended, { type: "addAction", source: "greeting", target: "collect" }),
      ).toBe(ended);
      expect(
        editorReducer(ended, {
          type: "addNodeAfter",
          source: "greeting",
          position: { x: 0, y: 0 },
        }),
      ).toBe(ended);
    });

    it("addAction refuses to lead into the start node", () => {
      const before = createEditorState(agent());
      expect(
        editorReducer(before, { type: "addAction", source: "collect", target: "greeting" }),
      ).toBe(before);
    });

    it("addNodeAfter adds a node, connects the source to it and selects it", () => {
      const state = run([{ type: "addNodeAfter", source: "greeting", position: { x: 5, y: 9 } }]);
      const added = state.agent.nodes[2]!;
      expect(added).toMatchObject({ name: "new_node", position: { x: 5, y: 9 }, edges: [] });
      expect(state.agent.nodes[0]!.edges.map((e) => [e.function, e.target])).toEqual([
        ["next", "collect"],
        ["go_to_new_node", "new_node"],
      ]);
      expect(state.selection).toEqual({ kind: "node", node: "new_node" });
      expect(state.dirty).toBe(true);
    });

    it("addAction ignores unknown nodes", () => {
      const before = createEditorState(agent());
      expect(editorReducer(before, { type: "addAction", source: "greeting", target: "nope" })).toBe(
        before,
      );
    });

    it("updateAction patches only the addressed action", () => {
      const state = run([
        { type: "updateAction", node: "greeting", index: 0, patch: { description: "Go on" } },
      ]);
      expect(state.agent.nodes[0]!.edges[0]!.description).toBe("Go on");
      expect(state.agent.nodes[0]!.edges[0]!.function).toBe("next");
    });

    it("deleteAction removes it and selects its node", () => {
      const state = run([{ type: "deleteAction", node: "greeting", index: 0 }]);
      expect(state.agent.nodes[0]!.edges).toEqual([]);
      expect(state.selection).toEqual({ kind: "node", node: "greeting" });
    });
  });

  it("moveNodes only touches the given nodes", () => {
    const state = run([{ type: "moveNodes", positions: { collect: { x: 10, y: 20 } } }]);
    expect(state.agent.nodes[1]!.position).toEqual({ x: 10, y: 20 });
    expect(state.agent.nodes[0]!.position).toBeUndefined();
  });
});
