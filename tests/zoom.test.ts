import { describe, it, expect } from "vitest";
import { calculateZoomSequence } from "../src/effects/zoom.js";

describe("calculateZoomSequence", () => {
  it("returns empty array for 0 frames", () => {
    expect(calculateZoomSequence(0, 2, 2)).toEqual([]);
  });

  it("returns all 1s when maxScale is 1", () => {
    const result = calculateZoomSequence(10, 1, 2);
    expect(result).toEqual(Array(10).fill(1));
  });

  it("returns correct number of frames", () => {
    const result = calculateZoomSequence(12, 2, 4);
    expect(result).toHaveLength(12);
  });

  it("starts near 1 and ends near 1", () => {
    const result = calculateZoomSequence(20, 2.5, 4);
    expect(result[0]).toBeCloseTo(1, 0);
    expect(result[result.length - 1]).toBeCloseTo(1, 0);
  });

  it("reaches max scale during hold phase", () => {
    const maxScale = 2.0;
    const result = calculateZoomSequence(20, maxScale, 4);
    const max = Math.max(...result);
    expect(max).toBeCloseTo(maxScale, 1);
  });

  it("produces smooth transitions (no jumps > 0.5)", () => {
    const result = calculateZoomSequence(30, 3, 6);
    for (let i = 1; i < result.length; i++) {
      expect(Math.abs(result[i] - result[i - 1])).toBeLessThan(0.5);
    }
  });
});
