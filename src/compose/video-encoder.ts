import gifenc from "gifenc";
const { GIFEncoder, quantize, applyPalette } = gifenc;
import sharp from "sharp";
import { writeFile, mkdir, readFile, rm, mkdtemp } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { spawn } from "child_process";
import type { ComposedFrame, OutputConfig } from "../script/types.js";

/**
 * Encode a sequence of composed frames into a GIF buffer.
 * Uses gifenc for encoding and sharp for raw RGBA conversion.
 */
export async function encodeGif(
  frames: ComposedFrame[],
  config: OutputConfig,
): Promise<Buffer> {
  if (frames.length === 0) {
    throw new Error("Cannot encode GIF: no frames provided");
  }

  const width = config.width;
  const height = config.height;
  const gif = GIFEncoder();

  // Frame delay in milliseconds (gifenc uses centiseconds internally)
  const delay = Math.round(1000 / config.fps);

  for (const frame of frames) {
    // Convert frame to raw RGBA pixels at the target dimensions
    const { data, info } = await sharp(frame.buffer)
      .resize(width, height, { fit: "fill" })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const rgba = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);

    // Quantize to 256-color palette
    const palette = quantize(rgba, 256);
    const indexed = applyPalette(rgba, palette);

    gif.writeFrame(indexed, width, height, {
      palette,
      delay,
    });
  }

  gif.finish();

  return Buffer.from(gif.bytes());
}

/**
 * Encode a sequence of composed frames into an MP4 file using ffmpeg.
 * Writes frames as PNG sequence to a temp directory, then runs ffmpeg.
 *
 * Requires ffmpeg to be installed and available in PATH.
 */
export async function encodeMp4(
  frames: ComposedFrame[],
  config: OutputConfig,
): Promise<Buffer> {
  if (frames.length === 0) {
    throw new Error("Cannot encode MP4: no frames provided");
  }

  // Create temp directory for PNG sequence
  const tmpDir = await mkdtemp(join(tmpdir(), "clipwise-"));

  try {
    // Write frames as PNG sequence
    const padLength = String(frames.length).length;
    for (const frame of frames) {
      const paddedIndex = String(frame.index).padStart(padLength, "0");
      const pngBuffer = await sharp(frame.buffer)
        .resize(config.width, config.height, { fit: "fill" })
        .png()
        .toBuffer();
      await writeFile(join(tmpDir, `frame-${paddedIndex}.png`), pngBuffer);
    }

    const outputPath = join(tmpDir, "output.mp4");

    // CRF mapping: quality 100 → CRF 0 (lossless), quality 0 → CRF 51 (worst)
    const crf = Math.round(51 - (config.quality / 100) * 51);

    // Encode with ffmpeg
    await runFfmpeg([
      "-y",
      "-framerate",
      String(config.fps),
      "-i",
      join(tmpDir, `frame-%0${padLength}d.png`),
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-crf",
      String(crf),
      "-preset",
      "slow",
      "-tune",
      "animation",
      "-movflags",
      "+faststart",
      outputPath,
    ]);

    return await readFile(outputPath);
  } finally {
    // Cleanup temp directory
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Run ffmpeg as a child process and return a promise.
 * Throws with stderr output if ffmpeg exits with non-zero code.
 */
function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";

    proc.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(
            `FFmpeg encoding failed (exit code ${code}). ` +
              `Make sure ffmpeg is installed: brew install ffmpeg\n` +
              stderr.slice(-500),
          ),
        );
      }
    });

    proc.on("error", (err) => {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        reject(
          new Error(
            "ffmpeg not found. Install it to encode MP4:\n" +
              "  macOS: brew install ffmpeg\n" +
              "  Ubuntu: sudo apt install ffmpeg\n" +
              "  Windows: choco install ffmpeg",
          ),
        );
      } else {
        reject(err);
      }
    });
  });
}

/**
 * Save a sequence of composed frames as individual PNG files.
 * Returns an array of file paths for the saved images.
 */
export async function savePngSequence(
  frames: ComposedFrame[],
  config: OutputConfig,
): Promise<string[]> {
  if (frames.length === 0) {
    throw new Error("Cannot save PNG sequence: no frames provided");
  }

  const outputDir = join(config.outputDir, config.filename);
  await mkdir(outputDir, { recursive: true });

  const paths: string[] = [];
  const padLength = String(frames.length).length;

  for (const frame of frames) {
    const paddedIndex = String(frame.index).padStart(padLength, "0");
    const filename = `frame-${paddedIndex}.png`;
    const filePath = join(outputDir, filename);

    const pngBuffer = await sharp(frame.buffer)
      .resize(config.width, config.height, { fit: "fill" })
      .png()
      .toBuffer();

    await writeFile(filePath, pngBuffer);
    paths.push(filePath);
  }

  return paths;
}
