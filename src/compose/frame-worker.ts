/**
 * Worker thread for parallel frame composition.
 * Each worker processes one frame at a time through the effects pipeline.
 */
import { parentPort } from "worker_threads";
import sharp from "sharp";
import { composeFrame, buildStaticLayers } from "./compose-frame.js";
import type { StaticLayers } from "./compose-frame.js";
import type { CapturedFrame, EffectsConfig, OutputConfig } from "../script/types.js";
import type { FrameContext } from "./compose-frame.js";

// Prevent libvips from spawning extra threads inside each worker.
// Without this, 8 workers × N libvips threads = severe oversubscription on
// CPU-bound zlib compression.  Pool-level parallelism (8 workers) is enough.
sharp.concurrency(1);

interface WorkerTask {
  taskId: number;
  frame: CapturedFrame;
  effects: EffectsConfig;
  output: OutputConfig;
  context: Partial<FrameContext>;
}

interface WorkerResult {
  taskId: number;
  index: number;
  timestamp: number;
  buffer: Buffer;
  rawInfo?: { width: number; height: number; channels: 4 };
  error?: string;
}

// Lazily computed once per worker on the first frame.
// Subsequent frames skip background SVG, shadow SVG, and watermark generation.
let cachedStaticLayers: StaticLayers | null = null;
let cachedEffectsKey = "";

parentPort!.on("message", async (msg: WorkerTask) => {
  try {
    const { taskId, frame, effects, output, context } = msg;

    // Reconstruct Buffer from the plain object received via structured clone
    const frameWithBuffer: CapturedFrame = {
      ...frame,
      screenshot: Buffer.from(frame.screenshot),
    };

    // Build static layers once per worker (viewport/effects combo).
    // Use a simple key so layers are rebuilt if effects change (rare in practice).
    const effectsKey = `${output.width}x${output.height}`;
    if (!cachedStaticLayers || cachedEffectsKey !== effectsKey) {
      // Compute dpr only on cache miss (first frame per worker).
      const meta = await sharp(frameWithBuffer.screenshot).metadata();
      const dpr = Math.round((meta.width ?? frame.viewport.width) / frame.viewport.width) || 1;
      cachedStaticLayers = await buildStaticLayers(
        effects,
        output,
        frame.viewport.width,
        dpr,
      );
      cachedEffectsKey = effectsKey;
    }

    const result = await composeFrame(frameWithBuffer, effects, output, {
      ...context,
      staticLayers: cachedStaticLayers,
    });

    const reply: WorkerResult = {
      taskId,
      index: result.index,
      timestamp: result.timestamp,
      buffer: result.buffer,
      rawInfo: result.rawInfo,
    };
    parentPort!.postMessage(reply);
  } catch (err) {
    const reply: WorkerResult = {
      taskId: msg.taskId,
      index: msg.frame.index,
      timestamp: msg.frame.timestamp,
      buffer: Buffer.alloc(0),
      error: err instanceof Error ? err.message : String(err),
    };
    parentPort!.postMessage(reply);
  }
});
