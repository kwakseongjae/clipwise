import sharp from "sharp";

type RawInfo = { width: number; height: number; channels: 4 };

/**
 * Apply a crossfade transition between two frame buffers.
 * Uses raw pixel weighted averaging for accurate blending.
 *
 * @param fromBuffer  - The outgoing frame (PNG or raw RGBA)
 * @param toBuffer    - The incoming frame (PNG or raw RGBA)
 * @param progress    - 0 = fully "from", 1 = fully "to"
 * @param width       - Frame width
 * @param height      - Frame height
 * @param fromRawInfo - Pass when fromBuffer is raw RGBA
 * @param toRawInfo   - Pass when toBuffer is raw RGBA
 */
export async function applyCrossfade(
  fromBuffer: Buffer,
  toBuffer: Buffer,
  progress: number,
  width: number,
  height: number,
  fromRawInfo?: RawInfo,
  toRawInfo?: RawInfo,
): Promise<{ buffer: Buffer; rawInfo: RawInfo }> {
  const t = Math.max(0, Math.min(1, progress));

  // At extremes, skip blending
  if (t <= 0) {
    const rawInfo = fromRawInfo ?? { width, height, channels: 4 as const };
    if (fromRawInfo) return { buffer: fromBuffer, rawInfo };
    const { data, info } = await sharp(fromBuffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    return { buffer: Buffer.from(data), rawInfo: { width: info.width, height: info.height, channels: 4 } };
  }
  if (t >= 1) {
    const rawInfo = toRawInfo ?? { width, height, channels: 4 as const };
    if (toRawInfo) return { buffer: toBuffer, rawInfo };
    const { data, info } = await sharp(toBuffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    return { buffer: Buffer.from(data), rawInfo: { width: info.width, height: info.height, channels: 4 } };
  }

  // Decode both frames to raw RGBA pixels
  const fromSrc = fromRawInfo
    ? sharp(fromBuffer, { raw: { width: fromRawInfo.width, height: fromRawInfo.height, channels: fromRawInfo.channels } })
    : sharp(fromBuffer);
  const fromRaw = await fromSrc.ensureAlpha().raw().toBuffer({ resolveWithObject: true });

  const toSrc = toRawInfo
    ? sharp(toBuffer, { raw: { width: toRawInfo.width, height: toRawInfo.height, channels: toRawInfo.channels } })
    : sharp(toBuffer);
  const toRaw = await toSrc
    .resize(fromRaw.info.width, fromRaw.info.height, { fit: "fill" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Weighted average of each pixel channel
  const pixels = Buffer.alloc(fromRaw.data.length);
  for (let i = 0; i < fromRaw.data.length; i++) {
    pixels[i] = Math.round(
      fromRaw.data[i] * (1 - t) + toRaw.data[i] * t,
    );
  }

  return {
    buffer: pixels,
    rawInfo: { width: fromRaw.info.width, height: fromRaw.info.height, channels: 4 },
  };
}
