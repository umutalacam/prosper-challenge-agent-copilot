import { describe, expect, it } from "vitest";
import type { Agent, AgentAction, AgentNode } from "@/shared/types/agent";
import { actionKey, diffAgents, isEmptyDiff, nodesInView } from "./agentDiff";

const agent = (nodes: AgentNode[]): Agent => ({ name: "A", persona: "", initial_node: "a", nodes });
const action = (fn: string, target: string, description = ""): AgentAction => ({
  function: fn,
  description,
  target,
  properties: {},
  required: [],
});
const node = (name: string, opts: { task?: string; x?: number; edges?: AgentAction[] } = {}) => ({
  name,
  task_messages: [{ role: "developer" as const, content: opts.task ?? "" }],
  edges: opts.edges ?? [],
  position: { x: opts.x ?? 0, y: 0 },
});

describe("diffAgents", () => {
  it("finds added and changed nodes, ignoring moves", () => {
    const prev = agent([node("a"), node("b"), node("c")]);
    const next = agent([node("a", { x: 500 }), node("b", { task: "new" }), node("c"), node("d")]);
    const diff = diffAgents(prev, next);
    expect(diff.nodes).toEqual(
      new Map([
        ["b", "changed"],
        ["d", "added"],
      ]),
    );
    expect(diff.actions.size).toBe(0);
  });

  it("finds added and changed actions without marking their node", () => {
    const prev = agent([node("a", { edges: [action("to_b", "b")] }), node("b"), node("c")]);
    const next = agent([
      node("a", { edges: [action("to_b", "b", "When ready"), action("to_c", "c")] }),
      node("b"),
      node("c"),
    ]);
    const diff = diffAgents(prev, next);
    expect(diff.nodes.size).toBe(0);
    expect(diff.actions).toEqual(
      new Map([
        ["a/to_b", "changed"],
        ["a/to_c", "added"],
      ]),
    );
  });

  it("identifies actions by name, so deleting one doesn't mark the rest as new", () => {
    const prev = agent([
      node("a", { edges: [action("to_b", "b"), action("to_c", "c")] }),
      node("b"),
      node("c"),
    ]);
    const next = agent([node("a", { edges: [action("to_c", "c")] }), node("b"), node("c")]);
    const diff = diffAgents(prev, next);
    expect(diff.actions.size).toBe(0);
    expect(diff.nodes).toEqual(new Map([["a", "changed"]])); // it lost an action
  });

  it("is empty when nothing but positions changed", () => {
    const prev = agent([node("a")]);
    expect(isEmptyDiff(diffAgents(prev, agent([node("a", { x: 9 })])))).toBe(true);
  });
});

describe("nodesInView", () => {
  it("covers touched nodes and both ends of touched actions", () => {
    const next = agent([node("a", { edges: [action("to_c", "c")] }), node("b"), node("c")]);
    const diff = {
      nodes: new Map([["b", "changed" as const]]),
      actions: new Map([[actionKey("a", { function: "to_c" }), "added" as const]]),
    };
    expect(nodesInView(diff, next).sort()).toEqual(["a", "b", "c"]);
  });
});
