import { EventEmitter } from "events";
import type { Scenario, RecordingSession, ComposedFrame } from "../script/types.js";
import type { CanvasRenderer } from "./canvas-renderer.js";
import type { ClipwiseRecorder } from "../core/recorder.js";
import { encodeMp4Stream } from "./video-encoder.js";

/**
 * Emitted by StreamingSession after each frame is composed.
 */
export interface PipelineProgress {
  /** Number of frames composed so far */
  composed: number;
  /** Total frames in the session */
  total: number;
  /** Completion percentage (0–100) */
  pct: number;
}

export interface ConcurrentResult {
  /** Fully-encoded MP4 buffer. */
  buffer: Buffer;
  /** Full RecordingSession (FPS-resampled) returned when recording completed. */
  session: RecordingSession;
}

/**
 * ConcurrentSession overlaps recording and composition in the same process.
 *
 * While the recorder captures CDP screencast frames, the compositor begins
 * applying effects immediately — each frame is dispatched to the worker pool
 * as soon as its zoom lookahead window is satisfied.
 *
 * Total wall-clock time ≈ max(recordingMs, composeMs) instead of the sum.
 * Requires renderer.canStreamOnline() === true (speedRamp must be disabled).
 *
 * Emits 'progress' after each composed frame.
 * During recording the total is unknown (pct = -1); after recording ends and
 * composition finishes, a final event with pct = 100 is emitted.
 *
 * Usage:
 *   const pipeline = new ConcurrentSession(recorder, scenario, renderer);
 *   pipeline.on("progress", ({ composed, total, pct }) => {
 *     spinner.text = total > 0
 *       ? `Processing... ${composed}/${total} (${pct}%)`
 *       : `Recording & composing... ${composed} frames`;
 *   });
 *   const { buffer, session } = await pipeline.run();
 */
export class ConcurrentSession extends EventEmitter {
  constructor(
    private readonly recorder: ClipwiseRecorder,
    private readonly scenario: Scenario,
    private readonly renderer: CanvasRenderer,
  ) {
    super();
  }

  /**
   * Start recording and compositing concurrently.
   * Returns when both recording and encoding are complete.
   */
  async run(): Promise<ConcurrentResult> {
    const handle = this.recorder.recordToChannel(this.scenario);
    let composed = 0;

    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;

    // Pipe: frameStream → composeStreamOnline → encodeMp4Stream
    // All three stages run concurrently.
    const buffer = await encodeMp4Stream(
      (async function* (): AsyncGenerator<ComposedFrame> {
        for await (const frame of self.renderer.composeStreamOnline(handle.frameStream)) {
          composed++;
          // total unknown during recording — signal with -1
          self.emit("progress", { composed, total: -1, pct: -1 } as PipelineProgress);
          yield frame;
        }
      })(),
      this.scenario.output,
    );

    // Wait for recording to fully complete (always resolves before encoding
    // ends since composition takes longer than recording in practice)
    const session = await handle.done;

    this.emit("progress", { composed, total: composed, pct: 100 } as PipelineProgress);

    return { buffer, session };
  }
}

/**
 * StreamingSession bridges a recorded session to the compose+encode streaming
 * pipeline and emits fine-grained progress events.
 *
 * Emits:
 *   'progress' — after each frame is composed, with a PipelineProgress payload
 *
 * Usage:
 *   const pipeline = new StreamingSession(session, renderer);
 *   pipeline.on("progress", ({ composed, total, pct }) => {
 *     spinner.text = `Composing & encoding... ${composed}/${total} (${pct}%)`;
 *   });
 *   const mp4Buffer = await pipeline.run();
 */
export class StreamingSession extends EventEmitter {
  constructor(
    private readonly session: RecordingSession,
    private readonly renderer: CanvasRenderer,
  ) {
    super();
  }

  /** Total frames in the underlying recording session. */
  get totalFrames(): number {
    return this.session.frames.length;
  }

  /**
   * Run the compose → encode pipeline.
   *
   * Composes frames via the worker pool (Phase 1-B streaming, ordered yield),
   * forwarding each to FFmpeg as it completes.  Emits a 'progress' event after
   * every composed frame so callers can update a spinner or progress bar.
   *
   * @returns The fully-encoded MP4 as a Buffer.
   */
  async run(): Promise<Buffer> {
    const { frames, scenario } = this.session;
    const total = frames.length;
    let composed = 0;

    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;

    return encodeMp4Stream(
      (async function* (): AsyncGenerator<ComposedFrame> {
        for await (const frame of self.renderer.composeStream(frames)) {
          composed++;
          const pct = total > 0 ? Math.round((composed / total) * 100) : 100;
          self.emit("progress", { composed, total, pct } as PipelineProgress);
          yield frame;
        }
      })(),
      scenario.output,
    );
  }
}
