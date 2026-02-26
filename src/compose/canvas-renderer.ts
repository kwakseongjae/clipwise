import { Worker } from "worker_threads";
import os from "os";
import { existsSync } from "fs";
import { fileURLToPath } from "url";
import type {
  CapturedFrame,
  ComposedFrame,
  EffectsConfig,
  OutputConfig,
  Step,
} from "../script/types.js";
import { composeFrame, getFrameOffset } from "./compose-frame.js";
import type { FrameContext } from "./compose-frame.js";
import { buildZoomClickLookup, calculateAdaptiveZoomFromLookup } from "../effects/zoom.js";
import { applyCrossfade } from "../effects/transition.js";

export type { FrameContext };

// Minimum frames per worker to justify thread overhead
const MIN_FRAMES_PER_WORKER = 4;

// Resolve worker path once, regardless of which bundle we're running in
let cachedWorkerUrl: URL | null = null;
function getWorkerUrl(): URL {
  if (cachedWorkerUrl) return cachedWorkerUrl;
  const base = import.meta.url;
  // Worker is compiled to dist/compose/frame-worker.js.
  // The bundle can be at dist/cli/index.js, dist/index.js, etc.
  const candidates = [
    new URL("./frame-worker.js", base),           // from dist/compose/
    new URL("../compose/frame-worker.js", base),  // from dist/cli/
    new URL("./compose/frame-worker.js", base),   // from dist/
  ];
  for (const url of candidates) {
    if (existsSync(fileURLToPath(url))) {
      cachedWorkerUrl = url;
      return url;
    }
  }
  cachedWorkerUrl = candidates[1]; // safe fallback
  return cachedWorkerUrl;
}

export class CanvasRenderer {
  private steps: Step[];

  constructor(
    private effects: EffectsConfig,
    private output: OutputConfig,
    steps?: Step[],
  ) {
    this.steps = steps ?? [];
  }

  /**
   * Apply the full effects pipeline to a single frame.
   * Delegates to the standalone composeFrame function.
   */
  async composeFrame(
    frame: CapturedFrame,
    context?: Partial<FrameContext>,
  ): Promise<ComposedFrame> {
    return composeFrame(frame, this.effects, this.output, context);
  }

  /**
   * Process an entire sequence of captured frames through the effects pipeline.
   *
   * Multi-pass approach:
   *   Pass 1: Speed ramping (adjust frame set).
   *   Pass 2: Calculate per-frame contexts (zoom, click, trail).
   *   Pass 3: Render frames in parallel using worker threads.
   *   Pass 4: Apply scene transitions at step boundaries.
   */
  async composeAll(frames: CapturedFrame[]): Promise<ComposedFrame[]> {
    if (frames.length === 0) return [];

    // Pass 1: Apply speed ramping
    let processFrames = frames;
    if (this.effects.speedRamp.enabled) {
      processFrames = this.applySpeedRamp(frames);
    }

    // Pass 2: Calculate per-frame contexts
    const contexts = this.calculateFrameContexts(processFrames);

    // Pass 3: Render — parallel if enough frames and CPUs
    const cpuCount = os.cpus().length;
    const workerCount = Math.min(cpuCount, 8);
    const useWorkers =
      workerCount >= 2 &&
      processFrames.length >= workerCount * MIN_FRAMES_PER_WORKER;

    let composed: ComposedFrame[];
    if (useWorkers) {
      composed = await this.processWithWorkers(processFrames, contexts, workerCount);
    } else {
      composed = [];
      for (let i = 0; i < processFrames.length; i++) {
        composed.push(
          await composeFrame(processFrames[i], this.effects, this.output, contexts[i]),
        );
      }
    }

    // Pass 4: Apply scene transitions at step boundaries
    if (this.steps.length > 0) {
      await this.applyTransitions(composed, processFrames);
    }

    return composed;
  }

  /**
   * Distribute frame composition across a pool of worker threads.
   * Workers process frames concurrently; results are collected in order.
   */
  private processWithWorkers(
    frames: CapturedFrame[],
    contexts: FrameContext[],
    workerCount: number,
  ): Promise<ComposedFrame[]> {
    return new Promise((resolve, reject) => {
      const results: ComposedFrame[] = new Array(frames.length);
      let completed = 0;
      let nextIndex = 0;
      let failed = false;

      const workerUrl = getWorkerUrl();
      const workers: Worker[] = [];

      const dispatch = (worker: Worker): void => {
        if (nextIndex >= frames.length || failed) return;
        const i = nextIndex++;
        worker.postMessage({
          taskId: i,
          frame: frames[i],
          effects: this.effects,
          output: this.output,
          context: contexts[i],
        });
      };

      for (let w = 0; w < workerCount; w++) {
        const worker = new Worker(workerUrl);
        workers.push(worker);

        worker.on("message", (msg: { taskId: number; index: number; timestamp: number; buffer: Buffer; error?: string }) => {
          if (failed) return;

          if (msg.error) {
            failed = true;
            workers.forEach((wk) => wk.terminate());
            reject(new Error(`Worker failed on frame ${msg.taskId}: ${msg.error}`));
            return;
          }

          results[msg.taskId] = {
            index: frames[msg.taskId].index,
            buffer: Buffer.from(msg.buffer),
            timestamp: frames[msg.taskId].timestamp,
          };

          completed++;
          if (completed === frames.length) {
            workers.forEach((wk) => wk.terminate());
            resolve(results);
          } else {
            dispatch(worker);
          }
        });

        worker.on("error", (err) => {
          if (failed) return;
          failed = true;
          workers.forEach((wk) => wk.terminate());
          reject(err);
        });

        dispatch(worker);
      }
    });
  }

  /**
   * Calculate per-frame rendering context (zoom scale, click progress, cursor trail).
   */
  private calculateFrameContexts(frames: CapturedFrame[]): FrameContext[] {
    const contexts: FrameContext[] = [];

    const transitionFrames = Math.round(
      this.output.fps * (this.effects.zoom.duration / 1000),
    );

    // Pre-build click lookup once — O(n) — so each frame uses O(log k) binary search
    // instead of O(transitionFrames) linear scan.  Total: O(n + n·log k) vs O(n·transitionFrames).
    const clickLookup = this.effects.zoom.enabled
      ? buildZoomClickLookup(frames)
      : [];

    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i];

      let zoomScale = 1;
      if (this.effects.zoom.enabled) {
        zoomScale = calculateAdaptiveZoomFromLookup(
          clickLookup,
          i,
          this.effects.zoom.scale,
          transitionFrames,
        );
      }

      const clickProgress =
        frame.clickPosition != null ? (frame.clickProgress ?? 0.5) : null;

      const trailLength = this.effects.cursor.trailLength;
      const trail: Array<{ x: number; y: number }> = [];
      for (let j = Math.max(0, i - trailLength); j <= i; j++) {
        if (frames[j].cursorPosition) {
          trail.push(frames[j].cursorPosition!);
        }
      }

      contexts.push({ zoomScale, clickProgress, cursorTrail: trail });
    }

    return contexts;
  }

  /**
   * Apply speed ramping: slow down near actions, speed up during idle.
   */
  private applySpeedRamp(frames: CapturedFrame[]): CapturedFrame[] {
    const config = this.effects.speedRamp;
    if (!config.enabled) return frames;

    const proximityRadius = Math.round(this.output.fps * 1);
    const actionIndices = new Set<number>();

    for (let i = 0; i < frames.length; i++) {
      if (frames[i].clickPosition) {
        for (
          let j = Math.max(0, i - proximityRadius);
          j <= Math.min(frames.length - 1, i + proximityRadius);
          j++
        ) {
          actionIndices.add(j);
        }
      }
    }

    const result: CapturedFrame[] = [];
    for (let i = 0; i < frames.length; i++) {
      const isAction = actionIndices.has(i);
      if (isAction) {
        const copies = Math.max(1, Math.round(1 / config.actionSpeed));
        for (let c = 0; c < copies; c++) {
          result.push({ ...frames[i], index: result.length });
        }
      } else {
        const skipRate = Math.max(1, Math.round(config.idleSpeed));
        if (i % skipRate === 0) {
          result.push({ ...frames[i], index: result.length });
        }
      }
    }

    return result;
  }

  // ─── Streaming pipeline (Phase 1-B) ────────────────────────────────────────

  /**
   * Stream frame composition — yields ComposedFrames as workers finish,
   * in display order, so the encoder can start before all frames are composed.
   *
   * Same 4-pass structure as composeAll():
   *   Pass 1 & 2 run upfront (need the full frame set).
   *   Pass 3 streams via the worker pool (ordered yield).
   *   Pass 4 transitions are buffered inline and applied at step boundaries.
   */
  async *composeStream(frames: CapturedFrame[]): AsyncGenerator<ComposedFrame> {
    if (frames.length === 0) return;

    // Pass 1: Speed ramp (requires full set)
    let processFrames = frames;
    if (this.effects.speedRamp.enabled) {
      processFrames = this.applySpeedRamp(frames);
    }

    // Pass 2: Context calculation (requires full set)
    const contexts = this.calculateFrameContexts(processFrames);

    // Pre-compute transition windows (so Pass 4 can buffer inline)
    const windows = this.getTransitionWindows(processFrames);

    // Pass 3+4: stream with ordered worker results, transitions applied inline
    const cpuCount = os.cpus().length;
    const workerCount = Math.min(cpuCount, 8);
    const useWorkers =
      workerCount >= 2 &&
      processFrames.length >= workerCount * MIN_FRAMES_PER_WORKER;

    const rawStream = useWorkers
      ? this.streamWithWorkers(processFrames, contexts, workerCount)
      : this.streamSequential(processFrames, contexts);

    yield* this.applyTransitionsToStream(rawStream, windows);
  }

  /**
   * Worker-pool streaming: dispatches frames to workers and yields results
   * in display order as soon as each frame is ready.
   *
   * Uses a notify-on-progress pattern to bridge event-driven workers
   * to an ordered AsyncGenerator without busy-polling.
   */
  private async *streamWithWorkers(
    frames: CapturedFrame[],
    contexts: FrameContext[],
    workerCount: number,
  ): AsyncGenerator<ComposedFrame> {
    const completed = new Array<ComposedFrame | undefined>(frames.length);
    let workerError: Error | null = null;
    let notify: (() => void) | null = null;

    // Resolves whenever any worker completes or errors — wakes the yield loop.
    const waitForProgress = (): Promise<void> =>
      new Promise<void>((r) => { notify = r; });

    const workerUrl = getWorkerUrl();
    const workers: Worker[] = [];
    let nextToDispatch = 0;

    const dispatch = (worker: Worker): void => {
      if (nextToDispatch >= frames.length || workerError) return;
      const i = nextToDispatch++;
      worker.postMessage({
        taskId: i,
        frame: frames[i],
        effects: this.effects,
        output: this.output,
        context: contexts[i],
      });
    };

    for (let w = 0; w < workerCount; w++) {
      const worker = new Worker(workerUrl);
      workers.push(worker);

      worker.on("message", (msg: { taskId: number; buffer: Buffer; error?: string }) => {
        if (workerError) return;
        if (msg.error) {
          workerError = new Error(`Worker failed on frame ${msg.taskId}: ${msg.error}`);
        } else {
          completed[msg.taskId] = {
            index: frames[msg.taskId].index,
            buffer: Buffer.from(msg.buffer),
            timestamp: frames[msg.taskId].timestamp,
          };
          dispatch(worker);
        }
        notify?.();
        notify = null;
      });

      worker.on("error", (err) => {
        workerError = err;
        notify?.();
        notify = null;
      });

      dispatch(worker);
    }

    try {
      for (let i = 0; i < frames.length; i++) {
        // Wait until frame i is ready (other frames may arrive out of order first)
        while (completed[i] === undefined && !workerError) {
          await waitForProgress();
        }
        if (workerError) throw workerError;
        const frame = completed[i]!;
        completed[i] = undefined; // free memory once yielded
        yield frame;
      }
    } finally {
      workers.forEach((w) => w.terminate());
    }
  }

  /**
   * Sequential streaming fallback for small frame counts where worker
   * thread overhead would exceed the parallelism benefit.
   */
  private async *streamSequential(
    frames: CapturedFrame[],
    contexts: FrameContext[],
  ): AsyncGenerator<ComposedFrame> {
    for (let i = 0; i < frames.length; i++) {
      yield await composeFrame(frames[i], this.effects, this.output, contexts[i]);
    }
  }

  /**
   * Pre-compute [startIdx, endIdx] windows for every fade transition so that
   * applyTransitionsToStream can buffer only those frames.
   */
  private getTransitionWindows(
    frames: CapturedFrame[],
  ): Array<{ startIdx: number; endIdx: number }> {
    if (this.steps.length === 0) return [];

    const transitionFrames = Math.max(2, Math.round(this.output.fps * 0.3));
    const windows: Array<{ startIdx: number; endIdx: number }> = [];

    for (let i = 1; i < frames.length; i++) {
      if (
        frames[i].stepIndex !== undefined &&
        frames[i - 1].stepIndex !== undefined &&
        frames[i].stepIndex !== frames[i - 1].stepIndex
      ) {
        const stepIdx = frames[i].stepIndex!;
        const step = this.steps[stepIdx];
        if (step && step.transition === "fade") {
          const startIdx = Math.max(0, i - Math.floor(transitionFrames / 2));
          const endIdx = Math.min(frames.length - 1, i + Math.ceil(transitionFrames / 2));
          if (endIdx - startIdx >= 2) {
            windows.push({ startIdx, endIdx });
          }
        }
      }
    }

    return windows;
  }

  /**
   * Wrap a ComposedFrame stream with inline transition buffering.
   *
   * Non-transition frames are yielded immediately.
   * Frames inside a fade window are held until both endpoints are available,
   * then the crossfade is applied and all window frames are flushed in order.
   * A pending map maintains global display order across window boundaries.
   */
  private async *applyTransitionsToStream(
    source: AsyncGenerator<ComposedFrame>,
    windows: Array<{ startIdx: number; endIdx: number }>,
  ): AsyncGenerator<ComposedFrame> {
    if (windows.length === 0) {
      yield* source;
      return;
    }

    // Map each frame index to which transition window it belongs
    const frameToWindow = new Map<number, number>();
    for (let wi = 0; wi < windows.length; wi++) {
      for (let i = windows[wi].startIdx; i <= windows[wi].endIdx; i++) {
        frameToWindow.set(i, wi);
      }
    }

    // Per-window accumulator
    const windowState = windows.map((w) => ({
      frames: new Array<ComposedFrame>(w.endIdx - w.startIdx + 1),
      received: 0,
    }));

    // Ordered pending buffer — holds frames that arrived before nextToYield
    const pending = new Map<number, ComposedFrame>();
    let nextToYield = 0;
    let frameIdx = 0;

    for await (const frame of source) {
      const idx = frameIdx++;
      const wi = frameToWindow.get(idx);

      if (wi === undefined) {
        // Not in any transition window — stage for ordered yield
        pending.set(idx, frame);
      } else {
        const win = windows[wi];
        const state = windowState[wi];
        state.frames[idx - win.startIdx] = frame;
        state.received++;

        if (state.received === state.frames.length) {
          // Both endpoints ready — apply crossfade to middle frames
          const fromBuf = state.frames[0].buffer;
          const toBuf = state.frames[state.frames.length - 1].buffer;
          const range = state.frames.length - 1;

          for (let j = 1; j < state.frames.length - 1; j++) {
            state.frames[j] = {
              ...state.frames[j],
              buffer: await applyCrossfade(
                fromBuf, toBuf, j / range,
                this.output.width, this.output.height,
              ),
            };
          }

          // Flush the completed window into pending
          for (let j = 0; j < state.frames.length; j++) {
            pending.set(win.startIdx + j, state.frames[j]);
          }
        }
      }

      // Drain all consecutive frames that are now available
      while (pending.has(nextToYield)) {
        yield pending.get(nextToYield)!;
        pending.delete(nextToYield);
        nextToYield++;
      }
    }

    // Final drain (handles any trailing pending frames)
    while (pending.has(nextToYield)) {
      yield pending.get(nextToYield)!;
      pending.delete(nextToYield);
      nextToYield++;
    }
  }

  /**
   * Apply crossfade transitions at step boundaries where configured.
   */
  private async applyTransitions(
    composed: ComposedFrame[],
    frames: CapturedFrame[],
  ): Promise<void> {
    const transitionFrames = Math.max(2, Math.round(this.output.fps * 0.3));

    const boundaries: Array<{ index: number; stepIndex: number }> = [];
    for (let i = 1; i < frames.length; i++) {
      if (
        frames[i].stepIndex !== undefined &&
        frames[i - 1].stepIndex !== undefined &&
        frames[i].stepIndex !== frames[i - 1].stepIndex
      ) {
        const stepIdx = frames[i].stepIndex!;
        const step = this.steps[stepIdx];
        if (step && step.transition === "fade") {
          boundaries.push({ index: i, stepIndex: stepIdx });
        }
      }
    }

    for (const boundary of boundaries) {
      const startIdx = Math.max(0, boundary.index - Math.floor(transitionFrames / 2));
      const endIdx = Math.min(composed.length - 1, boundary.index + Math.ceil(transitionFrames / 2));
      const range = endIdx - startIdx;
      if (range < 2) continue;

      const fromBuffer = composed[startIdx].buffer;
      const toBuffer = composed[endIdx].buffer;

      for (let i = startIdx + 1; i < endIdx; i++) {
        const progress = (i - startIdx) / range;
        composed[i].buffer = await applyCrossfade(
          fromBuffer,
          toBuffer,
          progress,
          this.output.width,
          this.output.height,
        );
      }
    }
  }
}

// Re-export for backwards compatibility
export { getFrameOffset };
