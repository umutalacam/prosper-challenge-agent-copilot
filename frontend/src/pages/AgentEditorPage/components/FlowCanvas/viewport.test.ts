import { describe, expect, it } from "vitest";
import { focusView, unionBox } from "./viewport";

describe("unionBox", () => {
  it("contains every box", () => {
    expect(
      unionBox([
        { x: 0, y: 0, width: 10, height: 10 },
        { x: 50, y: -20, width: 10, height: 10 },
      ]),
    ).toEqual({ x: 0, y: -20, width: 60, height: 30 });
  });

  it("is null for no boxes", () => {
    expect(unionBox([])).toBeNull();
  });
});

describe("focusView", () => {
  const view = { width: 1000, height: 800 };

  it("centers the target and keeps the zoom when it fits", () => {
    expect(focusView({ x: 100, y: 100, width: 200, height: 100 }, view, 1)).toEqual({
      x: 200,
      y: 150,
      zoom: 1,
    });
  });

  it("zooms out just enough when the target doesn't fit", () => {
    // 2800 wide; 70% of 1000 is usable: 700 / 2800 = 0.25.
    const { zoom } = focusView({ x: 0, y: 0, width: 2800, height: 100 }, view, 1);
    expect(zoom).toBeCloseTo(0.25);
  });

  it("never zooms in", () => {
    expect(focusView({ x: 0, y: 0, width: 10, height: 10 }, view, 0.6).zoom).toBe(0.6);
  });
});
