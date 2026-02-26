import sharp from "sharp";
import type {
  CapturedFrame,
  ComposedFrame,
  EffectsConfig,
  OutputConfig,
} from "../script/types.js";
import { applyDeviceFrame, buildBrowserChromeBuffer, TITLE_BAR_HEIGHT } from "../effects/frame.js";
import {
  renderCursor,
  renderClickEffect,
  renderCursorTrail,
  renderCursorHighlight,
} from "../effects/cursor.js";
import { applyZoom } from "../effects/zoom.js";
import { applyBackground, buildBackdropBuffer } from "../effects/background.js";
import { renderKeystrokeHud } from "../effects/keystroke.js";
import { renderWatermark, buildWatermarkSvg } from "../effects/watermark.js";

// ─── Static Layer Cache ──────────────────────────────────────────────────────

/**
 * Pre-computed static layers that are identical for every frame in a session.
 *
 * backdropRaw: background gradient + shadow + watermark composited together at
 *   output dimensions, stored as raw RGBA.  Workers composite the per-frame
 *   screenshot onto this buffer instead of re-generating the background SVG
 *   and shadow SVG on every frame — eliminating ~3 PNG encode/decode cycles.
 *
 * browserChromePng: pre-rasterized browser chrome bar PNG.  Applied via
 *   Sharp's .extend() + .composite() in a single pipeline pass instead of the
 *   current two-pass create-blank-canvas + composite pattern.
 *
 * Both are computed once per worker (first frame), then cached in memory for
 * all subsequent frames handled by that worker.
 */
export interface StaticLayers {
  backdropRaw: Buffer;
  backdropWidth: number;
  backdropHeight: number;
  /** Pre-rasterized browser chrome bar PNG.  Null when device frame is disabled or not "browser". */
  browserChromePng: Buffer | null;
  /** Pixel height of the chrome bar (0 when browserChromePng is null). */
  browserChromeHeight: number;
}

/**
 * Build static layers once per render session (called from each worker on its
 * first task).  Accepts the viewport dimensions from the first captured frame.
 */
export async function buildStaticLayers(
  effects: EffectsConfig,
  output: OutputConfig,
  viewportWidth: number,
  dpr: number,
): Promise<StaticLayers> {
  // Bake watermark SVG into the backdrop so renderWatermark() can be skipped per-frame.
  const wmSvg = buildWatermarkSvg(effects.watermark, output.width, output.height);
  const extraOverlays = wmSvg ? [Buffer.from(wmSvg)] : [];

  const { data, width, height } = await buildBackdropBuffer(
    effects.background,
    output.width,
    output.height,
    extraOverlays,
  );

  let browserChromePng: Buffer | null = null;
  let browserChromeHeight = 0;
  if (effects.deviceFrame.enabled && effects.deviceFrame.type === "browser") {
    browserChromeHeight = TITLE_BAR_HEIGHT * dpr;
    browserChromePng = await buildBrowserChromeBuffer(
      viewportWidth,
      effects.deviceFrame.darkMode,
      dpr,
    );
  }

  return {
    backdropRaw: data,
    backdropWidth: width,
    backdropHeight: height,
    browserChromePng,
    browserChromeHeight,
  };
}

export interface FrameContext {
  zoomScale: number;
  clickProgress: number | null;
  cursorTrail: Array<{ x: number; y: number }>;
  /** When present, skip redundant per-frame SVG generation for background/watermark/device-frame. */
  staticLayers?: StaticLayers;
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
    const sl = ctx.staticLayers;
    if (sl?.browserChromePng && effects.deviceFrame.type === "browser") {
      // Fast path: pre-rasterized chrome bar — one Sharp call (extend + composite)
      // instead of two (create blank canvas + composite).
      buffer = await sharp(buffer)
        .extend({
          top: sl.browserChromeHeight,
          bottom: 0,
          left: 0,
          right: 0,
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .composite([{ input: sl.browserChromePng, left: 0, top: 0 }])
        .png()
        .toBuffer();
    } else {
      buffer = await applyDeviceFrame(buffer, effects.deviceFrame, width, height, dpr);
    }
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
  const sl = ctx.staticLayers;
  if (sl) {
    // Fast path: composite the zoomed frame onto the pre-built backdrop (raw RGBA).
    // Eliminates per-frame background SVG + shadow SVG generation and 1 PNG encode.
    const padding = effects.background.padding;
    const contentWidth = output.width - padding * 2;
    const contentHeight = output.height - padding * 2;

    if (contentWidth > 0 && contentHeight > 0) {
      const radius = effects.background.borderRadius;
      const roundedMask = Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${contentWidth}" height="${contentHeight}">
          <rect width="${contentWidth}" height="${contentHeight}" rx="${radius}" ry="${radius}" fill="#ffffff"/>
        </svg>`,
      );

      // Resize + round corners in one raw-RGBA pass (no PNG encode)
      const { data: maskedData, info: maskedInfo } = await sharp(buffer)
        .resize(contentWidth, contentHeight, { fit: "fill" })
        .composite([{ input: roundedMask, blend: "dest-in" }])
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

      // Composite masked screenshot onto pre-built backdrop (raw RGBA → raw RGBA)
      const { data: composited, info: compInfo } = await sharp(sl.backdropRaw, {
        raw: { width: sl.backdropWidth, height: sl.backdropHeight, channels: 4 },
      })
        .composite([{
          input: Buffer.from(maskedData),
          raw: { width: maskedInfo.width, height: maskedInfo.height, channels: 4 },
          left: padding,
          top: padding,
        }])
        .raw()
        .toBuffer({ resolveWithObject: true });

      // 9. Watermark already baked into backdrop — skip renderWatermark.
      // 10. Return raw RGBA (no final PNG encode; encoder handles raw→rgb24 directly).
      return {
        index: frame.index,
        buffer: Buffer.from(composited),
        timestamp: frame.timestamp,
        rawInfo: { width: compInfo.width, height: compInfo.height, channels: 4 },
      };
    }
    // Fallback for degenerate padding (contentWidth/Height <= 0)
    buffer = sl.backdropRaw;
  } else {
    buffer = await applyBackground(buffer, effects.background, output.width, output.height);

    // 9. Watermark overlay
    if (effects.watermark.enabled) {
      buffer = await renderWatermark(buffer, effects.watermark, output.width, output.height);
    }
  }

  // 10. Final resize + raw RGBA output (no PNG encode — encoder reads raw directly)
  const { data: finalData, info: finalInfo } = await sharp(buffer)
    .resize(output.width, output.height, {
      fit: "fill",
      kernel: sharp.kernel.lanczos3,
    })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  return {
    index: frame.index,
    buffer: Buffer.from(finalData),
    timestamp: frame.timestamp,
    rawInfo: { width: finalInfo.width, height: finalInfo.height, channels: 4 },
  };
}
