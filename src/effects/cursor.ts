import sharp from "sharp";
import type { EffectsConfig } from "../script/types.js";

type CursorEffect = EffectsConfig["cursor"];

/**
 * Build an SVG string for a pointer cursor arrow.
 */
function buildCursorSvg(size: number, color: string): string {
  // Classic pointer arrow shape scaled to `size`
  const s = size;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 24 24">
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

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    <circle cx="${size / 2}" cy="${size / 2}" r="${currentRadius}"
            fill="none" stroke="${color}" stroke-width="2"
            opacity="${opacity.toFixed(3)}"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${currentRadius * 0.6}"
            fill="${color}" opacity="${(opacity * 0.4).toFixed(3)}"/>
  </svg>`;
}

/**
 * Render a cursor overlay on the frame.
 */
export async function renderCursor(
  frameBuffer: Buffer,
  position: { x: number; y: number },
  config: CursorEffect,
  frameWidth: number,
  frameHeight: number,
): Promise<Buffer> {
  if (!config.enabled) return frameBuffer;

  const cursorSvg = buildCursorSvg(config.size, config.color);
  const cursorBuffer = Buffer.from(cursorSvg);

  // Clamp position so the cursor stays within the frame
  const left = Math.max(0, Math.min(Math.round(position.x), frameWidth - 1));
  const top = Math.max(0, Math.min(Math.round(position.y), frameHeight - 1));

  return sharp(frameBuffer)
    .composite([{ input: cursorBuffer, left, top }])
    .png()
    .toBuffer();
}

/**
 * Render a click ripple effect on the frame.
 *
 * @param progress - Animation progress from 0 (click start) to 1 (fully faded)
 */
export async function renderClickEffect(
  frameBuffer: Buffer,
  position: { x: number; y: number },
  config: CursorEffect,
  progress: number,
  frameWidth: number,
  frameHeight: number,
): Promise<Buffer> {
  if (!config.enabled || !config.clickEffect) return frameBuffer;

  const clampedProgress = Math.max(0, Math.min(1, progress));
  const rippleSvg = buildClickRippleSvg(
    config.clickRadius,
    config.clickColor,
    clampedProgress,
  );
  const rippleBuffer = Buffer.from(rippleSvg);

  const rippleSize = Math.ceil(config.clickRadius * 2 + 4);
  const left = Math.max(
    0,
    Math.min(
      Math.round(position.x - rippleSize / 2),
      frameWidth - rippleSize,
    ),
  );
  const top = Math.max(
    0,
    Math.min(
      Math.round(position.y - rippleSize / 2),
      frameHeight - rippleSize,
    ),
  );

  return sharp(frameBuffer)
    .composite([{ input: rippleBuffer, left, top }])
    .png()
    .toBuffer();
}

/**
 * Render a glowing highlight circle around the cursor (Screen Studio style).
 */
export async function renderCursorHighlight(
  frameBuffer: Buffer,
  position: { x: number; y: number },
  config: CursorEffect,
  frameWidth: number,
  frameHeight: number,
): Promise<Buffer> {
  if (!config.enabled || !config.highlight) return frameBuffer;

  const r = config.highlightRadius;
  const size = Math.ceil(r * 2 + 4);
  const cx = size / 2;
  const cy = size / 2;

  const highlightSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    <defs>
      <radialGradient id="glow">
        <stop offset="0%" stop-color="${config.highlightColor}" />
        <stop offset="70%" stop-color="${config.highlightColor}" />
        <stop offset="100%" stop-color="transparent" />
      </radialGradient>
    </defs>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#glow)" />
  </svg>`;

  const left = Math.max(0, Math.min(Math.round(position.x - cx), frameWidth - size));
  const top = Math.max(0, Math.min(Math.round(position.y - cy), frameHeight - size));

  return sharp(frameBuffer)
    .composite([{ input: Buffer.from(highlightSvg), left, top }])
    .png()
    .toBuffer();
}

/**
 * Render a cursor trail (fading line segments following cursor path).
 * Each segment fades from transparent (oldest) to opaque (newest).
 */
export async function renderCursorTrail(
  frameBuffer: Buffer,
  positions: Array<{ x: number; y: number }>,
  config: CursorEffect,
  frameWidth: number,
  frameHeight: number,
): Promise<Buffer> {
  if (!config.enabled || !config.trail || positions.length < 2) {
    return frameBuffer;
  }

  const segments: string[] = [];
  for (let i = 1; i < positions.length; i++) {
    const opacity = (i / positions.length) * 0.6;
    const strokeWidth = 1 + (i / positions.length) * 2;
    const p1 = positions[i - 1];
    const p2 = positions[i];
    segments.push(
      `<line x1="${p1.x}" y1="${p1.y}" x2="${p2.x}" y2="${p2.y}"
            stroke="${config.trailColor}" stroke-width="${strokeWidth.toFixed(1)}"
            stroke-linecap="round" opacity="${opacity.toFixed(3)}"/>`,
    );
  }

  const trailSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${frameWidth}" height="${frameHeight}">
    ${segments.join("\n    ")}
  </svg>`;

  return sharp(frameBuffer)
    .composite([{ input: Buffer.from(trailSvg), left: 0, top: 0 }])
    .png()
    .toBuffer();
}
