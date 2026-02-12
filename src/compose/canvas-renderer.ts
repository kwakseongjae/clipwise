import sharp from "sharp";
import type {
  CapturedFrame,
  ComposedFrame,
  EffectsConfig,
  OutputConfig,
  Step,
} from "../script/types.js";
import { applyDeviceFrame } from "../effects/frame.js";
import {
  renderCursor,
  renderClickEffect,
  renderCursorTrail,
  renderCursorHighlight,
} from "../effects/cursor.js";
import { applyZoom, calculateAdaptiveZoom } from "../effects/zoom.js";
import { applyBackground } from "../effects/background.js";
import { renderKeystrokeHud } from "../effects/keystroke.js";
import { applyCrossfade } from "../effects/transition.js";
import { renderWatermark } from "../effects/watermark.js";

/**
 * Return the pixel offset that a device frame adds to the top-left of the
 * screenshot content.  Zoom focus points are in viewport coordinates and need
 * to be shifted by these amounts after the device frame is composited.
 */
function getFrameOffset(config: EffectsConfig["deviceFrame"]): { left: number; top: number } {
  if (!config.enabled) return { left: 0, top: 0 };

  switch (config.type) {
    case "browser":
      return { left: 0, top: 40 };
    case "iphone":
      return { left: 12, top: 50 };
    case "ipad":
      return { left: 20, top: 24 };
    case "android":
      return { left: 8, top: 32 };
    default:
      return { left: 0, top: 0 };
  }
}

export interface FrameContext {
  zoomScale: number;
  clickProgress: number | null;
  cursorTrail: Array<{ x: number; y: number }>;
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
   * Apply the full effects pipeline to a single captured frame.
   *
   * Pipeline order:
   *  1. Device frame (browser chrome / mobile mockup)
   *  2. Cursor highlight (Screen Studio glow)
   *  3. Cursor trail
   *  4. Cursor rendering
   *  5. Click ripple effect (animated progress)
   *  6. Keystroke HUD
   *  7. Zoom (adaptive, cursor-following)
   *  8. Background (padding, gradient, rounded corners)
   *  9. Watermark overlay
   *  10. Final resize
   */
  async composeFrame(
    frame: CapturedFrame,
    context?: Partial<FrameContext>,
  ): Promise<ComposedFrame> {
    let buffer = frame.screenshot;
    let width = frame.viewport.width;
    let height = frame.viewport.height;

    const ctx: FrameContext = {
      zoomScale: context?.zoomScale ?? 1,
      clickProgress: context?.clickProgress ?? null,
      cursorTrail: context?.cursorTrail ?? [],
    };

    // 1. Device frame
    if (this.effects.deviceFrame.enabled) {
      buffer = await applyDeviceFrame(
        buffer,
        this.effects.deviceFrame,
        width,
        height,
      );
      const meta = await sharp(buffer).metadata();
      width = meta.width ?? width;
      height = meta.height ?? height;
    }

    // 2. Cursor highlight (Screen Studio style glow)
    if (
      this.effects.cursor.enabled &&
      this.effects.cursor.highlight &&
      frame.cursorPosition
    ) {
      buffer = await renderCursorHighlight(
        buffer,
        frame.cursorPosition,
        this.effects.cursor,
        width,
        height,
      );
    }

    // 3. Cursor trail
    if (
      this.effects.cursor.enabled &&
      this.effects.cursor.trail &&
      ctx.cursorTrail.length >= 2
    ) {
      buffer = await renderCursorTrail(
        buffer,
        ctx.cursorTrail,
        this.effects.cursor,
        width,
        height,
      );
    }

    // 4. Cursor rendering
    if (this.effects.cursor.enabled && frame.cursorPosition) {
      buffer = await renderCursor(
        buffer,
        frame.cursorPosition,
        this.effects.cursor,
        width,
        height,
      );
    }

    // 5. Click ripple effect
    if (
      this.effects.cursor.enabled &&
      this.effects.cursor.clickEffect &&
      frame.clickPosition
    ) {
      const progress =
        ctx.clickProgress ?? frame.clickProgress ?? 0.5;
      buffer = await renderClickEffect(
        buffer,
        frame.clickPosition,
        this.effects.cursor,
        progress,
        width,
        height,
      );
    }

    // 6. Keystroke HUD
    if (this.effects.keystroke.enabled && frame.keystrokes) {
      buffer = await renderKeystrokeHud(
        buffer,
        frame.keystrokes,
        frame.timestamp,
        this.effects.keystroke,
        width,
        height,
      );
    }

    // 7. Zoom (adaptive, follows cursor)
    const scale = ctx.zoomScale;
    if (this.effects.zoom.enabled && scale > 1) {
      const rawFocus = frame.clickPosition ??
        frame.cursorPosition ?? { x: width / 2, y: height / 2 };
      const offset = getFrameOffset(this.effects.deviceFrame);
      const focusPoint = {
        x: rawFocus.x + offset.left,
        y: rawFocus.y + offset.top,
      };
      buffer = await applyZoom(buffer, focusPoint, scale, width, height);
    }

    // 8. Background
    buffer = await applyBackground(
      buffer,
      this.effects.background,
      this.output.width,
      this.output.height,
    );

    // 9. Watermark overlay
    if (this.effects.watermark.enabled) {
      buffer = await renderWatermark(
        buffer,
        this.effects.watermark,
        this.output.width,
        this.output.height,
      );
    }

    // 10. Final resize (ensure exact output dimensions)
    buffer = await sharp(buffer)
      .resize(this.output.width, this.output.height, { fit: "fill" })
      .png()
      .toBuffer();

    return {
      index: frame.index,
      buffer,
      timestamp: frame.timestamp,
    };
  }

  /**
   * Process an entire sequence of captured frames through the effects pipeline.
   *
   * Multi-pass approach:
   *   Pass 1: Speed ramping (adjust frame set).
   *   Pass 2: Calculate per-frame contexts (zoom, click, trail).
   *   Pass 3: Render each frame with effects.
   *   Pass 4: Apply scene transitions at step boundaries.
   */
  async composeAll(frames: CapturedFrame[]): Promise<ComposedFrame[]> {
    if (frames.length === 0) return [];

    // Pass 1: Apply speed ramping (adjust frame set)
    let processFrames = frames;
    if (this.effects.speedRamp.enabled) {
      processFrames = this.applySpeedRamp(frames);
    }

    // Pass 2: Calculate per-frame contexts
    const contexts = this.calculateFrameContexts(processFrames);

    // Pass 3: Render
    const composed: ComposedFrame[] = [];
    for (let i = 0; i < processFrames.length; i++) {
      const result = await this.composeFrame(processFrames[i], contexts[i]);
      composed.push(result);
    }

    // Pass 4: Apply scene transitions at step boundaries
    if (this.steps.length > 0) {
      await this.applyTransitions(composed, processFrames);
    }

    return composed;
  }

  /**
   * Calculate per-frame rendering context (zoom, click progress, cursor trail, tilt).
   */
  private calculateFrameContexts(frames: CapturedFrame[]): FrameContext[] {
    const contexts: FrameContext[] = [];

    // Calculate transition frames from duration and FPS
    const transitionFrames = Math.round(
      this.output.fps * (this.effects.zoom.duration / 1000),
    );

    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i];

      // Adaptive zoom based on proximity to click events
      let zoomScale = 1;
      if (this.effects.zoom.enabled) {
        zoomScale = calculateAdaptiveZoom(
          frames,
          i,
          this.effects.zoom.scale,
          transitionFrames,
        );
      }

      // Click progress from frame metadata (set by recorder)
      const clickProgress =
        frame.clickPosition != null
          ? (frame.clickProgress ?? 0.5)
          : null;

      // Cursor trail: last N cursor positions
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
   * Returns a new frame array with frames duplicated or skipped.
   */
  private applySpeedRamp(frames: CapturedFrame[]): CapturedFrame[] {
    const config = this.effects.speedRamp;
    if (!config.enabled) return frames;

    // Determine action proximity radius (in frames)
    const proximityRadius = Math.round(this.output.fps * 1);

    // Tag frames near click events as "action" frames
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
        // Slow down: duplicate frame based on actionSpeed
        const copies = Math.max(1, Math.round(1 / config.actionSpeed));
        for (let c = 0; c < copies; c++) {
          result.push({ ...frames[i], index: result.length });
        }
      } else {
        // Speed up: keep every Nth idle frame
        const skipRate = Math.max(1, Math.round(config.idleSpeed));
        if (i % skipRate === 0) {
          result.push({ ...frames[i], index: result.length });
        }
      }
    }

    return result;
  }

  /**
   * Apply crossfade transitions at step boundaries where configured.
   * Modifies the composed array in-place.
   */
  private async applyTransitions(
    composed: ComposedFrame[],
    frames: CapturedFrame[],
  ): Promise<void> {
    // Number of frames for the transition blend
    const transitionFrames = Math.max(2, Math.round(this.output.fps * 0.3));

    // Find step boundaries: indices where stepIndex changes
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

    // Apply crossfade at each boundary
    for (const boundary of boundaries) {
      const startIdx = Math.max(0, boundary.index - Math.floor(transitionFrames / 2));
      const endIdx = Math.min(composed.length - 1, boundary.index + Math.ceil(transitionFrames / 2));
      const range = endIdx - startIdx;
      if (range < 2) continue;

      const fromBuffer = composed[startIdx].buffer;
      const toBuffer = composed[endIdx].buffer;

      const width = this.output.width;
      const height = this.output.height;

      for (let i = startIdx + 1; i < endIdx; i++) {
        const progress = (i - startIdx) / range;
        composed[i].buffer = await applyCrossfade(
          fromBuffer,
          toBuffer,
          progress,
          width,
          height,
        );
      }
    }
  }
}
