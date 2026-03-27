import { describe, it, expect } from "vitest";
import {
  calculateZoomSequence,
  calculateAdaptiveZoom,
  buildZoomClickLookup,
  calculateAdaptiveZoomFromLookup,
  calculateAdaptiveZoomFromZones,
  calculateAdaptiveZoomInWindow,
  mergeClickZones,
  springEasing,
  applyZoomEasing,
} from "../src/effects/zoom.js";

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

// ─── buildZoomClickLookup ─────────────────────────────────────────────────────

describe("buildZoomClickLookup", () => {
  it("returns empty array when no frames have clicks", () => {
    const frames = [{ clickPosition: null }, { clickPosition: null }];
    expect(buildZoomClickLookup(frames)).toEqual([]);
  });

  it("returns sorted indices of click frames", () => {
    const frames = [
      { clickPosition: null },
      { clickPosition: { x: 10, y: 20 } },
      { clickPosition: null },
      { clickPosition: { x: 30, y: 40 } },
    ];
    expect(buildZoomClickLookup(frames)).toEqual([1, 3]);
  });

  it("handles all frames having clicks", () => {
    const frames = [
      { clickPosition: { x: 0, y: 0 } },
      { clickPosition: { x: 1, y: 1 } },
    ];
    expect(buildZoomClickLookup(frames)).toEqual([0, 1]);
  });

  it("returns empty for empty input", () => {
    expect(buildZoomClickLookup([])).toEqual([]);
  });
});

// ─── calculateAdaptiveZoomFromLookup ─────────────────────────────────────────

describe("calculateAdaptiveZoomFromLookup", () => {
  it("returns 1 when maxScale <= 1", () => {
    expect(calculateAdaptiveZoomFromLookup([5], 5, 1, 10)).toBe(1);
    expect(calculateAdaptiveZoomFromLookup([5], 5, 0.5, 10)).toBe(1);
  });

  it("returns 1 when lookup is empty", () => {
    expect(calculateAdaptiveZoomFromLookup([], 5, 2, 10)).toBe(1);
  });

  it("returns maxScale exactly at click frame", () => {
    const result = calculateAdaptiveZoomFromLookup([5], 5, 2.0, 10);
    expect(result).toBeCloseTo(2.0, 5);
  });

  it("returns 1 when beyond transitionFrames distance", () => {
    const result = calculateAdaptiveZoomFromLookup([0], 11, 2.0, 10);
    expect(result).toBe(1);
  });

  it("returns value between 1 and maxScale at intermediate distance", () => {
    const maxScale = 2.0;
    const result = calculateAdaptiveZoomFromLookup([10], 5, maxScale, 10);
    expect(result).toBeGreaterThan(1);
    expect(result).toBeLessThan(maxScale);
  });

  it("produces same results as calculateAdaptiveZoom for all frames", () => {
    const frames = [
      { clickPosition: null },
      { clickPosition: null },
      { clickPosition: { x: 100, y: 200 } },
      { clickPosition: null },
      { clickPosition: null },
      { clickPosition: { x: 50, y: 80 } },
      { clickPosition: null },
      { clickPosition: null },
    ];
    const maxScale = 2.0;
    const transitionFrames = 3;
    const lookup = buildZoomClickLookup(frames);

    for (let i = 0; i < frames.length; i++) {
      const expected = calculateAdaptiveZoom(frames, i, maxScale, transitionFrames);
      const actual = calculateAdaptiveZoomFromLookup(lookup, i, maxScale, transitionFrames);
      expect(actual).toBeCloseTo(expected, 10);
    }
  });
});

// ─── calculateAdaptiveZoomInWindow ───────────────────────────────────────────

describe("calculateAdaptiveZoomInWindow", () => {
  it("returns 1 when maxScale <= 1", () => {
    const win = [{ clickPosition: { x: 0, y: 0 } }];
    expect(calculateAdaptiveZoomInWindow(win, 0, 0, 1, 10)).toBe(1);
  });

  it("returns maxScale at the click frame", () => {
    const win = [{ clickPosition: { x: 0, y: 0 } }];
    const result = calculateAdaptiveZoomInWindow(win, 5, 5, 2.0, 10);
    expect(result).toBeCloseTo(2.0, 5);
  });

  it("returns 1 when no click in window", () => {
    const win = [{ clickPosition: null }, { clickPosition: null }];
    expect(calculateAdaptiveZoomInWindow(win, 0, 1, 2.0, 10)).toBe(1);
  });

  it("matches calculateAdaptiveZoom results for frames within window", () => {
    const allFrames = [
      { clickPosition: null },
      { clickPosition: null },
      { clickPosition: { x: 10, y: 20 } },
      { clickPosition: null },
      { clickPosition: null },
    ];
    const maxScale = 2.5;
    const transitionFrames = 2;

    for (let i = 0; i < allFrames.length; i++) {
      const lo = Math.max(0, i - transitionFrames);
      const hi = Math.min(allFrames.length - 1, i + transitionFrames);
      const windowFrames = allFrames.slice(lo, hi + 1);

      const expected = calculateAdaptiveZoom(allFrames, i, maxScale, transitionFrames);
      const actual = calculateAdaptiveZoomInWindow(windowFrames, lo, i, maxScale, transitionFrames);
      expect(actual).toBeCloseTo(expected, 10);
    }
  });
});

// ─── Spring Easing ──────────────────────────────────────────────────────────

describe("springEasing", () => {
  it("starts at 0 and ends near 1", () => {
    expect(springEasing(0)).toBeCloseTo(0, 5);
    expect(springEasing(1)).toBeCloseTo(1, 2);
  });

  it("is monotonically increasing (no overshoot)", () => {
    let prev = 0;
    for (let t = 0; t <= 1; t += 0.01) {
      const val = springEasing(t);
      expect(val).toBeGreaterThanOrEqual(prev - 1e-10);
      prev = val;
    }
  });

  it("has faster initial response than cubic", () => {
    const springVal = springEasing(0.2);
    const cubicVal = applyZoomEasing(0.2, "cubic");
    expect(springVal).toBeGreaterThan(cubicVal);
  });
});

// ─── Zone-Aware Zoom ────────────────────────────────────────────────────────

describe("mergeClickZones", () => {
  it("returns empty for no clicks", () => {
    expect(mergeClickZones([], 10)).toEqual([]);
  });

  it("creates single zone for one click", () => {
    expect(mergeClickZones([5], 10)).toEqual([{ start: 5, end: 5 }]);
  });

  it("merges close clicks into one zone", () => {
    const zones = mergeClickZones([5, 8, 12], 5);
    expect(zones).toHaveLength(1);
    expect(zones[0]).toEqual({ start: 5, end: 12 });
  });

  it("splits distant clicks into separate zones", () => {
    const zones = mergeClickZones([5, 8, 30], 5);
    expect(zones).toHaveLength(2);
    expect(zones[0]).toEqual({ start: 5, end: 8 });
    expect(zones[1]).toEqual({ start: 30, end: 30 });
  });

  it("handles gap exactly equal to mergeGap", () => {
    const zones = mergeClickZones([10, 15], 5);
    expect(zones).toHaveLength(1);
  });
});

describe("calculateAdaptiveZoomFromZones", () => {
  it("returns 1 when no zones", () => {
    expect(calculateAdaptiveZoomFromZones([], 5, 2.0, 10)).toBe(1);
  });

  it("returns maxScale inside a zone", () => {
    const zones = [{ start: 5, end: 15 }];
    expect(calculateAdaptiveZoomFromZones(zones, 10, 2.0, 10)).toBe(2.0);
  });

  it("returns 1 far outside any zone", () => {
    const zones = [{ start: 5, end: 15 }];
    expect(calculateAdaptiveZoomFromZones(zones, 100, 2.0, 10)).toBe(1);
  });

  it("eases in approaching a zone", () => {
    const zones = [{ start: 10, end: 20 }];
    const val = calculateAdaptiveZoomFromZones(zones, 5, 2.0, 10);
    expect(val).toBeGreaterThan(1);
    expect(val).toBeLessThan(2.0);
  });

  it("maintains zoom between merged clicks (no dip)", () => {
    const zones = mergeClickZones([10, 18], 10);
    const val = calculateAdaptiveZoomFromZones(zones, 14, 2.0, 10);
    expect(val).toBe(2.0);
  });

  it("uses spring easing when specified", () => {
    const zones = [{ start: 10, end: 10 }];
    const springVal = calculateAdaptiveZoomFromZones(zones, 5, 2.0, 10, "spring");
    const cubicVal = calculateAdaptiveZoomFromZones(zones, 5, 2.0, 10, "cubic");
    expect(springVal).not.toBeCloseTo(cubicVal, 3);
  });
});
