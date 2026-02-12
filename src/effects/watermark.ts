import sharp from "sharp";
import type { EffectsConfig } from "../script/types.js";

type WatermarkConfig = EffectsConfig["watermark"];

/**
 * Render a text watermark overlay at the specified corner.
 */
export async function renderWatermark(
  frameBuffer: Buffer,
  config: WatermarkConfig,
  frameWidth: number,
  frameHeight: number,
): Promise<Buffer> {
  if (!config.enabled || !config.text) return frameBuffer;

  const charWidth = config.fontSize * 0.62;
  const textWidth = Math.ceil(config.text.length * charWidth);
  const margin = 16;

  let x: number;
  let y: number;

  switch (config.position) {
    case "top-left":
      x = margin;
      y = margin + config.fontSize;
      break;
    case "top-right":
      x = frameWidth - textWidth - margin;
      y = margin + config.fontSize;
      break;
    case "bottom-left":
      x = margin;
      y = frameHeight - margin;
      break;
    case "bottom-right":
    default:
      x = frameWidth - textWidth - margin;
      y = frameHeight - margin;
      break;
  }

  const escaped = config.text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

  const watermarkSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${frameWidth}" height="${frameHeight}">
    <text x="${x}" y="${y}"
          font-family="system-ui, -apple-system, sans-serif" font-size="${config.fontSize}"
          font-weight="600" fill="${config.color}"
          opacity="${config.opacity.toFixed(3)}">${escaped}</text>
  </svg>`;

  return sharp(frameBuffer)
    .composite([{ input: Buffer.from(watermarkSvg), left: 0, top: 0 }])
    .png()
    .toBuffer();
}
