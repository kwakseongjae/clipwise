import sharp from "sharp";

/**
 * Apply a crossfade transition between two frame buffers.
 * Uses raw pixel weighted averaging for accurate blending.
 *
 * @param fromBuffer - The outgoing frame
 * @param toBuffer   - The incoming frame
 * @param progress   - 0 = fully "from", 1 = fully "to"
 * @param width      - Frame width
 * @param height     - Frame height
 */
export async function applyCrossfade(
  fromBuffer: Buffer,
  toBuffer: Buffer,
  progress: number,
  width: number,
  height: number,
): Promise<Buffer> {
  const t = Math.max(0, Math.min(1, progress));

  // At extremes, skip blending
  if (t <= 0) return fromBuffer;
  if (t >= 1) return toBuffer;

  // Decode both frames to raw RGBA pixels
  const fromRaw = await sharp(fromBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const toRaw = await sharp(toBuffer)
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

  return sharp(pixels, {
    raw: {
      width: fromRaw.info.width,
      height: fromRaw.info.height,
      channels: 4,
    },
  })
    .png()
    .toBuffer();
}
