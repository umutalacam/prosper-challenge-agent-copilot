import { describe, expect, it } from "vitest";
import { callerName } from "./callerName";

describe("callerName", () => {
  it("is an adjective and an animal, the same for the same call", () => {
    expect(callerName("3f2a9c11")).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/);
    expect(callerName("3f2a9c11")).toBe(callerName("3f2a9c11"));
  });

  it("tells calls apart", () => {
    const ids = Array.from({ length: 50 }, (_, i) => `session-${String(i)}`);
    expect(new Set(ids.map(callerName)).size).toBeGreaterThan(40);
  });
});
