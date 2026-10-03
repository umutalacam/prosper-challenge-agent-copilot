import { describe, expect, it } from "vitest";
import type { AgentNode } from "@/shared/types/agent";
import {
  autoLayout,
  NODE_SIZE,
  nextNodePosition,
  positionBelow,
  withPositions,
} from "./autoLayout";

const node = (
  name: string,
  targets: string[] = [],
  position?: AgentNode["position"],
): AgentNode => ({
  name,
  task_messages: [],
  edges: targets.map((target) => ({
    function: `to_${target}`,
    description: "",
    target,
    properties: {},
    required: [],
  })),
  ...(position && { position }),
});

describe("autoLayout", () => {
  it("places a chain top to bottom", () => {
    const pos = autoLayout([node("a", ["b"]), node("b", ["c"]), node("c")]);
    expect(pos.a!.y).toBeLessThan(pos.b!.y);
    expect(pos.b!.y).toBeLessThan(pos.c!.y);
  });

  it("tolerates self-loops", () => {
    expect(() => autoLayout([node("a", ["a"])])).not.toThrow();
  });
});

describe("withPositions", () => {
  it("keeps existing positions and fills missing ones", () => {
    const agent = { nodes: [node("a", ["b"], { x: 5, y: 5 }), node("b")] };
    const result = withPositions(agent);
    expect(result.nodes[0]!.position).toEqual({ x: 5, y: 5 });
    expect(result.nodes[1]!.position).toBeDefined();
  });

  it("returns the same object when nothing is missing", () => {
    const agent = { nodes: [node("a", [], { x: 0, y: 0 })] };
    expect(withPositions(agent)).toBe(agent);
  });
});

describe("nextNodePosition", () => {
  it("goes below the lowest node", () => {
    const pos = nextNodePosition([node("a", [], { x: 0, y: 300 })]);
    expect(pos.y).toBeGreaterThan(300);
  });
});

describe("positionBelow", () => {
  it("goes straight below the source", () => {
    const pos = positionBelow([node("a", [], { x: 100, y: 0 })], "a");
    expect(pos.x).toBe(100);
    expect(pos.y).toBeGreaterThan(NODE_SIZE.height);
  });

  it("steps right past a node already there, e.g. an earlier sibling", () => {
    const first = positionBelow([node("a", [], { x: 0, y: 0 })], "a");
    const pos = positionBelow([node("a", [], { x: 0, y: 0 }), node("b", [], first)], "a");
    expect(pos.y).toBe(first.y);
    expect(pos.x).toBeGreaterThanOrEqual(first.x + NODE_SIZE.width);
  });
});
