import sharp from "sharp";
import type { TransitionType } from "../script/types.js";

type RawInfo = { width: number; height: number; channels: 4 };
type TransitionResult = { buffer: Buffer; rawInfo: RawInfo };

// ─── Helpers ──────────────────────────────────────────────

async function decodeToRaw(
  buf: Buffer,
  rawInfo: RawInfo | undefined,
  targetWidth?: number,
  targetHeight?: number,
): Promise<{ data: Buffer; width: number; height: number }> {
  const src = rawInfo
    ? sharp(buf, { raw: { width: rawInfo.width, height: rawInfo.height, channels: rawInfo.channels } })
    : sharp(buf);
  const pipeline = targetWidth && targetHeight
    ? src.resize(targetWidth, targetHeight, { fit: "fill" }).ensureAlpha().raw()
    : src.ensureAlpha().raw();
  const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
  return { data: Buffer.from(data), width: info.width, height: info.height };
}

function returnRaw(buf: Buffer, rawInfo: RawInfo | undefined, w: number, h: number): TransitionResult | null {
  if (rawInfo) return { buffer: buf, rawInfo };
  return null;
}

// ─── Crossfade ────────────────────────────────────────────

/**
 * Apply a crossfade transition between two frame buffers.
 * Uses raw pixel weighted averaging for accurate blending.
 */
export async function applyCrossfade(
  fromBuffer: Buffer,
  toBuffer: Buffer,
  progress: number,
  width: number,
  height: number,
  fromRawInfo?: RawInfo,
  toRawInfo?: RawInfo,
): Promise<TransitionResult> {
  const t = Math.max(0, Math.min(1, progress));

  if (t <= 0) {
    const fast = returnRaw(fromBuffer, fromRawInfo, width, height);
    if (fast) return fast;
    const d = await decodeToRaw(fromBuffer, undefined);
    return { buffer: d.data, rawInfo: { width: d.width, height: d.height, channels: 4 } };
  }
  if (t >= 1) {
    const fast = returnRaw(toBuffer, toRawInfo, width, height);
    if (fast) return fast;
    const d = await decodeToRaw(toBuffer, undefined);
    return { buffer: d.data, rawInfo: { width: d.width, height: d.height, channels: 4 } };
  }

  const from = await decodeToRaw(fromBuffer, fromRawInfo);
  const to = await decodeToRaw(toBuffer, toRawInfo, from.width, from.height);

  const pixels = Buffer.alloc(from.data.length);
  for (let i = 0; i < from.data.length; i++) {
    pixels[i] = Math.round(from.data[i] * (1 - t) + to.data[i] * t);
  }

  return { buffer: pixels, rawInfo: { width: from.width, height: from.height, channels: 4 } };
}

// ─── Slide transitions ────────────────────────────────────

/**
 * Slide transition: the incoming frame slides in from the given direction,
 * pushing the outgoing frame away.
 *
 * @param direction - "left" = new frame enters from left; "up" = from bottom
 */
export async function applySlide(
  fromBuffer: Buffer,
  toBuffer: Buffer,
  progress: number,
  width: number,
  height: number,
  direction: "left" | "up",
  fromRawInfo?: RawInfo,
  toRawInfo?: RawInfo,
): Promise<TransitionResult> {
  const t = Math.max(0, Math.min(1, progress));

  if (t <= 0) {
    const fast = returnRaw(fromBuffer, fromRawInfo, width, height);
    if (fast) return fast;
    const d = await decodeToRaw(fromBuffer, undefined);
    return { buffer: d.data, rawInfo: { width: d.width, height: d.height, channels: 4 } };
  }
  if (t >= 1) {
    const fast = returnRaw(toBuffer, toRawInfo, width, height);
    if (fast) return fast;
    const d = await decodeToRaw(toBuffer, undefined);
    return { buffer: d.data, rawInfo: { width: d.width, height: d.height, channels: 4 } };
  }

  const from = await decodeToRaw(fromBuffer, fromRawInfo);
  const to = await decodeToRaw(toBuffer, toRawInfo, from.width, from.height);

  const w = from.width;
  const h = from.height;
  const pixels = Buffer.alloc(from.data.length);
  const eased = easeInOutCubic(t);

  if (direction === "left") {
    // New frame slides in from left; old frame slides out to right
    const offsetX = Math.round(w * (1 - eased));
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const dstIdx = (y * w + x) * 4;
        const srcX = x + offsetX;
        if (srcX < w) {
          // "to" frame region
          const srcIdx = (y * w + srcX) * 4;
          pixels[dstIdx] = to.data[srcIdx];
          pixels[dstIdx + 1] = to.data[srcIdx + 1];
          pixels[dstIdx + 2] = to.data[srcIdx + 2];
          pixels[dstIdx + 3] = to.data[srcIdx + 3];
        } else {
          // "from" frame region (sliding out)
          const fromX = srcX - w;
          if (fromX < w) {
            const srcIdx = (y * w + fromX) * 4;
            pixels[dstIdx] = from.data[srcIdx];
            pixels[dstIdx + 1] = from.data[srcIdx + 1];
            pixels[dstIdx + 2] = from.data[srcIdx + 2];
            pixels[dstIdx + 3] = from.data[srcIdx + 3];
          }
        }
      }
    }
  } else {
    // "up": new frame slides in from bottom; old frame slides out to top
    const offsetY = Math.round(h * (1 - eased));
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const dstIdx = (y * w + x) * 4;
        const srcY = y + offsetY;
        if (srcY < h) {
          const srcIdx = (srcY * w + x) * 4;
          pixels[dstIdx] = to.data[srcIdx];
          pixels[dstIdx + 1] = to.data[srcIdx + 1];
          pixels[dstIdx + 2] = to.data[srcIdx + 2];
          pixels[dstIdx + 3] = to.data[srcIdx + 3];
        } else {
          const fromY = srcY - h;
          if (fromY < h) {
            const srcIdx = (fromY * w + x) * 4;
            pixels[dstIdx] = from.data[srcIdx];
            pixels[dstIdx + 1] = from.data[srcIdx + 1];
            pixels[dstIdx + 2] = from.data[srcIdx + 2];
            pixels[dstIdx + 3] = from.data[srcIdx + 3];
          }
        }
      }
    }
  }

  return { buffer: pixels, rawInfo: { width: w, height: h, channels: 4 } };
}

// ─── Blur transition ──────────────────────────────────────

/**
 * Blur transition: outgoing frame blurs out while incoming frame fades in.
 * Combines a Gaussian blur on the "from" frame with crossfade to "to".
 */
export async function applyBlur(
  fromBuffer: Buffer,
  toBuffer: Buffer,
  progress: number,
  width: number,
  height: number,
  fromRawInfo?: RawInfo,
  toRawInfo?: RawInfo,
): Promise<TransitionResult> {
  const t = Math.max(0, Math.min(1, progress));

  if (t <= 0) {
    const fast = returnRaw(fromBuffer, fromRawInfo, width, height);
    if (fast) return fast;
    const d = await decodeToRaw(fromBuffer, undefined);
    return { buffer: d.data, rawInfo: { width: d.width, height: d.height, channels: 4 } };
  }
  if (t >= 1) {
    const fast = returnRaw(toBuffer, toRawInfo, width, height);
    if (fast) return fast;
    const d = await decodeToRaw(toBuffer, undefined);
    return { buffer: d.data, rawInfo: { width: d.width, height: d.height, channels: 4 } };
  }

  // Blur the "from" frame proportional to progress (sigma 0→20)
  const sigma = t * 20;
  const fromSrc = fromRawInfo
    ? sharp(fromBuffer, { raw: { width: fromRawInfo.width, height: fromRawInfo.height, channels: fromRawInfo.channels } })
    : sharp(fromBuffer);
  const blurredFrom = await fromSrc
    .blur(Math.max(0.3, sigma))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const to = await decodeToRaw(toBuffer, toRawInfo, blurredFrom.info.width, blurredFrom.info.height);

  // Crossfade between blurred "from" and sharp "to"
  const pixels = Buffer.alloc(blurredFrom.data.length);
  for (let i = 0; i < blurredFrom.data.length; i++) {
    pixels[i] = Math.round(blurredFrom.data[i] * (1 - t) + to.data[i] * t);
  }

  return {
    buffer: pixels,
    rawInfo: { width: blurredFrom.info.width, height: blurredFrom.info.height, channels: 4 },
  };
}

// ─── Dispatcher ───────────────────────────────────────────

/**
 * Apply any transition type between two frame buffers.
 */
export async function applyTransition(
  type: TransitionType,
  fromBuffer: Buffer,
  toBuffer: Buffer,
  progress: number,
  width: number,
  height: number,
  fromRawInfo?: RawInfo,
  toRawInfo?: RawInfo,
): Promise<TransitionResult> {
  switch (type) {
    case "fade":
      return applyCrossfade(fromBuffer, toBuffer, progress, width, height, fromRawInfo, toRawInfo);
    case "slide-left":
      return applySlide(fromBuffer, toBuffer, progress, width, height, "left", fromRawInfo, toRawInfo);
    case "slide-up":
      return applySlide(fromBuffer, toBuffer, progress, width, height, "up", fromRawInfo, toRawInfo);
    case "blur":
      return applyBlur(fromBuffer, toBuffer, progress, width, height, fromRawInfo, toRawInfo);
    case "none":
    default:
      // Should not be called for "none", but handle gracefully
      const d = await decodeToRaw(toBuffer, toRawInfo);
      return { buffer: d.data, rawInfo: { width: d.width, height: d.height, channels: 4 } };
  }
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
