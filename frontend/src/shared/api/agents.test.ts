import { describe, expect, it } from "vitest";
import { normalizeAgent } from "./agents";

describe("normalizeAgent", () => {
  it("fills the fields schema.py lets JSON omit", () => {
    const agent = normalizeAgent({
      id: "a",
      version: 1,
      updated_at: "2026-10-03T00:00:00.000+00:00",
      name: "A",
      initial_node: "end",
      nodes: [
        { name: "end", end: true, edges: [{ function: "f", description: "", target: "end" }] },
      ],
    });
    expect(agent.persona).toBe("");
    expect(agent.nodes[0]!.task_messages).toEqual([]);
    expect(agent.nodes[0]!.edges[0]).toMatchObject({ properties: {}, required: [] });
  });

  it("defaults a missing edges list to empty", () => {
    const agent = normalizeAgent({
      id: "a",
      version: 1,
      updated_at: "2026-10-03T00:00:00.000+00:00",
      name: "A",
      persona: "p",
      initial_node: "n",
      nodes: [{ name: "n", task_messages: [] }],
    });
    expect(agent.nodes[0]!.edges).toEqual([]);
    expect(agent.persona).toBe("p");
  });
});
