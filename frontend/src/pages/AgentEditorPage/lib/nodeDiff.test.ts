import { describe, expect, it } from "vitest";
import type { Agent } from "@/shared/types/agent";
import { diffNodes } from "./nodeDiff";

const agent = (nodes: Agent["nodes"]): Agent => ({
  name: "A",
  persona: "",
  initial_node: "a",
  nodes,
});
const node = (name: string, task = "", x = 0) => ({
  name,
  task_messages: [{ role: "developer", content: task }],
  edges: [],
  position: { x, y: 0 },
});

describe("diffNodes", () => {
  it("finds added and changed nodes, ignoring moves", () => {
    const prev = agent([node("a"), node("b"), node("c")]);
    const next = agent([node("a", "", 500), node("b", "new task"), node("c"), node("d")]);
    expect(diffNodes(prev, next)).toEqual(
      new Map([
        ["b", "changed"],
        ["d", "added"],
      ]),
    );
  });
});
