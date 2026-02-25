import gifenc from "gifenc";
const { GIFEncoder, quantize, applyPalette } = gifenc;
import sharp from "sharp";
import { writeFile, mkdir, readFile, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { spawn } from "child_process";
import type { ComposedFrame, OutputConfig } from "../script/types.js";

// ─── Encoding Presets ────────────────────────────────────

// Quality-based encoding (content-adaptive VBR) — much more efficient than
// constant bitrate for screen recording where large areas are static.
//   social   → CRF 22 / HEVC q:v 75  (~5-8 MB / 30s)
//   balanced → CRF 18 / HEVC q:v 85  (~10-15 MB / 30s, near macOS quality)
//   archive  → CRF 13 / HEVC q:v 92  (near-lossless, macOS screen recording parity)
// VideoToolbox q:v: higher = better quality / larger file.
// macOS native screen recording ≈ 4-6 Mbps H.264 ≈ 2-3 Mbps HEVC ≈ q:v 85+
const ENCODING_PRESETS = {
  social:   { crf: 22, vtQuality: 75 },
  balanced: { crf: 18, vtQuality: 85 },
  archive:  { crf: 13, vtQuality: 92 },
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

// Priority: hevc_videotoolbox (macOS HEVC HW) > h264_videotoolbox (macOS H.264 HW) > libx264 (SW)
type VideoEncoder = "hevc_videotoolbox" | "h264_videotoolbox" | "libx264";

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
        if (out.includes("hevc_videotoolbox")) resolve("hevc_videotoolbox");
        else if (out.includes("h264_videotoolbox")) resolve("h264_videotoolbox");
        else resolve("libx264");
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
 * Encoder priority: hevc_videotoolbox (macOS HEVC HW) → h264_videotoolbox
 * (macOS H.264 HW) → libx264 (software fallback).
 *
 * Encoding quality is controlled by the output.preset field:
 *   social   — screen-recording quality, ~2–4 MB / 30s
 *   balanced — high fidelity, ~4–8 MB / 30s
 *   archive  — near-lossless, uncapped bitrate
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
    encoder === "hevc_videotoolbox"
      ? [
          "-c:v", "hevc_videotoolbox",
          "-q:v", String(params.vtQuality),
          "-pix_fmt", "yuv420p",
          "-tag:v", "hvc1",   // required for playback in QuickTime / Apple devices
        ]
      : encoder === "h264_videotoolbox"
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

    // Stream raw frames to stdin.
    // No resize needed here — compose pipeline already outputs at config.width × config.height.
    (async () => {
      for (const frame of frames) {
        const raw = await sharp(frame.buffer)
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
