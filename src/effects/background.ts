import sharp from "sharp";
import type { EffectsConfig } from "../script/types.js";

type Background = EffectsConfig["background"];

/**
 * Parse a CSS linear-gradient string into SVG gradient stops.
 *
 * Supports the format: linear-gradient(135deg, #aaa 0%, #bbb 100%)
 */
function parseGradient(value: string): {
  angle: number;
  stops: Array<{ color: string; offset: string }>;
} {
  const match = value.match(
    /linear-gradient\(\s*([\d.]+)deg\s*,\s*(.+)\s*\)/,
  );
  if (!match) {
    return { angle: 135, stops: [{ color: value, offset: "100%" }] };
  }

  const angle = parseFloat(match[1]);
  const stopsRaw = match[2].split(",").map((s) => s.trim());

  const stops = stopsRaw.map((stop) => {
    const parts = stop.trim().split(/\s+/);
    return {
      color: parts[0],
      offset: parts[1] ?? "0%",
    };
  });

  return { angle, stops };
}

/**
 * Convert a CSS-style angle to SVG linearGradient x1,y1,x2,y2 coordinates.
 */
function angleToGradientCoords(angle: number) {
  const rad = ((angle - 90) * Math.PI) / 180;
  const x1 = 50 - Math.cos(rad) * 50;
  const y1 = 50 - Math.sin(rad) * 50;
  const x2 = 50 + Math.cos(rad) * 50;
  const y2 = 50 + Math.sin(rad) * 50;
  return {
    x1: `${x1.toFixed(1)}%`,
    y1: `${y1.toFixed(1)}%`,
    x2: `${x2.toFixed(1)}%`,
    y2: `${y2.toFixed(1)}%`,
  };
}

/**
 * Build an SVG for the background layer (gradient, solid, or fallback).
 */
function buildBackgroundSvg(
  config: Background,
  width: number,
  height: number,
): string {
  if (config.type === "solid") {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <rect width="${width}" height="${height}" fill="${config.value}"/>
    </svg>`;
  }

  // Gradient
  const { angle, stops } = parseGradient(config.value);
  const coords = angleToGradientCoords(angle);
  const stopElements = stops
    .map((s) => `<stop offset="${s.offset}" stop-color="${s.color}"/>`)
    .join("\n        ");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <defs>
      <linearGradient id="bg" x1="${coords.x1}" y1="${coords.y1}" x2="${coords.x2}" y2="${coords.y2}">
        ${stopElements}
      </linearGradient>
    </defs>
    <rect width="${width}" height="${height}" fill="url(#bg)"/>
  </svg>`;
}

/**
 * Apply a decorative background behind the screenshot frame.
 *
 * - Adds padding around the screenshot
 * - Applies rounded corners via a clipping mask
 * - Optionally adds a drop shadow
 */
export async function applyBackground(
  frameBuffer: Buffer,
  config: Background,
  outputWidth: number,
  outputHeight: number,
): Promise<Buffer> {
  const padding = config.padding;
  const contentWidth = outputWidth - padding * 2;
  const contentHeight = outputHeight - padding * 2;

  if (contentWidth <= 0 || contentHeight <= 0) {
    return frameBuffer;
  }

  // Resize the frame to fit the content area
  const resizedFrame = await sharp(frameBuffer)
    .resize(contentWidth, contentHeight, { fit: "fill" })
    .png()
    .toBuffer();

  // Create the background
  const bgSvg = buildBackgroundSvg(config, outputWidth, outputHeight);
  const bgBuffer = Buffer.from(bgSvg);

  // Create a rounded-corner mask for the screenshot
  const radius = config.borderRadius;
  const roundedMask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${contentWidth}" height="${contentHeight}">
      <rect width="${contentWidth}" height="${contentHeight}" rx="${radius}" ry="${radius}" fill="#ffffff"/>
    </svg>`,
  );

  // Apply the rounded corner mask to the screenshot
  const maskedFrame = await sharp(resizedFrame)
    .composite([
      {
        input: roundedMask,
        blend: "dest-in",
      },
    ])
    .png()
    .toBuffer();

  // Build the shadow SVG overlay if enabled
  const composites: sharp.OverlayOptions[] = [];

  if (config.shadow) {
    const shadowSvg = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${outputWidth}" height="${outputHeight}">
        <defs>
          <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="4" stdDeviation="16" flood-color="rgba(0,0,0,0.3)"/>
          </filter>
        </defs>
        <rect x="${padding}" y="${padding}" width="${contentWidth}" height="${contentHeight}"
              rx="${radius}" ry="${radius}" fill="rgba(0,0,0,0.15)" filter="url(#shadow)"/>
      </svg>`,
    );
    composites.push({ input: shadowSvg, left: 0, top: 0 });
  }

  // Place the masked screenshot in the center
  composites.push({ input: maskedFrame, left: padding, top: padding });

  return sharp(bgBuffer)
    .resize(outputWidth, outputHeight)
    .composite(composites)
    .png()
    .toBuffer();
}
