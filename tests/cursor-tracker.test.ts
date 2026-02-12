import { describe, it, expect } from "vitest";
import {
  interpolatePath,
  easeInOutCubic,
  smoothPath,
  Point,
} from "../src/core/cursor-tracker.js";

describe("easeInOutCubic", () => {
  it("returns 0 at t=0", () => {
    expect(easeInOutCubic(0)).toBe(0);
  });

  it("returns 1 at t=1", () => {
    expect(easeInOutCubic(1)).toBe(1);
  });

  it("returns 0.5 at t=0.5", () => {
    expect(easeInOutCubic(0.5)).toBe(0.5);
  });

  it("is symmetric around 0.5", () => {
    const a = easeInOutCubic(0.3);
    const b = easeInOutCubic(0.7);
    expect(a + b).toBeCloseTo(1, 5);
  });
});

describe("interpolatePath", () => {
  it("returns only the destination for 0 steps", () => {
    const result = interpolatePath({ x: 0, y: 0 }, { x: 100, y: 100 }, 0);
    expect(result).toEqual([{ x: 100, y: 100 }]);
  });

  it("returns start and end for 1 step", () => {
    const from: Point = { x: 0, y: 0 };
    const to: Point = { x: 100, y: 100 };
    const result = interpolatePath(from, to, 1);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual(from);
    expect(result[1]).toEqual(to);
  });

  it("generates the correct number of points", () => {
    const result = interpolatePath({ x: 0, y: 0 }, { x: 200, y: 200 }, 10);
    expect(result).toHaveLength(11); // steps + 1
  });

  it("starts at from and ends at to", () => {
    const from: Point = { x: 10, y: 20 };
    const to: Point = { x: 300, y: 400 };
    const result = interpolatePath(from, to, 8);
    expect(result[0]).toEqual(from);
    expect(result[result.length - 1]).toEqual(to);
  });

  it("produces points that are all within bounds", () => {
    const from: Point = { x: 0, y: 0 };
    const to: Point = { x: 100, y: 100 };
    const result = interpolatePath(from, to, 20);

    for (const p of result) {
      expect(p.x).toBeGreaterThanOrEqual(-20); // Allow slight bezier overshoot
      expect(p.x).toBeLessThanOrEqual(120);
      expect(p.y).toBeGreaterThanOrEqual(-20);
      expect(p.y).toBeLessThanOrEqual(120);
    }
  });
});

describe("smoothPath", () => {
  it("returns the same points for fewer than 3 points", () => {
    const points: Point[] = [
      { x: 0, y: 0 },
      { x: 100, y: 100 },
    ];
    expect(smoothPath(points)).toEqual(points);
  });

  it("preserves the first and last point", () => {
    const points: Point[] = [
      { x: 0, y: 0 },
      { x: 50, y: 80 },
      { x: 100, y: 100 },
    ];
    const result = smoothPath(points);
    expect(result[0]).toEqual(points[0]);
    expect(result[result.length - 1]).toEqual(points[points.length - 1]);
  });

  it("produces more points than input for 3+ point paths", () => {
    const points: Point[] = [
      { x: 0, y: 0 },
      { x: 50, y: 80 },
      { x: 100, y: 100 },
    ];
    const result = smoothPath(points, 0.5);
    expect(result.length).toBeGreaterThan(points.length);
  });
});
