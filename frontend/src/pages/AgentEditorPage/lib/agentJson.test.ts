import { describe, expect, it } from "vitest";
import type { Agent } from "@/shared/types/agent";
import { formatAgentJson, parseAgentJson } from "./agentJson";

const agent: Agent = {
  name: "Desk",
  initial_node: "hello",
  persona: "Kind.",
  nodes: [{ name: "hello", task_messages: [], edges: [], position: { x: 0, y: 0 } }],
};

describe("formatAgentJson", () => {
  it("drops the server's metadata and round-trips through parse", () => {
    const stored = { ...agent, id: "desk", version: 3, updated_at: "2026-10-03" };
    const text = formatAgentJson(stored);
    expect(JSON.parse(text)).not.toHaveProperty("id");
    expect(parseAgentJson(text)).toEqual({ ok: true, agent });
  });
});

describe("parseAgentJson", () => {
  it("fills the fields schema.py lets JSON omit", () => {
    const result = parseAgentJson('{"name":"A","initial_node":"n","nodes":[{"name":"n"}]}');
    expect(result).toEqual({
      ok: true,
      agent: {
        name: "A",
        initial_node: "n",
        persona: "",
        nodes: [{ name: "n", task_messages: [], edges: [] }],
      },
    });
  });

  it.each([
    ["{", /^Invalid JSON/],
    ["[]", /must be an object/],
    ['{"name":"A","initial_node":"n"}', /"nodes" must be an array/],
    ['{"name":"A","initial_node":"n","nodes":[{}]}', /nodes\[0\] must be an object/],
    [
      '{"name":"A","initial_node":"n","nodes":[{"name":"n","edges":[{"function":"f"}]}]}',
      /nodes\[0\]\.edges\[0\]/,
    ],
  ])("rejects %s", (text, error) => {
    const result = parseAgentJson(text);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(error);
  });

  it("leaves graph rules (e.g. unknown targets) to the server's validation on save", () => {
    const text =
      '{"name":"A","initial_node":"x","nodes":[{"name":"n","edges":[{"function":"f","target":"nope"}]}]}';
    expect(parseAgentJson(text).ok).toBe(true);
  });
});
