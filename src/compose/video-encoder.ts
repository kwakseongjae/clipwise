import gifenc from "gifenc";
const { GIFEncoder, quantize, applyPalette } = gifenc;
import sharp from "sharp";
import { writeFile, mkdir, readFile, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { spawn } from "child_process";
import type { ComposedFrame, OutputConfig } from "../script/types.js";

// ─── Encoding Presets ────────────────────────────────────

const ENCODING_PRESETS = {
  social:   { crf: 25, vtQuality: 40, maxrate: "8M",  bufsize: "16M"  },
  balanced: { crf: 20, vtQuality: 55, maxrate: "12M", bufsize: "24M"  },
  archive:  { crf: 15, vtQuality: 70, maxrate: undefined, bufsize: undefined },
} as const;

type PresetName = keyof typeof ENCODING_PRESETS;
type EncodingParams = typeof ENCODING_PRESETS[PresetName];

/**
 * Resolve encoding parameters from config.
 * If preset is set, use it directly.
 * Otherwise map legacy quality (1-100) to nearest preset.
 */
function resolveEncodingParams(config: OutputConfig): EncodingParams {
  if (config.preset) return ENCODING_PRESETS[config.preset];
  // Backward compat: map quality number to a preset
  process.stderr.write(
    `[clipwise] Deprecation: "quality" is deprecated. Use "preset: social | balanced | archive" instead.\n`,
  );
  if (config.quality >= 75) return ENCODING_PRESETS.social;
  if (config.quality >= 45) return ENCODING_PRESETS.balanced;
  return ENCODING_PRESETS.archive;
}

// ─── Hardware Encoder Detection ──────────────────────────

type VideoEncoder = "h264_videotoolbox" | "libx264";

let encoderDetectionPromise: Promise<VideoEncoder> | null = null;

function detectVideoEncoder(): Promise<VideoEncoder> {
  if (!encoderDetectionPromise) {
    encoderDetectionPromise = new Promise<VideoEncoder>((resolve) => {
      const proc = spawn("ffmpeg", ["-encoders"], {
        stdio: ["ignore", "pipe", "ignore"],
      });
      let out = "";
      proc.stdout.on("data", (d: Buffer) => (out += d.toString()));
      proc.on("close", () => {
        resolve(out.includes("h264_videotoolbox") ? "h264_videotoolbox" : "libx264");
      });
      proc.on("error", () => resolve("libx264"));
    });
  }
  return encoderDetectionPromise;
}

// ─── GIF Encoder ─────────────────────────────────────────

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
  const delay = Math.round(1000 / config.fps);

  for (const frame of frames) {
    const { data, info } = await sharp(frame.buffer)
      .resize(width, height, { fit: "fill" })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const rgba = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    const palette = quantize(rgba, 256);
    const indexed = applyPalette(rgba, palette);

    gif.writeFrame(indexed, width, height, { palette, delay });
  }

  gif.finish();
  return Buffer.from(gif.bytes());
}

// ─── MP4 Encoder ─────────────────────────────────────────

/**
 * Encode a sequence of composed frames into an MP4 buffer.
 *
 * Uses FFmpeg stdin piping (raw video) to eliminate disk I/O overhead.
 * Automatically uses h264_videotoolbox on Apple Silicon/macOS for
 * 5-10x faster encoding; falls back to libx264 on other platforms.
 *
 * Encoding quality is controlled by the output.preset field:
 *   social   — CRF 25 / VT q:v 50 (Twitter/YouTube optimized)
 *   balanced — CRF 20 / VT q:v 65 (general purpose)
 *   archive  — CRF 15 / VT q:v 80 (high-fidelity storage)
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

  const outputPath = join(tmpdir(), `clipwise-${Date.now()}-${Math.random().toString(36).slice(2)}.mp4`);

  try {
    const encoder = await detectVideoEncoder();
    const params = resolveEncodingParams(config);

    await pipeFramesToFfmpeg(frames, config, params, encoder, outputPath);
    return await readFile(outputPath);
  } finally {
    await rm(outputPath, { force: true }).catch(() => {});
  }
}

/**
 * Stream raw video frames to FFmpeg via stdin and encode to a file.
 */
async function pipeFramesToFfmpeg(
  frames: ComposedFrame[],
  config: OutputConfig,
  params: EncodingParams,
  encoder: VideoEncoder,
  outputPath: string,
): Promise<void> {
  const videoArgs =
    encoder === "h264_videotoolbox"
      ? [
          "-c:v", "h264_videotoolbox",
          "-q:v", String(params.vtQuality),
          "-pix_fmt", "yuv420p",
        ]
      : [
          "-c:v", "libx264",
          "-crf", String(params.crf),
          "-preset", "medium",
          "-tune", "stillimage",
          "-profile:v", "high",
          "-level", "4.1",
          "-pix_fmt", "yuv420p",
          ...(params.maxrate
            ? ["-maxrate", params.maxrate, "-bufsize", params.bufsize!]
            : []),
        ];

  return new Promise((resolve, reject) => {
    const ffmpeg = spawn(
      "ffmpeg",
      [
        "-y",
        // Video input: raw RGB24 from stdin
        "-f", "rawvideo",
        "-pixel_format", "rgb24",
        "-video_size", `${config.width}x${config.height}`,
        "-framerate", String(config.fps),
        "-i", "pipe:0",
        // Silent audio track for platform compatibility
        "-f", "lavfi",
        "-i", "anullsrc=r=48000:cl=stereo",
        ...videoArgs,
        "-c:a", "aac",
        "-b:a", "128k",
        "-shortest",
        "-movflags", "+faststart",
        outputPath,
      ],
      { stdio: ["pipe", "ignore", "pipe"] },
    );

    let stderr = "";
    ffmpeg.stderr.on("data", (d: Buffer) => (stderr += d.toString()));

    ffmpeg.on("close", (code) => {
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

    ffmpeg.on("error", (err) => {
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

    // Stream raw frames to stdin
    (async () => {
      for (const frame of frames) {
        const raw = await sharp(frame.buffer)
          .resize(config.width, config.height, { fit: "fill" })
          .flatten({ background: { r: 0, g: 0, b: 0 } })
          .raw()
          .toBuffer();

        // Handle backpressure
        if (!ffmpeg.stdin.write(raw)) {
          await new Promise<void>((r) => ffmpeg.stdin.once("drain", r));
        }
      }
      ffmpeg.stdin.end();
    })().catch(reject);
  });
}

// ─── PNG Sequence ─────────────────────────────────────────

/**
 * Save a sequence of composed frames as individual PNG files.
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
