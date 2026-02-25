import sharp from "sharp";
import type {
  CapturedFrame,
  ComposedFrame,
  EffectsConfig,
  OutputConfig,
} from "../script/types.js";
import { applyDeviceFrame } from "../effects/frame.js";
import {
  renderCursor,
  renderClickEffect,
  renderCursorTrail,
  renderCursorHighlight,
} from "../effects/cursor.js";
import { applyZoom } from "../effects/zoom.js";
import { applyBackground } from "../effects/background.js";
import { renderKeystrokeHud } from "../effects/keystroke.js";
import { renderWatermark } from "../effects/watermark.js";

export interface FrameContext {
  zoomScale: number;
  clickProgress: number | null;
  cursorTrail: Array<{ x: number; y: number }>;
}

/**
 * Return the pixel offset that a device frame adds to the top-left of the
 * screenshot content. Zoom focus points are in viewport coordinates and need
 * to be shifted by these amounts after the device frame is composited.
 * Offsets are scaled by dpr for HiDPI captures.
 */
export function getFrameOffset(
  config: EffectsConfig["deviceFrame"],
  dpr = 1,
): { left: number; top: number } {
  if (!config.enabled) return { left: 0, top: 0 };

  switch (config.type) {
    case "browser":
      return { left: 0, top: 40 * dpr };
    case "iphone":
      return { left: 12 * dpr, top: 50 * dpr };
    case "ipad":
      return { left: 20 * dpr, top: 24 * dpr };
    case "android":
      return { left: 8 * dpr, top: 32 * dpr };
    default:
      return { left: 0, top: 0 };
  }
}

/**
 * Apply the full effects pipeline to a single captured frame.
 * This is a standalone function so it can be called from worker threads.
 *
 * Pipeline order:
 *  1. Device frame (browser chrome / mobile mockup)
 *  2. Cursor highlight (Screen Studio glow)
 *  3. Cursor trail
 *  4. Cursor rendering
 *  5. Click ripple effect
 *  6. Keystroke HUD
 *  7. Zoom (adaptive, cursor-following)
 *  8. Background (padding, gradient, rounded corners)
 *  9. Watermark overlay
 *  10. Final resize
 */
export async function composeFrame(
  frame: CapturedFrame,
  effects: EffectsConfig,
  output: OutputConfig,
  context?: Partial<FrameContext>,
): Promise<ComposedFrame> {
  let buffer = frame.screenshot;
  // Read actual buffer dimensions — headless Chrome CDP screencasts ignore
  // deviceScaleFactor and always capture at viewport (CSS pixel) resolution.
  // Computing from metadata is the only reliable source of truth.
  const meta = await sharp(buffer).metadata();
  let width = meta.width ?? frame.viewport.width;
  let height = meta.height ?? frame.viewport.height;
  // Compute actual dpr from the real buffer vs CSS viewport dimensions.
  // If headless captures at 1× (always the case today), actualDpr=1 and
  // all position/size scaling is a no-op. If a future Playwright/Chrome
  // version captures at 2×, this will automatically use dpr=2.
  const dpr = Math.round(width / frame.viewport.width);

  const ctx: FrameContext = {
    zoomScale: context?.zoomScale ?? 1,
    clickProgress: context?.clickProgress ?? null,
    cursorTrail: context?.cursorTrail ?? [],
  };

  // 1. Device frame (SVG constants are scaled by dpr internally)
  if (effects.deviceFrame.enabled) {
    buffer = await applyDeviceFrame(buffer, effects.deviceFrame, width, height, dpr);
    const meta = await sharp(buffer).metadata();
    width = meta.width ?? width;
    height = meta.height ?? height;
  }

  // 2. Cursor highlight (position scaled to physical pixels by dpr)
  if (effects.cursor.enabled && effects.cursor.highlight && frame.cursorPosition) {
    buffer = await renderCursorHighlight(
      buffer, frame.cursorPosition, effects.cursor, width, height, dpr,
    );
  }

  // 3. Cursor trail (positions scaled to physical pixels by dpr)
  if (effects.cursor.enabled && effects.cursor.trail && ctx.cursorTrail.length >= 2) {
    buffer = await renderCursorTrail(
      buffer, ctx.cursorTrail, effects.cursor, width, height, dpr,
    );
  }

  // 4. Cursor rendering (position scaled to physical pixels by dpr)
  if (effects.cursor.enabled && frame.cursorPosition) {
    buffer = await renderCursor(
      buffer, frame.cursorPosition, effects.cursor, width, height, dpr,
    );
  }

  // 5. Click ripple effect (position scaled to physical pixels by dpr)
  if (effects.cursor.enabled && effects.cursor.clickEffect && frame.clickPosition) {
    const progress = ctx.clickProgress ?? frame.clickProgress ?? 0.5;
    buffer = await renderClickEffect(
      buffer, frame.clickPosition, effects.cursor, progress, width, height, dpr,
    );
  }

  // 6. Keystroke HUD (font/positions scaled by dpr)
  if (effects.keystroke.enabled && frame.keystrokes) {
    buffer = await renderKeystrokeHud(
      buffer, frame.keystrokes, frame.timestamp, effects.keystroke, width, height, dpr,
    );
  }

  // 7. Zoom (adaptive, follows cursor)
  // With dpr=2, the source buffer is 2x resolution → zoom crops from 2x more pixels
  // for dramatically sharper output after downscaling to output dimensions.
  const scale = ctx.zoomScale;
  if (effects.zoom.enabled && scale > 1) {
    // Focus point: convert CSS pixel coords to physical pixel coords
    const rawFocus = frame.clickPosition ??
      frame.cursorPosition ?? { x: frame.viewport.width / 2, y: frame.viewport.height / 2 };
    const offset = getFrameOffset(effects.deviceFrame, dpr);
    const focusPoint = {
      x: rawFocus.x * dpr + offset.left,
      y: rawFocus.y * dpr + offset.top,
    };
    buffer = await applyZoom(buffer, focusPoint, scale, width, height);
  }

  // 8. Background
  buffer = await applyBackground(buffer, effects.background, output.width, output.height);

  // 9. Watermark overlay
  if (effects.watermark.enabled) {
    buffer = await renderWatermark(buffer, effects.watermark, output.width, output.height);
  }

  // 10. Final resize (ensure exact output dimensions)
  buffer = await sharp(buffer)
    .resize(output.width, output.height, {
      fit: "fill",
      kernel: sharp.kernel.lanczos3,
    })
    .png()
    .toBuffer();

  return { index: frame.index, buffer, timestamp: frame.timestamp };
}
