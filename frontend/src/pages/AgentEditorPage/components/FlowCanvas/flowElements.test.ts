import { describe, expect, it } from "vitest";
import type { Agent } from "@/shared/types/agent";
import { actionEdgeId, toFlowEdges, toFlowNodes } from "./flowElements";

const agent: Agent = {
  name: "A",
  persona: "",
  initial_node: "a",
  nodes: [
    {
      name: "a",
      task_messages: [],
      position: { x: 1, y: 2 },
      edges: [
        { function: "to_b", description: "", target: "b", properties: {}, required: [] },
        { function: "again", description: "", target: "a", properties: {}, required: [] },
      ],
    },
    { name: "b", task_messages: [], edges: [] },
  ],
};

describe("toFlowNodes", () => {
  it("maps nodes by name with start flag, position and selection", () => {
    const nodes = toFlowNodes(agent, { kind: "node", node: "b" }, {});
    expect(nodes.map((n) => n.id)).toEqual(["a", "b"]);
    expect(nodes[0]!.data.isStart).toBe(true);
    expect(nodes[0]!.position).toEqual({ x: 1, y: 2 });
    expect(nodes[1]!.selected).toBe(true);
  });

  it("attaches measured dimensions when known", () => {
    const nodes = toFlowNodes(agent, { kind: "agent" }, { a: { width: 240, height: 100 } });
    expect(nodes[0]!.measured).toEqual({ width: 240, height: 100 });
    expect(nodes[1]!.measured).toBeUndefined();
  });
});

describe("toFlowEdges", () => {
  it("creates one edge per action, addressed by node and index", () => {
    const edges = toFlowEdges(agent, { kind: "action", node: "a", index: 1 });
    expect(edges.map((e) => e.id)).toEqual([actionEdgeId("a", 0), actionEdgeId("a", 1)]);
    expect(edges[0]).toMatchObject({ source: "a", target: "b", label: "to_b", selected: false });
    expect(edges[1]!.selected).toBe(true);
    expect(edges[1]!.data).toEqual({ node: "a", index: 1 });
  });
});
