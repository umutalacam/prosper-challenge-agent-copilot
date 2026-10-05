import { describe, expect, it } from "vitest";
import type { AgentSummary } from "@/shared/types/agent";
import { orderAgents } from "./orderAgents";

const agent = (id: string, updated_at: string): AgentSummary => ({
  id,
  name: id,
  node_count: 1,
  version: 1,
  updated_at,
  call_count: 0,
  last_call_at: null,
});

const agents = [
  agent("old", "2026-10-01T09:00:00Z"),
  agent("live", "2026-09-01T09:00:00Z"),
  agent("newest", "2026-10-05T09:00:00Z"),
  agent("middle", "2026-10-03T09:00:00Z"),
];

describe("orderAgents", () => {
  it("puts the deployed agent first, then the rest by last save, newest first", () => {
    expect(orderAgents(agents, "live").map((a) => a.id)).toEqual([
      "live",
      "newest",
      "middle",
      "old",
    ]);
  });

  it("orders by last save alone when nothing is deployed", () => {
    expect(orderAgents(agents, null).map((a) => a.id)).toEqual(["newest", "middle", "old", "live"]);
  });

  it("leaves the input alone", () => {
    orderAgents(agents, "live");
    expect(agents[0]?.id).toBe("old");
  });
});
