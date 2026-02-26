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

import { StreamingSession, ConcurrentSession } from "../src/compose/streaming-session.js";
import type { PipelineProgress, ConcurrentResult } from "../src/compose/streaming-session.js";
import type { RecordingSession, CapturedFrame, ComposedFrame, RecordingHandle } from "../src/script/types.js";
import type { CanvasRenderer } from "../src/compose/canvas-renderer.js";
import type { ClipwiseRecorder } from "../src/core/recorder.js";
import type { Scenario } from "../src/script/types.js";

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

/**
 * Renderer for ConcurrentSession: implements composeStreamOnline() by draining
 * the source async iterable and passing frames through unchanged.
 */
function makeOnlineRenderer(): CanvasRenderer {
  return {
    async *composeStreamOnline(source: AsyncIterable<CapturedFrame>): AsyncGenerator<ComposedFrame> {
      for await (const f of source) {
        yield { index: f.index, buffer: f.screenshot, timestamp: f.timestamp };
      }
    },
  } as unknown as CanvasRenderer;
}

/**
 * Fake ClipwiseRecorder that returns `frameCount` frames from recordToChannel()
 * without launching a real browser.
 */
function makeRecorder(frameCount: number, session?: RecordingSession): ClipwiseRecorder {
  const frames: CapturedFrame[] = Array.from({ length: frameCount }, (_, i) => ({
    index: i,
    screenshot: Buffer.alloc(4, i),
    timestamp: i * 33,
    cursorPosition: null,
    clickPosition: null,
    viewport: { width: 100, height: 100 },
  }));

  const defaultSession: RecordingSession = session ?? {
    scenario: { output: { format: "mp4", width: 100, height: 100, fps: 30, quality: 80, outputDir: "./output", filename: "test" } } as Scenario,
    frames,
    startTime: Date.now(),
  };

  return {
    recordToChannel(_scenario: Scenario): RecordingHandle {
      async function* frameStream(): AsyncGenerator<CapturedFrame> {
        for (const f of frames) yield f;
      }
      return {
        frameStream: frameStream(),
        done: Promise.resolve(defaultSession),
      };
    },
  } as unknown as ClipwiseRecorder;
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

// ─── ConcurrentSession ────────────────────────────────────────────────────────

describe("ConcurrentSession", () => {
  describe("run()", () => {
    it("returns an object with buffer and session", async () => {
      const recorder = makeRecorder(3);
      const renderer = makeOnlineRenderer();
      const pipeline = new ConcurrentSession(recorder, {} as Scenario, renderer);

      const result = await pipeline.run();

      expect(result).toHaveProperty("buffer");
      expect(result).toHaveProperty("session");
      expect(Buffer.isBuffer(result.buffer)).toBe(true);
    });

    it("buffer is the mock MP4 data from encodeMp4Stream", async () => {
      const recorder = makeRecorder(2);
      const renderer = makeOnlineRenderer();
      const pipeline = new ConcurrentSession(recorder, {} as Scenario, renderer);

      const { buffer } = await pipeline.run();

      expect(buffer.toString()).toBe("fake-mp4-data");
    });

    it("session is the RecordingSession from recorder.done", async () => {
      const fakeSession = makeSession(4);
      const recorder = makeRecorder(4, fakeSession);
      const renderer = makeOnlineRenderer();
      const pipeline = new ConcurrentSession(recorder, {} as Scenario, renderer);

      const { session } = await pipeline.run();

      expect(session).toBe(fakeSession);
    });

    it("works with zero frames", async () => {
      const recorder = makeRecorder(0);
      const renderer = makeOnlineRenderer();
      const pipeline = new ConcurrentSession(recorder, {} as Scenario, renderer);

      const result = await pipeline.run();

      expect(Buffer.isBuffer(result.buffer)).toBe(true);
    });
  });

  describe("progress events", () => {
    it("emits in-flight events with total=-1 and pct=-1", async () => {
      const recorder = makeRecorder(3);
      const renderer = makeOnlineRenderer();
      const pipeline = new ConcurrentSession(recorder, {} as Scenario, renderer);
      const events: PipelineProgress[] = [];
      pipeline.on("progress", (e) => events.push(e));

      await pipeline.run();

      // All mid-stream events should have total=-1, pct=-1
      const midEvents = events.slice(0, -1);
      for (const e of midEvents) {
        expect(e.total).toBe(-1);
        expect(e.pct).toBe(-1);
      }
    });

    it("final event has pct=100 and total=composed", async () => {
      const recorder = makeRecorder(3);
      const renderer = makeOnlineRenderer();
      const pipeline = new ConcurrentSession(recorder, {} as Scenario, renderer);
      const events: PipelineProgress[] = [];
      pipeline.on("progress", (e) => events.push(e));

      await pipeline.run();

      const last = events[events.length - 1];
      expect(last.pct).toBe(100);
      expect(last.total).toBe(last.composed);
    });

    it("emits exactly frameCount+1 events (one per frame + final)", async () => {
      const recorder = makeRecorder(5);
      const renderer = makeOnlineRenderer();
      const pipeline = new ConcurrentSession(recorder, {} as Scenario, renderer);
      const events: PipelineProgress[] = [];
      pipeline.on("progress", (e) => events.push(e));

      await pipeline.run();

      // 5 per-frame events + 1 final = 6
      expect(events).toHaveLength(6);
    });

    it("composed increments 1..N across mid-stream events", async () => {
      const recorder = makeRecorder(4);
      const renderer = makeOnlineRenderer();
      const pipeline = new ConcurrentSession(recorder, {} as Scenario, renderer);
      const composedValues: number[] = [];
      pipeline.on("progress", ({ composed }) => composedValues.push(composed));

      await pipeline.run();

      // First 4 events increment 1..4, last event has composed=4 again
      expect(composedValues.slice(0, 4)).toEqual([1, 2, 3, 4]);
    });

    it("multiple listeners all receive all events", async () => {
      const recorder = makeRecorder(2);
      const renderer = makeOnlineRenderer();
      const pipeline = new ConcurrentSession(recorder, {} as Scenario, renderer);
      const a: number[] = [];
      const b: number[] = [];
      pipeline.on("progress", ({ pct }) => a.push(pct));
      pipeline.on("progress", ({ pct }) => b.push(pct));

      await pipeline.run();

      expect(a).toEqual(b);
      expect(a.length).toBeGreaterThan(0);
    });
  });
});
