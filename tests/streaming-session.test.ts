import { vi, describe, it, expect } from "vitest";

// Mock encodeMp4Stream so tests don't require FFmpeg.
// The mock drains the generator (simulating real encoder behaviour) and
// returns a predictable Buffer.
vi.mock("../src/compose/video-encoder.js", () => ({
  encodeMp4Stream: vi.fn().mockImplementation(
    async (frames: AsyncIterable<unknown>) => {
      for await (const _ of frames) { /* drain */ }
      return Buffer.from("fake-mp4-data");
    },
  ),
}));

import { StreamingSession } from "../src/compose/streaming-session.js";
import type { PipelineProgress } from "../src/compose/streaming-session.js";
import type { RecordingSession, CapturedFrame, ComposedFrame } from "../src/script/types.js";
import type { CanvasRenderer } from "../src/compose/canvas-renderer.js";

// ─── Test helpers ─────────────────────────────────────────────────────────────

function makeSession(frameCount: number): RecordingSession {
  const frames: CapturedFrame[] = Array.from({ length: frameCount }, (_, i) => ({
    index: i,
    screenshot: Buffer.alloc(4, i),
    timestamp: i * 33,
    cursorPosition: null,
    clickPosition: null,
    viewport: { width: 100, height: 100 },
  }));
  return {
    scenario: {
      output: {
        format: "mp4",
        width: 100,
        height: 100,
        fps: 30,
        quality: 80,
        outputDir: "./output",
        filename: "test",
      },
      // Other scenario fields not needed for these tests
    } as RecordingSession["scenario"],
    frames,
    startTime: Date.now(),
  };
}

/** Renderer that passes frames through unchanged — no Sharp, no workers. */
function makePassthroughRenderer(session: RecordingSession): CanvasRenderer {
  return {
    async *composeStream(frames: CapturedFrame[]): AsyncGenerator<ComposedFrame> {
      for (const f of frames) {
        yield { index: f.index, buffer: f.screenshot, timestamp: f.timestamp };
      }
    },
  } as unknown as CanvasRenderer;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("StreamingSession", () => {
  describe("totalFrames", () => {
    it("reflects the session frame count", () => {
      const session = makeSession(7);
      const pipeline = new StreamingSession(session, makePassthroughRenderer(session));
      expect(pipeline.totalFrames).toBe(7);
    });

    it("is 0 for an empty session", () => {
      const session = makeSession(0);
      const pipeline = new StreamingSession(session, makePassthroughRenderer(session));
      expect(pipeline.totalFrames).toBe(0);
    });
  });

  describe("progress events", () => {
    it("emits exactly one event per frame", async () => {
      const session = makeSession(4);
      const pipeline = new StreamingSession(session, makePassthroughRenderer(session));
      const events: PipelineProgress[] = [];
      pipeline.on("progress", (e) => events.push(e));

      await pipeline.run();

      expect(events).toHaveLength(4);
    });

    it("increments composed from 1 to totalFrames", async () => {
      const session = makeSession(3);
      const pipeline = new StreamingSession(session, makePassthroughRenderer(session));
      const composedValues: number[] = [];
      pipeline.on("progress", ({ composed }) => composedValues.push(composed));

      await pipeline.run();

      expect(composedValues).toEqual([1, 2, 3]);
    });

    it("total is always equal to session.frames.length", async () => {
      const session = makeSession(5);
      const pipeline = new StreamingSession(session, makePassthroughRenderer(session));
      const totals = new Set<number>();
      pipeline.on("progress", ({ total }) => totals.add(total));

      await pipeline.run();

      expect([...totals]).toEqual([5]);
    });

    it("pct on the last event is 100", async () => {
      const session = makeSession(5);
      const pipeline = new StreamingSession(session, makePassthroughRenderer(session));
      const pcts: number[] = [];
      pipeline.on("progress", ({ pct }) => pcts.push(pct));

      await pipeline.run();

      expect(pcts[pcts.length - 1]).toBe(100);
    });

    it("pct values are non-decreasing", async () => {
      const session = makeSession(10);
      const pipeline = new StreamingSession(session, makePassthroughRenderer(session));
      const pcts: number[] = [];
      pipeline.on("progress", ({ pct }) => pcts.push(pct));

      await pipeline.run();

      for (let i = 1; i < pcts.length; i++) {
        expect(pcts[i]).toBeGreaterThanOrEqual(pcts[i - 1]);
      }
    });

    it("emits no events for an empty session", async () => {
      const session = makeSession(0);
      const pipeline = new StreamingSession(session, makePassthroughRenderer(session));
      const events: PipelineProgress[] = [];
      pipeline.on("progress", (e) => events.push(e));

      await pipeline.run();

      expect(events).toHaveLength(0);
    });
  });

  describe("run()", () => {
    it("returns a Buffer", async () => {
      const session = makeSession(2);
      const pipeline = new StreamingSession(session, makePassthroughRenderer(session));

      const result = await pipeline.run();

      expect(Buffer.isBuffer(result)).toBe(true);
    });

    it("returns the buffer produced by encodeMp4Stream", async () => {
      const session = makeSession(2);
      const pipeline = new StreamingSession(session, makePassthroughRenderer(session));

      const result = await pipeline.run();

      expect(result.toString()).toBe("fake-mp4-data");
    });

    it("multiple listeners all receive every event", async () => {
      const session = makeSession(3);
      const pipeline = new StreamingSession(session, makePassthroughRenderer(session));
      const a: number[] = [];
      const b: number[] = [];
      pipeline.on("progress", ({ composed }) => a.push(composed));
      pipeline.on("progress", ({ composed }) => b.push(composed));

      await pipeline.run();

      expect(a).toEqual([1, 2, 3]);
      expect(b).toEqual([1, 2, 3]);
    });
  });
});
