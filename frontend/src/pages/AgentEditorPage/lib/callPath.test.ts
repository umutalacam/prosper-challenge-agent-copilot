import { describe, expect, it } from "vitest";
import type { CallDetail } from "@/shared/types/call";
import { pathSteps } from "./callPath";

const call = (overrides: Partial<CallDetail>): CallDetail => ({
  id: "c1",
  agent_id: "desk",
  agent_name: "Desk",
  agent_version: 2,
  started_at: "2026-10-05T09:00:00Z",
  ended_at: "2026-10-05T09:01:00Z",
  duration_ms: 60_000,
  outcome: "completed",
  end_node: "confirm",
  path: ["greeting", "confirm"],
  transcript: [],
  final_state: {},
  events: [
    { type: "started", node: "greeting", at_ms: 100 },
    { type: "stuck", node: "greeting", replies: 3, at_ms: 9_000 },
    {
      type: "transition",
      from: "greeting",
      to: "confirm",
      function: "record_caller",
      args: { name: "Ana" },
      state: { name: "Ana" },
      at_ms: 20_000,
    },
  ],
  ...overrides,
});

describe("pathSteps", () => {
  it("turns the timeline into steps with stays, exits and the ending", () => {
    expect(pathSteps(call({}))).toEqual([
      {
        node: "greeting",
        enteredMs: 100,
        stayMs: 19_900,
        exit: { function: "record_caller", args: { name: "Ana" } },
        ending: null,
        longStay: true, // the call moved on: a note, not stuck
        stuck: false,
      },
      {
        node: "confirm",
        enteredMs: 20_000,
        stayMs: 40_000,
        exit: null,
        ending: "completed",
        longStay: false,
        stuck: false,
      },
    ]);
  });

  it("marks the last step stuck when the call ended there unfinished", () => {
    const steps = pathSteps(
      call({
        outcome: "abandoned",
        end_node: "greeting",
        path: ["greeting"],
        events: [
          { type: "started", node: "greeting", at_ms: 0 },
          { type: "stuck", node: "greeting", replies: 3, at_ms: 9_000 },
        ],
      }),
    );
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({ ending: "abandoned", stuck: true, longStay: false });
  });

  it("is empty when the flow never started", () => {
    expect(pathSteps(call({ path: [], events: [], outcome: "not_started" }))).toEqual([]);
  });

  it("still lists every node, untimed, when the timeline is missing", () => {
    const steps = pathSteps(call({ events: [] }));
    expect(steps.map((s) => [s.node, s.enteredMs, s.stayMs, s.exit])).toEqual([
      ["greeting", null, null, null],
      ["confirm", null, null, null],
    ]);
    expect(steps[1]?.ending).toBe("completed");
  });
});
