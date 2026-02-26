import { EventEmitter } from "events";
import type { RecordingSession, ComposedFrame } from "../script/types.js";
import type { CanvasRenderer } from "./canvas-renderer.js";
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
