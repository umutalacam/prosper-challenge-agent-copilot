import { describe, expect, it } from "vitest";
import { formatDuration, formatRelative } from "./time";

const now = new Date("2026-10-05T12:00:00Z");
const ago = (seconds: number) => new Date(now.getTime() - seconds * 1000);

describe("formatRelative", () => {
  it("says just now within a minute", () => {
    expect(formatRelative(ago(0), now)).toBe("just now");
    expect(formatRelative(ago(59), now)).toBe("just now");
  });

  it("uses the largest unit that fits", () => {
    expect(formatRelative(ago(60), now)).toBe("1 minute ago");
    expect(formatRelative(ago(34 * 60), now)).toBe("34 minutes ago");
    expect(formatRelative(ago(3 * 3600), now)).toBe("3 hours ago");
    expect(formatRelative(ago(24 * 3600), now)).toBe("yesterday");
    expect(formatRelative(ago(3 * 24 * 3600), now)).toBe("3 days ago");
    expect(formatRelative(ago(14 * 24 * 3600), now)).toBe("2 weeks ago");
  });
});

describe("formatDuration", () => {
  it("formats as a clock", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(42_000)).toBe("0:42");
    expect(formatDuration(125_400)).toBe("2:05");
    expect(formatDuration(3_730_000)).toBe("1:02:10");
  });
});
