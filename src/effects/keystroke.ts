import sharp from "sharp";
import type { EffectsConfig, KeystrokeEvent } from "../script/types.js";
import type { OverlayDescriptor } from "./cursor.js";

type KeystrokeConfig = EffectsConfig["keystroke"];

/** Escape XML entities for safe SVG text embedding. */
function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * CJK / full-width 문자 여부 판별.
 * 한글, 한자, 일본어 가나, full-width 기호 등은 monospace에서 약 1.7배 폭을 차지.
 */
function isCJK(ch: string): boolean {
  const code = ch.codePointAt(0) ?? 0;
  return (
    (code >= 0x1100 && code <= 0x11FF) ||   // 한글 자모
    (code >= 0x2E80 && code <= 0x9FFF) ||   // CJK 부수, 한자
    (code >= 0xAC00 && code <= 0xD7AF) ||   // 한글 음절
    (code >= 0xF900 && code <= 0xFAFF) ||   // CJK 호환 한자
    (code >= 0xFE30 && code <= 0xFE4F) ||   // CJK 호환 형태
    (code >= 0xFF00 && code <= 0xFFEF) ||   // Full-width 문자
    (code >= 0x3000 && code <= 0x30FF) ||   // CJK 기호, 히라가나, 가타카나
    (code >= 0x31F0 && code <= 0x31FF) ||   // 가타카나 확장
    (code >= 0x20000 && code <= 0x2FA1F)    // CJK 확장 (서로게이트)
  );
}

/** 문자열의 표시 폭을 charWidth 단위로 계산 (CJK = 1.7배). */
function displayWidth(text: string): number {
  let w = 0;
  for (const ch of text) {
    w += isCJK(ch) ? 1.7 : 1;
  }
  return w;
}

/** 표시 폭 기준으로 텍스트를 여러 줄로 래핑. */
function wrapText(text: string, maxWidth: number): string[] {
  if (displayWidth(text) <= maxWidth) return [text];

  const lines: string[] = [];
  let current = "";
  let currentWidth = 0;

  for (const ch of text) {
    const chWidth = isCJK(ch) ? 1.7 : 1;
    if (currentWidth + chWidth > maxWidth && current.length > 0) {
      lines.push(current);
      current = ch;
      currentWidth = chWidth;
    } else {
      current += ch;
      currentWidth += chWidth;
    }
  }
  if (current.length > 0) lines.push(current);
  return lines;
}

/**
 * Group keystrokes by sessionId and return the accumulated text per session,
 * sorted oldest→newest.  When sessionId is absent (legacy recordings), treat
 * the entire keystroke array as a single session.
 */
function buildSessions(keystrokes: KeystrokeEvent[]): string[] {
  const hasSessionIds = keystrokes.some((k) => k.sessionId !== undefined);

  if (!hasSessionIds) {
    const text = keystrokes.map((k) => k.key).join("");
    return text.length > 0 ? [text] : [];
  }

  const map = new Map<number, string>();
  for (const k of keystrokes) {
    const sid = k.sessionId ?? 0;
    map.set(sid, (map.get(sid) ?? "") + k.key);
  }

  // Sort by session ID (ascending = chronological order)
  return Array.from(map.entries())
    .sort(([a], [b]) => a - b)
    .map(([, text]) => text)
    .filter((t) => t.length > 0);
}

/**
 * Render a keystroke HUD overlay on the frame.
 *
 * showTyping: false (default, industry standard)
 *   No typing text is shown — consistent with Screen Studio, KeyCastr, and
 *   ScreenFlow which hide regular typing by default.
 *
 * showTyping: true
 *   Multi-session rolling HUD.  Each `type` action (= each input field) gets
 *   its own line.  Up to 3 recent sessions are shown simultaneously, oldest
 *   at the top and dimmed, newest at the bottom at full brightness.  Lines
 *   that are too long to fit are truncated from the left (showing the most
 *   recently typed characters).  The HUD fades `fadeAfter` ms after the last
 *   keystroke of the last session.
 */
export async function renderKeystrokeHud(
  frameBuffer: Buffer,
  keystrokes: KeystrokeEvent[],
  frameTimestamp: number,
  config: KeystrokeConfig,
  frameWidth: number,
  frameHeight: number,
  dpr = 1,
): Promise<Buffer> {
  if (!config.enabled || keystrokes.length === 0) return frameBuffer;

  // Industry standard: hide regular typing unless explicitly requested.
  if (!config.showTyping) return frameBuffer;

  // Fade the HUD based on time since the last keystroke.
  const lastKeystroke = keystrokes[keystrokes.length - 1];
  const age = frameTimestamp - lastKeystroke.timestamp;
  if (age >= config.fadeAfter) return frameBuffer;

  const fadeStart = config.fadeAfter * 0.6;
  const globalOpacity =
    age > fadeStart
      ? Math.max(0, 1 - (age - fadeStart) / (config.fadeAfter - fadeStart))
      : 1;
  if (globalOpacity <= 0) return frameBuffer;

  // Build per-session accumulated text, take the last 3 sessions
  const allSessions = buildSessions(keystrokes);
  if (allSessions.length === 0) return frameBuffer;
  const sessions = allSessions.slice(-3);   // oldest→newest, max 3
  const lineCount = sessions.length;

  // Scale pixel values by dpr for HiDPI
  const fontSize    = config.fontSize * dpr;
  const padding     = config.padding * dpr;
  const hudPadH     = padding * 2;       // horizontal padding inside box
  const hudPadV     = padding * 1.4;     // vertical padding inside box
  const lineGap     = Math.round(fontSize * 0.45);  // gap between lines

  // Approximate monospace character width
  const charWidth = fontSize * 0.615;
  const maxHudWidth = frameWidth - 60 * dpr;
  const maxDisplayWidth = Math.max(10, (maxHudWidth - hudPadH * 2) / charWidth);

  // 세션별 텍스트를 display width 기준으로 줄바꿈
  const wrappedLines: { text: string; sessionIdx: number }[] = [];
  sessions.forEach((text, sIdx) => {
    const wrapped = wrapText(text, maxDisplayWidth);
    for (const line of wrapped) {
      wrappedLines.push({ text: line, sessionIdx: sIdx });
    }
  });

  const lines = wrappedLines.map((l) => l.text);
  const totalLineCount = lines.length;

  // HUD dimensions based on the widest line (display width 기준)
  const maxLineDisplayWidth = Math.max(...lines.map((l) => displayWidth(l)));
  const hudWidth   = Math.min(
    Math.ceil(maxLineDisplayWidth * charWidth) + hudPadH * 2,
    maxHudWidth,
  );
  const hudHeight  =
    Math.ceil(fontSize * totalLineCount + lineGap * (totalLineCount - 1) + hudPadV * 2);

  // Positioning
  const margin = 30 * dpr;
  const hudY   = frameHeight - hudHeight - margin;
  let hudX: number;
  switch (config.position) {
    case "bottom-left":  hudX = margin; break;
    case "bottom-right": hudX = frameWidth - hudWidth - margin; break;
    case "bottom-center":
    default:             hudX = Math.round((frameWidth - hudWidth) / 2);
  }

  // Per-line opacity: 세션 기준으로 oldest→newest 시각적 위계
  const SESSION_OPACITY_FACTORS = [0.45, 0.70, 1.0];
  const sessionOpacities = SESSION_OPACITY_FACTORS.slice(-lineCount);

  const rx = (8 * dpr).toFixed(1);
  const boxOp = (globalOpacity * 0.92).toFixed(3);

  const textX    = hudX + hudPadH;
  const baselineY = hudY + hudPadV + fontSize * 0.82;

  const textElements = wrappedLines
    .map(({ text, sessionIdx }, i) => {
      const sessionPos = sessions.length <= 3 ? sessionIdx : sessionIdx - (sessions.length - 3);
      const opFactor   = sessionOpacities[Math.max(0, sessionPos)] ?? 1;
      const op         = (globalOpacity * opFactor).toFixed(3);
      const lineY      = baselineY + i * (fontSize + lineGap);
      return `<text x="${textX}" y="${lineY}"
          font-family="monospace, Menlo, Consolas" font-size="${fontSize}"
          fill="${config.textColor}" opacity="${op}">${escapeXml(text)}</text>`;
    })
    .join("\n    ");

  const hudSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${frameWidth}" height="${frameHeight}" shape-rendering="geometricPrecision" text-rendering="geometricPrecision">
    <rect x="${hudX}" y="${hudY}" width="${hudWidth}" height="${hudHeight}"
          rx="${rx}" ry="${rx}" fill="${config.backgroundColor}" opacity="${boxOp}" />
    ${textElements}
  </svg>`;

  return sharp(frameBuffer)
    .composite([{ input: Buffer.from(hudSvg), left: 0, top: 0 }])
    .png()
    .toBuffer();
}

/**
 * Build a keystroke HUD overlay descriptor without applying it to a frame.
 * Returns null when the HUD should not be shown (disabled, no keystrokes, faded out).
 */
export function buildKeystrokeOverlay(
  keystrokes: KeystrokeEvent[],
  frameTimestamp: number,
  config: KeystrokeConfig,
  frameWidth: number,
  frameHeight: number,
  dpr = 1,
): OverlayDescriptor | null {
  if (!config.enabled || keystrokes.length === 0) return null;
  if (!config.showTyping) return null;

  const lastKeystroke = keystrokes[keystrokes.length - 1];
  const age = frameTimestamp - lastKeystroke.timestamp;
  if (age >= config.fadeAfter) return null;

  const fadeStart = config.fadeAfter * 0.6;
  const globalOpacity =
    age > fadeStart
      ? Math.max(0, 1 - (age - fadeStart) / (config.fadeAfter - fadeStart))
      : 1;
  if (globalOpacity <= 0) return null;

  const allSessions = buildSessions(keystrokes);
  if (allSessions.length === 0) return null;
  const sessions = allSessions.slice(-3);
  const lineCount = sessions.length;

  const fontSize    = config.fontSize * dpr;
  const padding     = config.padding * dpr;
  const hudPadH     = padding * 2;
  const hudPadV     = padding * 1.4;
  const lineGap     = Math.round(fontSize * 0.45);

  const charWidth = fontSize * 0.615;
  const maxHudWidth = frameWidth - 60 * dpr;
  const maxDisplayWidth = Math.max(10, (maxHudWidth - hudPadH * 2) / charWidth);

  const wrappedLines: { text: string; sessionIdx: number }[] = [];
  sessions.forEach((text, sIdx) => {
    const wrapped = wrapText(text, maxDisplayWidth);
    for (const line of wrapped) {
      wrappedLines.push({ text: line, sessionIdx: sIdx });
    }
  });

  const lines = wrappedLines.map((l) => l.text);
  const totalLineCount = lines.length;

  const maxLineDisplayWidth = Math.max(...lines.map((l) => displayWidth(l)));
  const hudWidth   = Math.min(
    Math.ceil(maxLineDisplayWidth * charWidth) + hudPadH * 2,
    maxHudWidth,
  );
  const hudHeight  =
    Math.ceil(fontSize * totalLineCount + lineGap * (totalLineCount - 1) + hudPadV * 2);

  const margin = 30 * dpr;
  const hudY   = frameHeight - hudHeight - margin;
  let hudX: number;
  switch (config.position) {
    case "bottom-left":  hudX = margin; break;
    case "bottom-right": hudX = frameWidth - hudWidth - margin; break;
    case "bottom-center":
    default:             hudX = Math.round((frameWidth - hudWidth) / 2);
  }

  const SESSION_OPACITY_FACTORS = [0.45, 0.70, 1.0];
  const sessionOpacities = SESSION_OPACITY_FACTORS.slice(-lineCount);

  const rx = (8 * dpr).toFixed(1);
  const boxOp = (globalOpacity * 0.92).toFixed(3);

  const textX    = hudX + hudPadH;
  const baselineY = hudY + hudPadV + fontSize * 0.82;

  const textElements = wrappedLines
    .map(({ text, sessionIdx }, i) => {
      const sessionPos = sessions.length <= 3 ? sessionIdx : sessionIdx - (sessions.length - 3);
      const opFactor   = sessionOpacities[Math.max(0, sessionPos)] ?? 1;
      const op         = (globalOpacity * opFactor).toFixed(3);
      const lineY      = baselineY + i * (fontSize + lineGap);
      return `<text x="${textX}" y="${lineY}"
          font-family="monospace, Menlo, Consolas" font-size="${fontSize}"
          fill="${config.textColor}" opacity="${op}">${escapeXml(text)}</text>`;
    })
    .join("\n    ");

  const hudSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${frameWidth}" height="${frameHeight}" shape-rendering="geometricPrecision" text-rendering="geometricPrecision">
    <rect x="${hudX}" y="${hudY}" width="${hudWidth}" height="${hudHeight}"
          rx="${rx}" ry="${rx}" fill="${config.backgroundColor}" opacity="${boxOp}" />
    ${textElements}
  </svg>`;

  return { input: Buffer.from(hudSvg), left: 0, top: 0 };
}
