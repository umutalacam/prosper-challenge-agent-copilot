import { describe, expect, it } from "vitest";
import type { AgentSummary } from "@/shared/types/agent";
import { deployState } from "./deployState";

const agent: AgentSummary = {
  id: "desk",
  name: "Desk",
  node_count: 3,
  version: 5,
  updated_at: "2026-10-05T09:00:00Z",
};

describe("deployState", () => {
  it("is deploying while a deploy for the agent is in flight", () => {
    expect(deployState(agent, { agentId: "desk", version: 3 }, "desk")).toEqual({
      kind: "deploying",
    });
  });

  it("is deployed when the live version is the latest save", () => {
    expect(deployState(agent, { agentId: "desk", version: 5 }, null)).toEqual({
      kind: "deployed",
      version: 5,
    });
  });

  it("is outdated when newer saves aren't live", () => {
    expect(deployState(agent, { agentId: "desk", version: 3 }, null)).toEqual({
      kind: "outdated",
      version: 3,
    });
  });

  it("is none for any other agent, or with nothing deployed", () => {
    expect(deployState(agent, { agentId: "other", version: 1 }, null)).toEqual({ kind: "none" });
    expect(deployState(agent, null, undefined)).toEqual({ kind: "none" });
  });
});
