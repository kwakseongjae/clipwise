import sharp from "sharp";
import type { EffectsConfig } from "../script/types.js";

type CursorEffect = EffectsConfig["cursor"];

// ─── Overlay Descriptors ────────────────────────────────────────────────────
// Lightweight objects describing an SVG overlay and its position.
// Used by composeFrame() to batch multiple overlays into a single Sharp call,
// eliminating intermediate PNG encode/decode cycles.

export interface OverlayDescriptor {
  input: Buffer;
  left: number;
  top: number;
}

/**
 * Build a cursor arrow overlay descriptor without applying it to a frame.
 */
export function buildCursorOverlay(
  position: { x: number; y: number },
  config: CursorEffect,
  frameWidth: number,
  frameHeight: number,
  dpr = 1,
): OverlayDescriptor | null {
  if (!config.enabled) return null;

  const size = Math.round(config.size * dpr);
  const cursorSvg = buildCursorSvg(size, config.color);
  const tipOffsetX = Math.round((4 / 24) * size);
  const px = Math.round(position.x * dpr);
  const py = Math.round(position.y * dpr);
  const left = Math.max(0, Math.min(px - tipOffsetX, frameWidth - size));
  const top  = Math.max(0, Math.min(py, frameHeight - size));

  return { input: Buffer.from(cursorSvg), left, top };
}

/**
 * Build a click ripple overlay descriptor without applying it to a frame.
 */
export function buildClickRippleOverlay(
  position: { x: number; y: number },
  config: CursorEffect,
  progress: number,
  frameWidth: number,
  frameHeight: number,
  dpr = 1,
): OverlayDescriptor | null {
  if (!config.enabled || !config.clickEffect) return null;

  const radius = config.clickRadius * dpr;
  const clampedProgress = Math.max(0, Math.min(1, progress));
  const rippleSvg = buildClickRippleSvg(radius, config.clickColor, clampedProgress);
  const rippleSize = Math.ceil(radius * 2 + 4);
  const px = Math.round(position.x * dpr);
  const py = Math.round(position.y * dpr);
  const left = Math.max(0, Math.min(px - Math.round(rippleSize / 2), frameWidth - rippleSize));
  const top = Math.max(0, Math.min(py - Math.round(rippleSize / 2), frameHeight - rippleSize));

  return { input: Buffer.from(rippleSvg), left, top };
}

/**
 * Build a cursor highlight (Screen Studio glow) overlay descriptor.
 */
export function buildHighlightOverlay(
  position: { x: number; y: number },
  config: CursorEffect,
  frameWidth: number,
  frameHeight: number,
  dpr = 1,
): OverlayDescriptor | null {
  if (!config.enabled || !config.highlight) return null;

  const r = config.highlightRadius * dpr;
  const size = Math.ceil(r * 2 + 4);
  const cx = size / 2;
  const cy = size / 2;

  const highlightSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" shape-rendering="geometricPrecision">
    <defs>
      <radialGradient id="glow">
        <stop offset="0%" stop-color="${config.highlightColor}" />
        <stop offset="70%" stop-color="${config.highlightColor}" />
        <stop offset="100%" stop-color="transparent" />
      </radialGradient>
    </defs>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#glow)" />
  </svg>`;

  const px = Math.round(position.x * dpr);
  const py = Math.round(position.y * dpr);
  const left = Math.max(0, Math.min(px - Math.round(cx), frameWidth - size));
  const top = Math.max(0, Math.min(py - Math.round(cy), frameHeight - size));

  return { input: Buffer.from(highlightSvg), left, top };
}

/**
 * Build a cursor trail overlay descriptor.
 */
export function buildTrailOverlay(
  positions: Array<{ x: number; y: number }>,
  config: CursorEffect,
  frameWidth: number,
  frameHeight: number,
  dpr = 1,
): OverlayDescriptor | null {
  if (!config.enabled || !config.trail || positions.length < 2) return null;

  const segments: string[] = [];
  for (let i = 1; i < positions.length; i++) {
    const opacity = (i / positions.length) * 0.6;
    const strokeWidth = (1 + (i / positions.length) * 2) * dpr;
    const p1 = positions[i - 1];
    const p2 = positions[i];
    segments.push(
      `<line x1="${p1.x * dpr}" y1="${p1.y * dpr}" x2="${p2.x * dpr}" y2="${p2.y * dpr}"
            stroke="${config.trailColor}" stroke-width="${strokeWidth.toFixed(1)}"
            stroke-linecap="round" opacity="${opacity.toFixed(3)}"/>`,
    );
  }

  const trailSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${frameWidth}" height="${frameHeight}" shape-rendering="geometricPrecision">
    ${segments.join("\n    ")}
  </svg>`;

  return { input: Buffer.from(trailSvg), left: 0, top: 0 };
}

/**
 * Build an SVG string for a pointer cursor arrow.
 */
function buildCursorSvg(size: number, color: string): string {
  // Classic pointer arrow shape scaled to `size`
  const s = size;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 24 24" shape-rendering="geometricPrecision">
    <path d="M4 0 L4 22 L10 16 L16 24 L20 22 L14 14 L22 14 Z"
          fill="${color}" stroke="#ffffff" stroke-width="1.5" stroke-linejoin="round"/>
  </svg>`;
}

/**
 * Build an SVG string for a click ripple effect.
 */
function buildClickRippleSvg(
  radius: number,
  color: string,
  progress: number,
): string {
  const currentRadius = radius * progress;
  const opacity = Math.max(0, 1 - progress);
  const size = Math.ceil(radius * 2 + 4);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" shape-rendering="geometricPrecision">
    <circle cx="${size / 2}" cy="${size / 2}" r="${currentRadius}"
            fill="none" stroke="${color}" stroke-width="2"
            opacity="${opacity.toFixed(3)}"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${currentRadius * 0.6}"
            fill="${color}" opacity="${(opacity * 0.4).toFixed(3)}"/>
  </svg>`;
}

/**
 * Render a cursor overlay on the frame.
 * @param dpr - Device pixel ratio (default 1). Scales position and size for HiDPI.
 */
export async function renderCursor(
  frameBuffer: Buffer,
  position: { x: number; y: number },
  config: CursorEffect,
  frameWidth: number,
  frameHeight: number,
  dpr = 1,
): Promise<Buffer> {
  if (!config.enabled) return frameBuffer;

  const size = Math.round(config.size * dpr);
  const cursorSvg = buildCursorSvg(size, config.color);
  const cursorBuffer = Buffer.from(cursorSvg);

  // The SVG arrow tip sits at (4/24 × size, 0) within the bounding box.
  // Subtract that x-offset so the rendered tip aligns with position.x exactly.
  const tipOffsetX = Math.round((4 / 24) * size);
  const px = Math.round(position.x * dpr);
  const py = Math.round(position.y * dpr);
  const left = Math.max(0, Math.min(px - tipOffsetX, frameWidth - size));
  const top  = Math.max(0, Math.min(py, frameHeight - size));

  return sharp(frameBuffer)
    .composite([{ input: cursorBuffer, left, top }])
    .png()
    .toBuffer();
}

/**
 * Render a click ripple effect on the frame.
 *
 * @param progress - Animation progress from 0 (click start) to 1 (fully faded)
 * @param dpr - Device pixel ratio (default 1). Scales position and size for HiDPI.
 */
export async function renderClickEffect(
  frameBuffer: Buffer,
  position: { x: number; y: number },
  config: CursorEffect,
  progress: number,
  frameWidth: number,
  frameHeight: number,
  dpr = 1,
): Promise<Buffer> {
  if (!config.enabled || !config.clickEffect) return frameBuffer;

  const radius = config.clickRadius * dpr;
  const clampedProgress = Math.max(0, Math.min(1, progress));
  const rippleSvg = buildClickRippleSvg(radius, config.clickColor, clampedProgress);
  const rippleBuffer = Buffer.from(rippleSvg);

  const rippleSize = Math.ceil(radius * 2 + 4);
  const px = Math.round(position.x * dpr);
  const py = Math.round(position.y * dpr);
  const left = Math.max(0, Math.min(px - Math.round(rippleSize / 2), frameWidth - rippleSize));
  const top = Math.max(0, Math.min(py - Math.round(rippleSize / 2), frameHeight - rippleSize));

  return sharp(frameBuffer)
    .composite([{ input: rippleBuffer, left, top }])
    .png()
    .toBuffer();
}

/**
 * Render a glowing highlight circle around the cursor (Screen Studio style).
 * @param dpr - Device pixel ratio (default 1). Scales position and size for HiDPI.
 */
export async function renderCursorHighlight(
  frameBuffer: Buffer,
  position: { x: number; y: number },
  config: CursorEffect,
  frameWidth: number,
  frameHeight: number,
  dpr = 1,
): Promise<Buffer> {
  if (!config.enabled || !config.highlight) return frameBuffer;

  const r = config.highlightRadius * dpr;
  const size = Math.ceil(r * 2 + 4);
  const cx = size / 2;
  const cy = size / 2;

  const highlightSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" shape-rendering="geometricPrecision">
    <defs>
      <radialGradient id="glow">
        <stop offset="0%" stop-color="${config.highlightColor}" />
        <stop offset="70%" stop-color="${config.highlightColor}" />
        <stop offset="100%" stop-color="transparent" />
      </radialGradient>
    </defs>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#glow)" />
  </svg>`;

  const px = Math.round(position.x * dpr);
  const py = Math.round(position.y * dpr);
  const left = Math.max(0, Math.min(px - Math.round(cx), frameWidth - size));
  const top = Math.max(0, Math.min(py - Math.round(cy), frameHeight - size));

  return sharp(frameBuffer)
    .composite([{ input: Buffer.from(highlightSvg), left, top }])
    .png()
    .toBuffer();
}

/**
 * Render a cursor trail (fading line segments following cursor path).
 * Each segment fades from transparent (oldest) to opaque (newest).
 * @param dpr - Device pixel ratio (default 1). Scales positions for HiDPI.
 */
export async function renderCursorTrail(
  frameBuffer: Buffer,
  positions: Array<{ x: number; y: number }>,
  config: CursorEffect,
  frameWidth: number,
  frameHeight: number,
  dpr = 1,
): Promise<Buffer> {
  if (!config.enabled || !config.trail || positions.length < 2) {
    return frameBuffer;
  }

  const segments: string[] = [];
  for (let i = 1; i < positions.length; i++) {
    const opacity = (i / positions.length) * 0.6;
    const strokeWidth = (1 + (i / positions.length) * 2) * dpr;
    const p1 = positions[i - 1];
    const p2 = positions[i];
    segments.push(
      `<line x1="${p1.x * dpr}" y1="${p1.y * dpr}" x2="${p2.x * dpr}" y2="${p2.y * dpr}"
            stroke="${config.trailColor}" stroke-width="${strokeWidth.toFixed(1)}"
            stroke-linecap="round" opacity="${opacity.toFixed(3)}"/>`,
    );
  }

  const trailSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${frameWidth}" height="${frameHeight}" shape-rendering="geometricPrecision">
    ${segments.join("\n    ")}
  </svg>`;

  return sharp(frameBuffer)
    .composite([{ input: Buffer.from(trailSvg), left: 0, top: 0 }])
    .png()
    .toBuffer();
}
