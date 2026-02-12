import sharp from "sharp";
import type { EffectsConfig, KeystrokeEvent } from "../script/types.js";

type KeystrokeConfig = EffectsConfig["keystroke"];

/**
 * Render a keystroke HUD overlay showing recently typed keys.
 * Inspired by KeyCastr / CursorClip.
 */
export async function renderKeystrokeHud(
  frameBuffer: Buffer,
  keystrokes: KeystrokeEvent[],
  frameTimestamp: number,
  config: KeystrokeConfig,
  frameWidth: number,
  frameHeight: number,
): Promise<Buffer> {
  if (!config.enabled || keystrokes.length === 0) return frameBuffer;

  // Collect recent keystrokes within the fade window
  const recentKeys = keystrokes.filter(
    (k) => frameTimestamp - k.timestamp < config.fadeAfter,
  );
  if (recentKeys.length === 0) return frameBuffer;

  const displayText = recentKeys.map((k) => k.key).join("");
  if (displayText.length === 0) return frameBuffer;

  // Calculate text dimensions
  const charWidth = config.fontSize * 0.62;
  const textWidth = Math.ceil(displayText.length * charWidth);
  const hudPadH = config.padding * 2;
  const hudPadV = config.padding * 1.5;
  const hudWidth = Math.min(textWidth + hudPadH * 2, frameWidth - 40);
  const hudHeight = Math.ceil(config.fontSize + hudPadV * 2);

  // Calculate overall opacity based on the newest keystroke age
  const newest = recentKeys[recentKeys.length - 1];
  const age = frameTimestamp - newest.timestamp;
  const fadeStart = config.fadeAfter * 0.6;
  const opacity = age > fadeStart
    ? Math.max(0, 1 - (age - fadeStart) / (config.fadeAfter - fadeStart))
    : 1;

  if (opacity <= 0) return frameBuffer;

  // Position
  let hudX: number;
  const hudY = frameHeight - hudHeight - 30;
  switch (config.position) {
    case "bottom-left":
      hudX = 30;
      break;
    case "bottom-right":
      hudX = frameWidth - hudWidth - 30;
      break;
    case "bottom-center":
    default:
      hudX = Math.round((frameWidth - hudWidth) / 2);
      break;
  }

  // Truncate display text to fit
  const maxChars = Math.floor((hudWidth - hudPadH * 2) / charWidth);
  const truncated = displayText.length > maxChars
    ? displayText.slice(-maxChars)
    : displayText;

  // Escape XML entities
  const escaped = truncated
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

  const hudSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${frameWidth}" height="${frameHeight}">
    <rect x="${hudX}" y="${hudY}" width="${hudWidth}" height="${hudHeight}"
          rx="8" ry="8" fill="${config.backgroundColor}" opacity="${opacity.toFixed(3)}" />
    <text x="${hudX + hudPadH}" y="${hudY + hudPadV + config.fontSize * 0.75}"
          font-family="monospace, Menlo, Consolas" font-size="${config.fontSize}"
          fill="${config.textColor}" opacity="${opacity.toFixed(3)}">${escaped}</text>
  </svg>`;

  return sharp(frameBuffer)
    .composite([{ input: Buffer.from(hudSvg), left: 0, top: 0 }])
    .png()
    .toBuffer();
}
