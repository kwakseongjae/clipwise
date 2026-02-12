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
 */
function buildBrowserChromeSvg(
  width: number,
  darkMode: boolean,
): string {
  const bg = darkMode ? "#2d2d2d" : "#e8e8e8";
  const addressBg = darkMode ? "#1a1a1a" : "#ffffff";
  const addressBorder = darkMode ? "#444444" : "#d0d0d0";
  const textColor = darkMode ? "#999999" : "#666666";

  const trafficLights = [
    { cx: TRAFFIC_LIGHTS_START_X, fill: "#ff5f57" },
    { cx: TRAFFIC_LIGHTS_START_X + TRAFFIC_LIGHT_GAP, fill: "#febc2e" },
    { cx: TRAFFIC_LIGHTS_START_X + TRAFFIC_LIGHT_GAP * 2, fill: "#28c840" },
  ]
    .map(
      (light) =>
        `<circle cx="${light.cx}" cy="${TRAFFIC_LIGHT_Y}" r="${TRAFFIC_LIGHT_RADIUS}" fill="${light.fill}"/>`,
    )
    .join("\n    ");

  const addressBarWidth = width - ADDRESS_BAR_MARGIN * 2;
  const addressBarX = ADDRESS_BAR_MARGIN;
  const addressBarY = (TITLE_BAR_HEIGHT - ADDRESS_BAR_HEIGHT) / 2;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${TITLE_BAR_HEIGHT}">
    <rect width="${width}" height="${TITLE_BAR_HEIGHT}" fill="${bg}"/>
    ${trafficLights}
    <rect x="${addressBarX}" y="${addressBarY}" width="${addressBarWidth}" height="${ADDRESS_BAR_HEIGHT}"
          rx="6" ry="6" fill="${addressBg}" stroke="${addressBorder}" stroke-width="1"/>
    <text x="${width / 2}" y="${TRAFFIC_LIGHT_Y + 4}" text-anchor="middle"
          font-family="system-ui, -apple-system, sans-serif" font-size="12" fill="${textColor}">
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
): string {
  const bezelColor = darkMode ? "#1a1a1a" : "#f5f5f7";
  const islandColor = darkMode ? "#000000" : "#1a1a1a";
  const homeBarColor = darkMode ? "#555555" : "#333333";

  const islandX = (totalWidth - IPHONE_ISLAND.width) / 2;
  const islandY = (IPHONE_BEZEL.top - IPHONE_ISLAND.height) / 2 + 4;
  const homeBarX = (totalWidth - IPHONE_HOME_BAR.width) / 2;
  const homeBarY = totalHeight - IPHONE_BEZEL.bottom / 2 - IPHONE_HOME_BAR.height / 2;

  const screenX = IPHONE_BEZEL.sides;
  const screenY = IPHONE_BEZEL.top;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${totalHeight}">
    <!-- Device body -->
    <rect width="${totalWidth}" height="${totalHeight}"
          rx="${IPHONE_OUTER_RADIUS}" ry="${IPHONE_OUTER_RADIUS}" fill="${bezelColor}"/>
    <!-- Screen cutout (transparent) -->
    <rect x="${screenX}" y="${screenY}" width="${screenWidth}" height="${screenHeight}"
          rx="${IPHONE_INNER_RADIUS}" ry="${IPHONE_INNER_RADIUS}" fill="black"/>
    <!-- Dynamic Island pill -->
    <rect x="${islandX}" y="${islandY}" width="${IPHONE_ISLAND.width}" height="${IPHONE_ISLAND.height}"
          rx="${IPHONE_ISLAND.height / 2}" ry="${IPHONE_ISLAND.height / 2}" fill="${islandColor}"/>
    <!-- Home indicator bar -->
    <rect x="${homeBarX}" y="${homeBarY}" width="${IPHONE_HOME_BAR.width}" height="${IPHONE_HOME_BAR.height}"
          rx="${IPHONE_HOME_BAR.height / 2}" ry="${IPHONE_HOME_BAR.height / 2}" fill="${homeBarColor}"/>
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
): string {
  const bezelColor = darkMode ? "#1a1a1a" : "#f5f5f7";
  const cameraColor = darkMode ? "#2a2a2a" : "#3a3a3a";

  const screenX = IPAD_BEZEL.sides;
  const screenY = IPAD_BEZEL.top;
  const cameraCx = totalWidth / 2;
  const cameraCy = IPAD_BEZEL.top / 2;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${totalHeight}">
    <!-- Device body -->
    <rect width="${totalWidth}" height="${totalHeight}"
          rx="${IPAD_OUTER_RADIUS}" ry="${IPAD_OUTER_RADIUS}" fill="${bezelColor}"/>
    <!-- Screen cutout -->
    <rect x="${screenX}" y="${screenY}" width="${screenWidth}" height="${screenHeight}"
          rx="${IPAD_INNER_RADIUS}" ry="${IPAD_INNER_RADIUS}" fill="black"/>
    <!-- Front camera dot -->
    <circle cx="${cameraCx}" cy="${cameraCy}" r="4" fill="${cameraColor}"/>
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
): string {
  const bezelColor = darkMode ? "#1a1a1a" : "#e8e8e8";
  const cameraColor = darkMode ? "#2a2a2a" : "#3a3a3a";

  const screenX = ANDROID_BEZEL.sides;
  const screenY = ANDROID_BEZEL.top;
  const cameraCx = totalWidth / 2;
  const cameraCy = ANDROID_BEZEL.top / 2;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${totalHeight}">
    <!-- Device body -->
    <rect width="${totalWidth}" height="${totalHeight}"
          rx="${ANDROID_OUTER_RADIUS}" ry="${ANDROID_OUTER_RADIUS}" fill="${bezelColor}"/>
    <!-- Screen cutout -->
    <rect x="${screenX}" y="${screenY}" width="${screenWidth}" height="${screenHeight}"
          rx="${ANDROID_INNER_RADIUS}" ry="${ANDROID_INNER_RADIUS}" fill="black"/>
    <!-- Punch-hole camera -->
    <circle cx="${cameraCx}" cy="${cameraCy}" r="${ANDROID_CAMERA_RADIUS}" fill="${cameraColor}"/>
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
): Promise<Buffer> {
  let bezel: BezelConfig;
  let innerRadius: number;

  switch (deviceType) {
    case "iphone":
      bezel = IPHONE_BEZEL;
      innerRadius = IPHONE_INNER_RADIUS;
      break;
    case "ipad":
      bezel = IPAD_BEZEL;
      innerRadius = IPAD_INNER_RADIUS;
      break;
    case "android":
      bezel = ANDROID_BEZEL;
      innerRadius = ANDROID_INNER_RADIUS;
      break;
  }

  const totalWidth = frameWidth + bezel.sides * 2;
  const totalHeight = frameHeight + bezel.top + bezel.bottom;

  // Build the device frame SVG
  let frameSvg: string;
  switch (deviceType) {
    case "iphone":
      frameSvg = buildIPhoneFrameSvg(totalWidth, totalHeight, frameWidth, frameHeight, darkMode);
      break;
    case "ipad":
      frameSvg = buildIPadFrameSvg(totalWidth, totalHeight, frameWidth, frameHeight, darkMode);
      break;
    case "android":
      frameSvg = buildAndroidFrameSvg(totalWidth, totalHeight, frameWidth, frameHeight, darkMode);
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
): Promise<Buffer> {
  if (!config.enabled || config.type === "none") return frameBuffer;

  switch (config.type) {
    case "browser": {
      const totalHeight = frameHeight + TITLE_BAR_HEIGHT;
      const chromeSvg = buildBrowserChromeSvg(frameWidth, config.darkMode);
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
          { input: frameBuffer, left: 0, top: TITLE_BAR_HEIGHT },
        ])
        .png()
        .toBuffer();
    }

    case "iphone":
    case "ipad":
    case "android":
      return applyMobileFrame(frameBuffer, config.type, config.darkMode, frameWidth, frameHeight);

    default:
      // macbook or unknown — pass through
      return frameBuffer;
  }
}
