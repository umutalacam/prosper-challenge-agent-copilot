import { describe, expect, it } from "vitest";
import type { CallEvent } from "@/shared/types/call";
import { longStays, stuckNode, stuckNodesOf } from "./callHealth";

describe("stuckNode / longStays", () => {
  it("calls a completed call's long node a long stay, not stuck", () => {
    const call = { outcome: "completed" as const, end_node: "confirm", stuck_nodes: ["greeting"] };
    expect(stuckNode(call)).toBeNull();
    expect(longStays(call)).toEqual(["greeting"]);
  });

  it("calls it stuck when the call ended there, unfinished", () => {
    const call = { outcome: "abandoned" as const, end_node: "greeting", stuck_nodes: ["greeting"] };
    expect(stuckNode(call)).toBe("greeting");
    expect(longStays(call)).toEqual([]);
  });

  it("keeps earlier long stays apart from where it got stuck", () => {
    const call = {
      outcome: "error" as const,
      end_node: "offer_times",
      stuck_nodes: ["greeting", "offer_times"],
    };
    expect(stuckNode(call)).toBe("offer_times");
    expect(longStays(call)).toEqual(["greeting"]);
  });
});

describe("stuckNodesOf", () => {
  it("lists each stuck node once, in order", () => {
    const events: CallEvent[] = [
      { type: "stuck", node: "greeting", replies: 3, at_ms: 1 },
      { type: "stuck", node: "offer", replies: 3, at_ms: 2 },
      { type: "stuck", node: "greeting", replies: 3, at_ms: 3 },
    ];
    expect(stuckNodesOf(events)).toEqual(["greeting", "offer"]);
  });
});
