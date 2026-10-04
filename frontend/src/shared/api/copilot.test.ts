import { describe, expect, it } from "vitest";
import { parseNdjson } from "./copilot";

describe("parseNdjson", () => {
  it("returns complete lines as events and keeps a partial last line", () => {
    const { events, rest } = parseNdjson('{"type":"activity","text":"Thinking…"}\n{"type":"do');
    expect(events).toEqual([{ type: "activity", text: "Thinking…" }]);
    expect(rest).toBe('{"type":"do');
    expect(parseNdjson(rest + 'ne"}\n')).toEqual({ events: [{ type: "done" }], rest: "" });
  });

  it("skips blank lines", () => {
    expect(parseNdjson('\n{"type":"done"}\n\n').events).toEqual([{ type: "done" }]);
  });
});
