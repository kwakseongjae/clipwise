/**
 * Worker thread for parallel frame composition.
 * Each worker processes one frame at a time through the effects pipeline.
 */
import { parentPort } from "worker_threads";
import { composeFrame } from "./compose-frame.js";
import type { CapturedFrame, EffectsConfig, OutputConfig } from "../script/types.js";
import type { FrameContext } from "./compose-frame.js";

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
  error?: string;
}

parentPort!.on("message", async (msg: WorkerTask) => {
  try {
    const { taskId, frame, effects, output, context } = msg;

    // Reconstruct Buffer from the plain object received via structured clone
    const frameWithBuffer: CapturedFrame = {
      ...frame,
      screenshot: Buffer.from(frame.screenshot),
    };

    const result = await composeFrame(frameWithBuffer, effects, output, context);

    const reply: WorkerResult = {
      taskId,
      index: result.index,
      timestamp: result.timestamp,
      buffer: result.buffer,
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
