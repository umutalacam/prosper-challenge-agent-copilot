import { describe, expect, it } from "vitest";
import { isIdentifier, toIdentifierChars, uniqueName } from "./naming";

describe("uniqueName", () => {
  it("returns the base when free", () => {
    expect(uniqueName("node", ["other"])).toBe("node");
  });

  it("appends the first free numeric suffix", () => {
    expect(uniqueName("node", ["node", "node_2"])).toBe("node_3");
  });
});

describe("isIdentifier", () => {
  it.each(["name", "_x", "full_name2"])("accepts %s", (v) => {
    expect(isIdentifier(v)).toBe(true);
  });

  it.each(["", "2name", "full name", "a-b"])("rejects %j", (v) => {
    expect(isIdentifier(v)).toBe(false);
  });
});

describe("toIdentifierChars", () => {
  it("replaces disallowed characters with underscores", () => {
    expect(toIdentifierChars("go to-node")).toBe("go_to_node");
  });
});
