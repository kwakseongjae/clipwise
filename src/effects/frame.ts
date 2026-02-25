import sharp from "sharp";
import type { EffectsConfig } from "../script/types.js";

type DeviceFrame = EffectsConfig["deviceFrame"];

// ─── Browser Chrome Constants ────────────────────────────

const TITLE_BAR_HEIGHT = 40;
const TRAFFIC_LIGHT_Y = 14;
const TRAFFIC_LIGHT_RADIUS = 6;
const TRAFFIC_LIGHTS_START_X = 16;
const TRAFFIC_LIGHT_GAP = 22;
const ADDRESS_BAR_HEIGHT = 24;
const ADDRESS_BAR_MARGIN = 70;

// ─── Mobile Device Bezel Constants ───────────────────────

const IPHONE_BEZEL = { sides: 12, top: 50, bottom: 34 };
const IPHONE_OUTER_RADIUS = 47;
const IPHONE_INNER_RADIUS = 39;
const IPHONE_ISLAND = { width: 120, height: 36 };
const IPHONE_HOME_BAR = { width: 134, height: 5 };

const IPAD_BEZEL = { sides: 20, top: 24, bottom: 24 };
const IPAD_OUTER_RADIUS = 18;
const IPAD_INNER_RADIUS = 12;

const ANDROID_BEZEL = { sides: 8, top: 32, bottom: 20 };
const ANDROID_OUTER_RADIUS = 35;
const ANDROID_INNER_RADIUS = 30;
const ANDROID_CAMERA_RADIUS = 6;

// ─── Browser Chrome SVG ──────────────────────────────────

/**
 * Build an SVG for the browser chrome title bar.
 * All pixel constants are multiplied by dpr for HiDPI rendering.
 */
function buildBrowserChromeSvg(
  width: number,
  darkMode: boolean,
  dpr = 1,
): string {
  const bg = darkMode ? "#2d2d2d" : "#e8e8e8";
  const addressBg = darkMode ? "#1a1a1a" : "#ffffff";
  const addressBorder = darkMode ? "#444444" : "#d0d0d0";
  const textColor = darkMode ? "#999999" : "#666666";

  const tbarH = TITLE_BAR_HEIGHT * dpr;
  const tlY = TRAFFIC_LIGHT_Y * dpr;
  const tlR = TRAFFIC_LIGHT_RADIUS * dpr;
  const tlStartX = TRAFFIC_LIGHTS_START_X * dpr;
  const tlGap = TRAFFIC_LIGHT_GAP * dpr;
  const aBarH = ADDRESS_BAR_HEIGHT * dpr;
  const aBarMargin = ADDRESS_BAR_MARGIN * dpr;
  const fontSize = 12 * dpr;

  const trafficLights = [
    { cx: tlStartX, fill: "#ff5f57" },
    { cx: tlStartX + tlGap, fill: "#febc2e" },
    { cx: tlStartX + tlGap * 2, fill: "#28c840" },
  ]
    .map(
      (light) =>
        `<circle cx="${light.cx}" cy="${tlY}" r="${tlR}" fill="${light.fill}"/>`,
    )
    .join("\n    ");

  const addressBarWidth = width - aBarMargin * 2;
  const addressBarX = aBarMargin;
  const addressBarY = (tbarH - aBarH) / 2;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${tbarH}">
    <rect width="${width}" height="${tbarH}" fill="${bg}"/>
    ${trafficLights}
    <rect x="${addressBarX}" y="${addressBarY}" width="${addressBarWidth}" height="${aBarH}"
          rx="${6 * dpr}" ry="${6 * dpr}" fill="${addressBg}" stroke="${addressBorder}" stroke-width="${dpr}"/>
    <text x="${width / 2}" y="${tlY + 4 * dpr}" text-anchor="middle"
          font-family="system-ui, -apple-system, sans-serif" font-size="${fontSize}" fill="${textColor}">
      localhost
    </text>
  </svg>`;
}

// ─── Mobile Device SVG Builders ──────────────────────────

/**
 * Build an iPhone 15 Pro style device frame SVG.
 * Features Dynamic Island pill and home indicator bar.
 */
function buildIPhoneFrameSvg(
  totalWidth: number,
  totalHeight: number,
  screenWidth: number,
  screenHeight: number,
  darkMode: boolean,
  dpr = 1,
): string {
  const bezelColor = darkMode ? "#1a1a1a" : "#f5f5f7";
  const islandColor = darkMode ? "#000000" : "#1a1a1a";
  const homeBarColor = darkMode ? "#555555" : "#333333";

  const bezelTop = IPHONE_BEZEL.top * dpr;
  const bezelBottom = IPHONE_BEZEL.bottom * dpr;
  const bezelSides = IPHONE_BEZEL.sides * dpr;
  const outerRadius = IPHONE_OUTER_RADIUS * dpr;
  const innerRadius = IPHONE_INNER_RADIUS * dpr;
  const islandW = IPHONE_ISLAND.width * dpr;
  const islandH = IPHONE_ISLAND.height * dpr;
  const homeBarW = IPHONE_HOME_BAR.width * dpr;
  const homeBarH = IPHONE_HOME_BAR.height * dpr;

  const islandX = (totalWidth - islandW) / 2;
  const islandY = (bezelTop - islandH) / 2 + 4 * dpr;
  const homeBarX = (totalWidth - homeBarW) / 2;
  const homeBarY = totalHeight - bezelBottom / 2 - homeBarH / 2;

  const screenX = bezelSides;
  const screenY = bezelTop;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${totalHeight}">
    <!-- Device body -->
    <rect width="${totalWidth}" height="${totalHeight}"
          rx="${outerRadius}" ry="${outerRadius}" fill="${bezelColor}"/>
    <!-- Screen cutout (transparent) -->
    <rect x="${screenX}" y="${screenY}" width="${screenWidth}" height="${screenHeight}"
          rx="${innerRadius}" ry="${innerRadius}" fill="black"/>
    <!-- Dynamic Island pill -->
    <rect x="${islandX}" y="${islandY}" width="${islandW}" height="${islandH}"
          rx="${islandH / 2}" ry="${islandH / 2}" fill="${islandColor}"/>
    <!-- Home indicator bar -->
    <rect x="${homeBarX}" y="${homeBarY}" width="${homeBarW}" height="${homeBarH}"
          rx="${homeBarH / 2}" ry="${homeBarH / 2}" fill="${homeBarColor}"/>
  </svg>`;
}

/**
 * Build an iPad Pro style device frame SVG.
 * Features slim bezels and a front camera dot.
 */
function buildIPadFrameSvg(
  totalWidth: number,
  totalHeight: number,
  screenWidth: number,
  screenHeight: number,
  darkMode: boolean,
  dpr = 1,
): string {
  const bezelColor = darkMode ? "#1a1a1a" : "#f5f5f7";
  const cameraColor = darkMode ? "#2a2a2a" : "#3a3a3a";

  const screenX = IPAD_BEZEL.sides * dpr;
  const screenY = IPAD_BEZEL.top * dpr;
  const cameraCx = totalWidth / 2;
  const cameraCy = (IPAD_BEZEL.top * dpr) / 2;
  const outerRadius = IPAD_OUTER_RADIUS * dpr;
  const innerRadius = IPAD_INNER_RADIUS * dpr;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${totalHeight}">
    <!-- Device body -->
    <rect width="${totalWidth}" height="${totalHeight}"
          rx="${outerRadius}" ry="${outerRadius}" fill="${bezelColor}"/>
    <!-- Screen cutout -->
    <rect x="${screenX}" y="${screenY}" width="${screenWidth}" height="${screenHeight}"
          rx="${innerRadius}" ry="${innerRadius}" fill="black"/>
    <!-- Front camera dot -->
    <circle cx="${cameraCx}" cy="${cameraCy}" r="${4 * dpr}" fill="${cameraColor}"/>
  </svg>`;
}

/**
 * Build a generic Android device frame SVG.
 * Features slim bezels and a punch-hole camera.
 */
function buildAndroidFrameSvg(
  totalWidth: number,
  totalHeight: number,
  screenWidth: number,
  screenHeight: number,
  darkMode: boolean,
  dpr = 1,
): string {
  const bezelColor = darkMode ? "#1a1a1a" : "#e8e8e8";
  const cameraColor = darkMode ? "#2a2a2a" : "#3a3a3a";

  const screenX = ANDROID_BEZEL.sides * dpr;
  const screenY = ANDROID_BEZEL.top * dpr;
  const cameraCx = totalWidth / 2;
  const cameraCy = (ANDROID_BEZEL.top * dpr) / 2;
  const outerRadius = ANDROID_OUTER_RADIUS * dpr;
  const innerRadius = ANDROID_INNER_RADIUS * dpr;
  const cameraR = ANDROID_CAMERA_RADIUS * dpr;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${totalHeight}">
    <!-- Device body -->
    <rect width="${totalWidth}" height="${totalHeight}"
          rx="${outerRadius}" ry="${outerRadius}" fill="${bezelColor}"/>
    <!-- Screen cutout -->
    <rect x="${screenX}" y="${screenY}" width="${screenWidth}" height="${screenHeight}"
          rx="${innerRadius}" ry="${innerRadius}" fill="black"/>
    <!-- Punch-hole camera -->
    <circle cx="${cameraCx}" cy="${cameraCy}" r="${cameraR}" fill="${cameraColor}"/>
  </svg>`;
}

// ─── Screen Corner Mask ──────────────────────────────────

/**
 * Build an SVG mask that clips the screenshot to rounded corners
 * matching the inner radius of the device frame.
 */
function buildScreenMaskSvg(
  width: number,
  height: number,
  radius: number,
): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <rect width="${width}" height="${height}" rx="${radius}" ry="${radius}" fill="white"/>
  </svg>`;
}

// ─── Mobile Frame Composer ───────────────────────────────

interface BezelConfig {
  sides: number;
  top: number;
  bottom: number;
}

/**
 * Apply a mobile device frame around the screenshot.
 *
 * 1. Creates a canvas at the total device size
 * 2. Renders the device bezel SVG (body + camera + buttons)
 * 3. Composites the screenshot into the screen area with rounded-corner mask
 */
async function applyMobileFrame(
  frameBuffer: Buffer,
  deviceType: "iphone" | "ipad" | "android",
  darkMode: boolean,
  frameWidth: number,
  frameHeight: number,
  dpr = 1,
): Promise<Buffer> {
  let bezel: BezelConfig;
  let innerRadius: number;

  switch (deviceType) {
    case "iphone":
      bezel = {
        sides: IPHONE_BEZEL.sides * dpr,
        top: IPHONE_BEZEL.top * dpr,
        bottom: IPHONE_BEZEL.bottom * dpr,
      };
      innerRadius = IPHONE_INNER_RADIUS * dpr;
      break;
    case "ipad":
      bezel = {
        sides: IPAD_BEZEL.sides * dpr,
        top: IPAD_BEZEL.top * dpr,
        bottom: IPAD_BEZEL.bottom * dpr,
      };
      innerRadius = IPAD_INNER_RADIUS * dpr;
      break;
    case "android":
      bezel = {
        sides: ANDROID_BEZEL.sides * dpr,
        top: ANDROID_BEZEL.top * dpr,
        bottom: ANDROID_BEZEL.bottom * dpr,
      };
      innerRadius = ANDROID_INNER_RADIUS * dpr;
      break;
  }

  const totalWidth = frameWidth + bezel.sides * 2;
  const totalHeight = frameHeight + bezel.top + bezel.bottom;

  // Build the device frame SVG
  let frameSvg: string;
  switch (deviceType) {
    case "iphone":
      frameSvg = buildIPhoneFrameSvg(totalWidth, totalHeight, frameWidth, frameHeight, darkMode, dpr);
      break;
    case "ipad":
      frameSvg = buildIPadFrameSvg(totalWidth, totalHeight, frameWidth, frameHeight, darkMode, dpr);
      break;
    case "android":
      frameSvg = buildAndroidFrameSvg(totalWidth, totalHeight, frameWidth, frameHeight, darkMode, dpr);
      break;
  }

  // Apply rounded-corner mask to the screenshot
  const maskSvg = buildScreenMaskSvg(frameWidth, frameHeight, innerRadius);
  const maskedScreen = await sharp(frameBuffer)
    .resize(frameWidth, frameHeight, { fit: "fill" })
    .composite([
      {
        input: Buffer.from(maskSvg),
        blend: "dest-in",
      },
    ])
    .png()
    .toBuffer();

  // Create the full device canvas
  const canvas = await sharp({
    create: {
      width: totalWidth,
      height: totalHeight,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .png()
    .toBuffer();

  // Composite: device frame SVG + masked screenshot
  return sharp(canvas)
    .composite([
      { input: Buffer.from(frameSvg), left: 0, top: 0 },
      { input: maskedScreen, left: bezel.sides, top: bezel.top },
    ])
    .png()
    .toBuffer();
}

// ─── Public API ──────────────────────────────────────────

/**
 * Apply a device frame around the screenshot.
 *
 * Supports browser chrome, iPhone 15 Pro, iPad Pro, and Android generic frames.
 * When disabled or type is "none", returns the original buffer.
 */
export async function applyDeviceFrame(
  frameBuffer: Buffer,
  config: DeviceFrame,
  frameWidth: number,
  frameHeight: number,
  dpr = 1,
): Promise<Buffer> {
  if (!config.enabled || config.type === "none") return frameBuffer;

  switch (config.type) {
    case "browser": {
      const tbarH = TITLE_BAR_HEIGHT * dpr;
      const totalHeight = frameHeight + tbarH;
      const chromeSvg = buildBrowserChromeSvg(frameWidth, config.darkMode, dpr);
      const chromeBuffer = Buffer.from(chromeSvg);

      const canvas = await sharp({
        create: {
          width: frameWidth,
          height: totalHeight,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        },
      })
        .png()
        .toBuffer();

      return sharp(canvas)
        .composite([
          { input: chromeBuffer, left: 0, top: 0 },
          { input: frameBuffer, left: 0, top: tbarH },
        ])
        .png()
        .toBuffer();
    }

    case "iphone":
    case "ipad":
    case "android":
      return applyMobileFrame(frameBuffer, config.type, config.darkMode, frameWidth, frameHeight, dpr);

    default:
      // macbook or unknown — pass through
      return frameBuffer;
  }
}
