import gifenc from "gifenc";
const { GIFEncoder, quantize, applyPalette } = gifenc;
import sharp from "sharp";
import { writeFile, mkdir, readFile, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { spawn } from "child_process";
import type { ComposedFrame, OutputConfig, AudioConfig } from "../script/types.js";

// ─── Encoding Presets ────────────────────────────────────

// Quality-based encoding (content-adaptive VBR) — much more efficient than
// constant bitrate for screen recording where large areas are static.
//   social   → CRF 22 / HEVC q:v 75  (~5-8 MB / 30s)
//   balanced → CRF 18 / HEVC q:v 85  (~10-15 MB / 30s, near macOS quality)
//   archive  → CRF 13 / HEVC q:v 92  (near-lossless, macOS screen recording parity)
// VideoToolbox q:v: higher = better quality / larger file.
// macOS native screen recording ≈ 4-6 Mbps H.264 ≈ 2-3 Mbps HEVC ≈ q:v 85+
const ENCODING_PRESETS = {
  social:   { crf: 22, vtQuality: 75, x264Preset: "medium" as const },
  balanced: { crf: 18, vtQuality: 85, x264Preset: "slow" as const },
  archive:  { crf: 13, vtQuality: 92, x264Preset: "veryslow" as const },
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
type VideoEncoder = "hevc_videotoolbox" | "h264_videotoolbox" | "libx264" | "libsvtav1";

interface AvailableEncoders {
  hevcHw: boolean;
  h264Hw: boolean;
  av1: boolean;
}

let encoderScanPromise: Promise<AvailableEncoders> | null = null;

function scanAvailableEncoders(): Promise<AvailableEncoders> {
  if (!encoderScanPromise) {
    encoderScanPromise = new Promise<AvailableEncoders>((resolve) => {
      const proc = spawn("ffmpeg", ["-encoders"], {
        stdio: ["ignore", "pipe", "ignore"],
      });
      let out = "";
      proc.stdout.on("data", (d: Buffer) => (out += d.toString()));
      proc.on("close", () => {
        resolve({
          hevcHw: out.includes("hevc_videotoolbox"),
          h264Hw: out.includes("h264_videotoolbox"),
          av1: out.includes("libsvtav1"),
        });
      });
      proc.on("error", () => resolve({ hevcHw: false, h264Hw: false, av1: false }));
    });
  }
  return encoderScanPromise;
}

/**
 * Select the best encoder based on codec preference and available encoders.
 *
 * - "auto" (default): hevc_videotoolbox → h264_videotoolbox → libx264
 * - "h264": h264_videotoolbox → libx264
 * - "hevc": hevc_videotoolbox → libx264
 * - "av1": libsvtav1 → libx264 (fallback)
 */
async function detectVideoEncoder(codec: string = "auto"): Promise<VideoEncoder> {
  const avail = await scanAvailableEncoders();

  switch (codec) {
    case "av1":
      return avail.av1 ? "libsvtav1" : "libx264";
    case "hevc":
      return avail.hevcHw ? "hevc_videotoolbox" : "libx264";
    case "h264":
      return avail.h264Hw ? "h264_videotoolbox" : "libx264";
    case "auto":
    default:
      if (avail.hevcHw) return "hevc_videotoolbox";
      if (avail.h264Hw) return "h264_videotoolbox";
      return "libx264";
  }
}

/**
 * Build FFmpeg video encoder arguments for the selected encoder + preset.
 */
function buildVideoArgs(encoder: VideoEncoder, params: EncodingParams): string[] {
  switch (encoder) {
    case "hevc_videotoolbox":
      return [
        "-c:v", "hevc_videotoolbox",
        "-q:v", String(params.vtQuality),
        "-pix_fmt", "p010le",
        "-tag:v", "hvc1",
        "-color_primaries", "bt709",
        "-color_trc", "bt709",
        "-colorspace", "bt709",
      ];
    case "h264_videotoolbox":
      return [
        "-c:v", "h264_videotoolbox",
        "-q:v", String(params.vtQuality),
        "-pix_fmt", "yuv420p",
      ];
    case "libsvtav1":
      return [
        "-c:v", "libsvtav1",
        "-crf", String(params.crf + 12), // AV1 CRF scale differs: +12 ≈ equivalent quality
        "-preset", "6",                  // 6 = good speed/quality balance
        "-svtav1-params", "scm=2",       // Screen Content Mode: optimized for UI/text
        "-pix_fmt", "yuv420p10le",
      ];
    case "libx264":
    default:
      return [
        "-c:v", "libx264",
        "-crf", String(params.crf),
        "-preset", params.x264Preset,
        "-tune", "animation",
        "-profile:v", "high",
        "-level", "4.1",
        "-pix_fmt", "yuv420p",
      ];
  }
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
    const src = frame.rawInfo
      ? sharp(frame.buffer, { raw: { width: frame.rawInfo.width, height: frame.rawInfo.height, channels: frame.rawInfo.channels } })
      : sharp(frame.buffer);
    const { data, info } = await src
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
  audio?: AudioConfig,
): Promise<Buffer> {
  if (frames.length === 0) {
    throw new Error("Cannot encode MP4: no frames provided");
  }

  const outputPath = join(tmpdir(), `clipwise-${Date.now()}-${Math.random().toString(36).slice(2)}.mp4`);

  try {
    const encoder = await detectVideoEncoder(config.codec);
    const params = resolveEncodingParams(config);

    await pipeFramesToFfmpeg(frames, config, params, encoder, outputPath, audio);
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
  audio?: AudioConfig,
): Promise<void> {
  const videoArgs = buildVideoArgs(encoder, params);

  // Audio input: use provided file or silent track
  const audioInputArgs = audio
    ? ["-i", audio.file]
    : ["-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo"];

  // Audio filter: volume + fade
  const audioFilters: string[] = [];
  if (audio) {
    if (audio.volume !== 1.0) audioFilters.push(`volume=${audio.volume}`);
    if (audio.fadeIn > 0) audioFilters.push(`afade=t=in:d=${audio.fadeIn / 1000}`);
    if (audio.fadeOut > 0) audioFilters.push(`afade=t=out:st=999999:d=${audio.fadeOut / 1000}`);
  }
  const audioFilterArgs = audioFilters.length > 0
    ? ["-af", audioFilters.join(",")]
    : [];

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
        // Audio input
        ...audioInputArgs,
        ...videoArgs,
        "-c:a", "aac",
        "-b:a", "128k",
        ...audioFilterArgs,
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

    // Stream raw RGB24 frames to FFmpeg stdin.
    // When rawInfo is set the buffer already contains raw RGBA pixels — skip the
    // PNG decode step and go straight to alpha-flatten + raw extraction.
    (async () => {
      for (const frame of frames) {
        const src = frame.rawInfo
          ? sharp(frame.buffer, { raw: { width: frame.rawInfo.width, height: frame.rawInfo.height, channels: frame.rawInfo.channels } })
          : sharp(frame.buffer);
        const raw = await src
          .flatten({ background: { r: 0, g: 0, b: 0 } })
          .raw()
          .toBuffer();

        if (!ffmpeg.stdin.write(raw)) {
          await new Promise<void>((r) => ffmpeg.stdin.once("drain", r));
        }
      }
      ffmpeg.stdin.end();
    })().catch(reject);
  });
}

// ─── MP4 Streaming Encoder ───────────────────────────────

/**
 * Streaming variant of encodeMp4 — accepts an AsyncIterable so frames can
 * be piped to FFmpeg as they arrive from the composition pipeline,
 * overlapping composition and encoding rather than waiting for all frames.
 */
export async function encodeMp4Stream(
  frames: AsyncIterable<ComposedFrame>,
  config: OutputConfig,
  audio?: AudioConfig,
): Promise<Buffer> {
  const outputPath = join(tmpdir(), `clipwise-${Date.now()}-${Math.random().toString(36).slice(2)}.mp4`);

  try {
    const encoder = await detectVideoEncoder(config.codec);
    const params = resolveEncodingParams(config);
    await pipeStreamToFfmpeg(frames, config, params, encoder, outputPath, audio);
    return await readFile(outputPath);
  } finally {
    await rm(outputPath, { force: true }).catch(() => {});
  }
}

/**
 * Like pipeFramesToFfmpeg but reads from an AsyncIterable —
 * FFmpeg starts encoding immediately as the first frames arrive,
 * without waiting for the full composed array.
 */
async function pipeStreamToFfmpeg(
  frames: AsyncIterable<ComposedFrame>,
  config: OutputConfig,
  params: EncodingParams,
  encoder: VideoEncoder,
  outputPath: string,
  audio?: AudioConfig,
): Promise<void> {
  const videoArgs =
    encoder === "hevc_videotoolbox"
      ? [
          "-c:v", "hevc_videotoolbox",
          "-q:v", String(params.vtQuality),
          "-pix_fmt", "p010le",
          "-tag:v", "hvc1",
          "-color_primaries", "bt709",
          "-color_trc", "bt709",
          "-colorspace", "bt709",
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
          "-preset", params.x264Preset,
          "-tune", "animation",
          "-profile:v", "high",
          "-level", "4.1",
          "-pix_fmt", "yuv420p",
        ];

  // Audio input: use provided file or silent track
  const audioInputArgs = audio
    ? ["-i", audio.file]
    : ["-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo"];

  const audioFilters: string[] = [];
  if (audio) {
    if (audio.volume !== 1.0) audioFilters.push(`volume=${audio.volume}`);
    if (audio.fadeIn > 0) audioFilters.push(`afade=t=in:d=${audio.fadeIn / 1000}`);
    if (audio.fadeOut > 0) audioFilters.push(`afade=t=out:st=999999:d=${audio.fadeOut / 1000}`);
  }
  const audioFilterArgs = audioFilters.length > 0
    ? ["-af", audioFilters.join(",")]
    : [];

  return new Promise((resolve, reject) => {
    const ffmpeg = spawn(
      "ffmpeg",
      [
        "-y",
        "-f", "rawvideo",
        "-pixel_format", "rgb24",
        "-video_size", `${config.width}x${config.height}`,
        "-framerate", String(config.fps),
        "-i", "pipe:0",
        ...audioInputArgs,
        ...videoArgs,
        "-c:a", "aac",
        "-b:a", "128k",
        ...audioFilterArgs,
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

    // `for await` naturally pauses while waiting for the next composed frame,
    // giving FFmpeg time to encode previously received frames in parallel.
    // When rawInfo is set the buffer already contains raw RGBA — skip PNG decode.
    (async () => {
      for await (const frame of frames) {
        const src = frame.rawInfo
          ? sharp(frame.buffer, { raw: { width: frame.rawInfo.width, height: frame.rawInfo.height, channels: frame.rawInfo.channels } })
          : sharp(frame.buffer);
        const raw = await src
          .flatten({ background: { r: 0, g: 0, b: 0 } })
          .raw()
          .toBuffer();

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
