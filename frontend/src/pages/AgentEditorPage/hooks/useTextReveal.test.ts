import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { revealStagger, useTextReveal } from "./useTextReveal";

describe("useTextReveal", () => {
  it("shows text that's there at mount without revealing it", () => {
    const { result } = renderHook(() => useTextReveal("Hello there"));
    expect(result.current.revealing).toBe(false);
  });

  it("reveals a new text until it's finished", () => {
    const { result, rerender } = renderHook(({ value }) => useTextReveal(value), {
      initialProps: { value: "" },
    });
    rerender({ value: "Added a goodbye step." });
    expect(result.current.revealing).toBe(true);

    act(() => {
      result.current.finish();
    });
    expect(result.current.revealing).toBe(false);
  });

  it("staggers fast, and faster for long texts", () => {
    expect(revealStagger(40)).toBe(8);
    expect(revealStagger(1000)).toBe(0.5);
    expect(revealStagger(0)).toBe(0);
  });
});
