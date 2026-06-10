import sharp from "sharp";
import type { EffectsConfig } from "../script/types.js";

type DeviceFrame = EffectsConfig["deviceFrame"];

// ─── Browser Chrome Constants ────────────────────────────

export const TITLE_BAR_HEIGHT = 48;
const TRAFFIC_LIGHT_RADIUS = 6.5;
const TRAFFIC_LIGHTS_START_X = 22;
const TRAFFIC_LIGHT_GAP = 20;
const URL_PILL_HEIGHT = 30;

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
 * Build an SVG for the browser chrome title bar — macOS Chrome 스타일.
 * traffic lights · 내비게이션 아이콘(뒤로/앞으로/새로고침) · 패드락 URL 필 ·
 * 우측 메뉴/아바타까지 포함한 현실적인 단일 바.
 * All pixel constants are multiplied by dpr for HiDPI rendering.
 */
function buildBrowserChromeSvg(
  width: number,
  darkMode: boolean,
  dpr = 1,
  url = "localhost",
): string {
  const c = darkMode
    ? {
        bgTop: "#3c3c3e", bgBottom: "#343436", border: "#232325",
        pillBg: "#28282a", pillBorder: "#48484b",
        text: "#d8d8da", icon: "#a8a8ac", iconDim: "#5f5f63",
      }
    : {
        bgTop: "#f8f7f6", bgBottom: "#eeedeb", border: "#d8d6d3",
        pillBg: "#ffffff", pillBorder: "#dedcd9",
        text: "#3a3a3c", icon: "#6f6f72", iconDim: "#bdbdc0",
      };

  const h = TITLE_BAR_HEIGHT * dpr;
  const midY = h / 2;
  const tlR = TRAFFIC_LIGHT_RADIUS * dpr;
  const tlStartX = TRAFFIC_LIGHTS_START_X * dpr;
  const tlGap = TRAFFIC_LIGHT_GAP * dpr;
  const s = dpr; // stroke/아이콘 스케일 단위

  // Traffic lights — 미세한 외곽선으로 입체감
  const trafficLights = [
    { cx: tlStartX, fill: "#ff5f57", stroke: "#e0443e" },
    { cx: tlStartX + tlGap, fill: "#febc2e", stroke: "#d89e24" },
    { cx: tlStartX + tlGap * 2, fill: "#28c840", stroke: "#1ea133" },
  ]
    .map((l) => `<circle cx="${l.cx}" cy="${midY}" r="${tlR}" fill="${l.fill}" stroke="${l.stroke}" stroke-width="${0.5 * s}"/>`)
    .join("\n    ");

  // 내비게이션 아이콘: 뒤로(활성) / 앞으로(비활성) / 새로고침
  const navX = tlStartX + tlGap * 2 + 34 * s;
  const back = `<path d="M ${navX + 4 * s} ${midY - 6 * s} l ${-6 * s} ${6 * s} l ${6 * s} ${6 * s}"
      fill="none" stroke="${c.icon}" stroke-width="${1.8 * s}" stroke-linecap="round" stroke-linejoin="round"/>`;
  const fwdX = navX + 28 * s;
  const forward = `<path d="M ${fwdX - 4 * s} ${midY - 6 * s} l ${6 * s} ${6 * s} l ${-6 * s} ${6 * s}"
      fill="none" stroke="${c.iconDim}" stroke-width="${1.8 * s}" stroke-linecap="round" stroke-linejoin="round"/>`;
  const relX = fwdX + 28 * s;
  const reload = `<path d="M ${relX + 6 * s} ${midY - 3.5 * s} a ${6 * s} ${6 * s} 0 1 0 ${1.2 * s} ${5.5 * s}"
      fill="none" stroke="${c.icon}" stroke-width="${1.7 * s}" stroke-linecap="round"/>
    <path d="M ${relX + 6.4 * s} ${midY - 7.5 * s} l ${0.4 * s} ${4.6 * s} l ${-4.6 * s} ${-0.4 * s} z" fill="${c.icon}"/>`;

  // URL 필 — 패드락 + 도메인 (가운데 정렬)
  const fontSize = 12.5 * dpr;
  const pillH = URL_PILL_HEIGHT * dpr;
  const pillW = Math.max(200 * s, Math.min(width * 0.42, 520 * s));
  const pillX = (width - pillW) / 2;
  const pillY = midY - pillH / 2;
  const textW = url.length * fontSize * 0.56;
  const lockX = width / 2 - textW / 2 - 16 * s;
  const lockY = midY - 5 * s;
  const padlock = `
    <rect x="${lockX}" y="${lockY + 4 * s}" width="${9 * s}" height="${7 * s}" rx="${1.5 * s}" fill="${c.icon}"/>
    <path d="M ${lockX + 2 * s} ${lockY + 4 * s} v ${-2 * s} a ${2.5 * s} ${2.5 * s} 0 0 1 ${5 * s} 0 v ${2 * s}"
      fill="none" stroke="${c.icon}" stroke-width="${1.4 * s}"/>`;

  // 우측: 점 메뉴 + 아바타
  const dotsX = width - 26 * s;
  const dots = [-4.5, 0, 4.5]
    .map((dy) => `<circle cx="${dotsX}" cy="${midY + dy * s}" r="${1.6 * s}" fill="${c.icon}"/>`)
    .join("");
  const avatar = `
    <circle cx="${width - 56 * s}" cy="${midY}" r="${11 * s}" fill="url(#cwAvatar)"/>
    <text x="${width - 56 * s}" y="${midY + 4 * s}" text-anchor="middle"
      font-family="system-ui, -apple-system, sans-serif" font-size="${10.5 * dpr}" font-weight="600" fill="#ffffff">S</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${h}">
    <defs>
      <linearGradient id="cwChromeBg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${c.bgTop}"/>
        <stop offset="1" stop-color="${c.bgBottom}"/>
      </linearGradient>
      <linearGradient id="cwAvatar" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#818cf8"/>
        <stop offset="1" stop-color="#6366f1"/>
      </linearGradient>
    </defs>
    <rect width="${width}" height="${h}" fill="url(#cwChromeBg)"/>
    <rect y="${h - s}" width="${width}" height="${s}" fill="${c.border}"/>
    ${trafficLights}
    ${back}
    ${forward}
    ${reload}
    <rect x="${pillX}" y="${pillY}" width="${pillW}" height="${pillH}"
          rx="${pillH / 2}" ry="${pillH / 2}" fill="${c.pillBg}" stroke="${c.pillBorder}" stroke-width="${s}"/>
    ${padlock}
    <text x="${width / 2 + 7 * s}" y="${midY + fontSize * 0.35}" text-anchor="middle"
          font-family="system-ui, -apple-system, sans-serif" font-size="${fontSize}" fill="${c.text}">${url}</text>
    ${dots}
    ${avatar}
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

// ─── Static pre-render helpers ───────────────────────────

/**
 * Pre-rasterize the browser chrome bar SVG to a PNG buffer once per session.
 * Workers reuse this buffer instead of re-generating and rasterizing the SVG
 * for every frame, eliminating one Sharp pipeline invocation per frame.
 */
export async function buildBrowserChromeBuffer(
  viewportWidth: number,
  darkMode: boolean,
  dpr = 1,
  url = "localhost",
): Promise<Buffer> {
  const tbarH = TITLE_BAR_HEIGHT * dpr;
  const chromeSvg = buildBrowserChromeSvg(viewportWidth, darkMode, dpr, url);
  return sharp(Buffer.from(chromeSvg))
    .resize(viewportWidth, tbarH)
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
      const chromeSvg = buildBrowserChromeSvg(frameWidth, config.darkMode, dpr, config.url);
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
