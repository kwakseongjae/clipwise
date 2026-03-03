import { z } from "zod";

// ─── Selector Validation ────────────────────────────────

const SafeSelectorSchema = z
  .string()
  .min(1, "Selector must not be empty")
  .regex(
    /^[^\x00-\x1f\x7f;`\\{}]+$/,
    "Selector contains invalid characters (control chars, semicolons, backticks, or backslashes are not allowed)"
  );

// ─── Step Actions ───────────────────────────────────────

export const NavigateActionSchema = z.object({
  action: z.literal("navigate"),
  url: z.string().min(1),
  waitUntil: z
    .enum(["load", "domcontentloaded", "networkidle"])
    .default("networkidle"),
});

export const ClickActionSchema = z.object({
  action: z.literal("click"),
  selector: SafeSelectorSchema,
  delay: z.number().optional(),
  timeout: z.number().min(0).optional(),
});

export const TypeActionSchema = z.object({
  action: z.literal("type"),
  selector: SafeSelectorSchema,
  text: z.string(),
  delay: z.number().default(50),
  timeout: z.number().min(0).optional(),
});

export const ScrollActionSchema = z.object({
  action: z.literal("scroll"),
  selector: SafeSelectorSchema.optional(),
  y: z.number().default(0),
  x: z.number().default(0),
  smooth: z.boolean().default(true),
  timeout: z.number().min(0).optional(),
});

export const WaitActionSchema = z.object({
  action: z.literal("wait"),
  duration: z.number().describe("Wait duration in milliseconds"),
});

export const HoverActionSchema = z.object({
  action: z.literal("hover"),
  selector: SafeSelectorSchema,
  timeout: z.number().min(0).optional(),
});

export const ScreenshotActionSchema = z.object({
  action: z.literal("screenshot"),
  name: z.string().optional(),
  fullPage: z.boolean().default(false),
});

export const WaitForSelectorActionSchema = z.object({
  action: z.literal("waitForSelector"),
  selector: SafeSelectorSchema,
  state: z.enum(["visible", "attached", "hidden"]).default("visible"),
  timeout: z.number().min(0).default(15000),
});

export const WaitForNavigationActionSchema = z.object({
  action: z.literal("waitForNavigation"),
  waitUntil: z.enum(["load", "domcontentloaded", "networkidle"]).default("networkidle"),
  timeout: z.number().min(0).default(15000),
});

export const WaitForURLActionSchema = z.object({
  action: z.literal("waitForURL"),
  url: z.string().min(1),
  timeout: z.number().min(0).default(15000),
});

export const WaitForFunctionActionSchema = z.object({
  action: z.literal("waitForFunction"),
  expression: z.string().min(1),
  polling: z.union([z.literal("raf"), z.number().min(0)]).default("raf"),
  timeout: z.number().min(0).default(30000),
});

export const WaitForResponseActionSchema = z.object({
  action: z.literal("waitForResponse"),
  url: z.string().min(1),
  status: z.number().min(100).max(599).optional(),
  timeout: z.number().min(0).default(30000),
});

export const StepActionSchema = z.discriminatedUnion("action", [
  NavigateActionSchema,
  ClickActionSchema,
  TypeActionSchema,
  ScrollActionSchema,
  WaitActionSchema,
  HoverActionSchema,
  ScreenshotActionSchema,
  WaitForSelectorActionSchema,
  WaitForNavigationActionSchema,
  WaitForURLActionSchema,
  WaitForFunctionActionSchema,
  WaitForResponseActionSchema,
]);

export type StepAction = z.infer<typeof StepActionSchema>;

// ─── Effects Configuration ──────────────────────────────

/**
 * Preset zoom intensity levels — see ZoomIntensity in effects/zoom.ts for scale values.
 * When set, overrides the numeric `scale` field.
 *
 * subtle   1.15x  — barely noticeable; dense UIs, large viewports
 * light    1.25x  — Loom-style gentle pull-in (recommended for most demos)
 * moderate 1.35x  — balanced default; Camtasia-range
 * strong   1.5x   — clear focus, some peripheral context sacrificed
 * dramatic 1.8x   — maximum emphasis; simple/sparse UIs only
 */
export const ZoomIntensitySchema = z.enum([
  "subtle",
  "light",
  "moderate",
  "strong",
  "dramatic",
]);

export type ZoomIntensity = z.infer<typeof ZoomIntensitySchema>;

export const AutoZoomConfigSchema = z.object({
  followCursor: z.boolean().default(true),
  /** @deprecated Use `intensity` on the parent zoom config instead. */
  maxScale: z.number().min(1).max(5).default(1.35),
  transitionDuration: z.number().default(400),
  padding: z.number().default(200),
});

export const ZoomEffectSchema = z.object({
  enabled: z.boolean().default(true),
  /**
   * Numeric zoom scale (1.0 = no zoom).  Overridden by `intensity` when set.
   * Default lowered from 1.8 → 1.35 to match "moderate" intensity.
   */
  scale: z.number().min(1).max(5).default(1.35),
  /**
   * Intensity preset — overrides `scale` when set.
   * Calibrated against Loom (light≈1.25x) and Camtasia (moderate≈1.35x).
   */
  intensity: ZoomIntensitySchema.optional(),
  duration: z.number().default(600),
  easing: z
    .enum(["ease-in-out", "ease-in", "ease-out", "linear"])
    .default("ease-in-out"),
  autoZoom: AutoZoomConfigSchema.default({}),
});

export const CursorEffectSchema = z.object({
  enabled: z.boolean().default(true),
  size: z.number().default(20),
  color: z.string().default("#000000"),
  speed: z.enum(["fast", "normal", "slow"]).default("fast"),
  smoothing: z.boolean().default(true),
  clickEffect: z.boolean().default(true),
  clickColor: z.string().default("rgba(59, 130, 246, 0.3)"),
  clickRadius: z.number().default(30),
  trail: z.boolean().default(false),
  trailLength: z.number().default(8),
  trailColor: z.string().default("rgba(59, 130, 246, 0.2)"),
  highlight: z.boolean().default(false),
  highlightRadius: z.number().default(40),
  highlightColor: z.string().default("rgba(255, 215, 0, 0.18)"),
});

export const BackgroundSchema = z.object({
  type: z.enum(["gradient", "solid", "image"]).default("gradient"),
  value: z
    .string()
    .default("linear-gradient(135deg, #667eea 0%, #764ba2 100%)"),
  padding: z.number().default(60),
  borderRadius: z.number().default(12),
  shadow: z.boolean().default(true),
});

export const DeviceFrameSchema = z.object({
  enabled: z.boolean().default(false),
  type: z.enum(["browser", "macbook", "iphone", "ipad", "android", "none"]).default("browser"),
  darkMode: z.boolean().default(false),
});

export const SpeedRampConfigSchema = z.object({
  enabled: z.boolean().default(false),
  idleSpeed: z.number().min(0.5).max(8).default(3.0),
  actionSpeed: z.number().min(0.25).max(2).default(0.8),
  transitionFrames: z.number().default(15),
});

export const KeystrokeConfigSchema = z.object({
  enabled: z.boolean().default(false),
  /**
   * Show regular typed text (alphabetic/numeric characters) in the HUD.
   *
   * Industry default is false — Screen Studio, KeyCastr, and ScreenFlow all
   * hide regular typing by default, showing only modifier+key shortcuts.
   * Typed content is already visible inside the focused input element, so
   * displaying it again in the HUD is redundant and creates overflow issues.
   *
   * Set to true to display a 2-line rolling HUD that follows the typed text.
   */
  showTyping: z.boolean().default(false),
  position: z.enum(["bottom-center", "bottom-left", "bottom-right"]).default("bottom-center"),
  fontSize: z.number().default(18),
  backgroundColor: z.string().default("rgba(0, 0, 0, 0.75)"),
  textColor: z.string().default("#ffffff"),
  padding: z.number().default(8),
  fadeAfter: z.number().default(1500),
});

export const WatermarkConfigSchema = z.object({
  enabled: z.boolean().default(false),
  text: z.string().default(""),
  position: z.enum(["top-left", "top-right", "bottom-left", "bottom-right"]).default("bottom-right"),
  opacity: z.number().min(0).max(1).default(0.5),
  fontSize: z.number().default(14),
  color: z.string().default("#ffffff"),
});

export const EffectsConfigSchema = z.object({
  zoom: ZoomEffectSchema.default({}),
  cursor: CursorEffectSchema.default({}),
  background: BackgroundSchema.default({}),
  deviceFrame: DeviceFrameSchema.default({}),
  speedRamp: SpeedRampConfigSchema.default({}),
  keystroke: KeystrokeConfigSchema.default({}),
  watermark: WatermarkConfigSchema.default({}),
});

export type EffectsConfig = z.infer<typeof EffectsConfigSchema>;

// ─── Output Configuration ───────────────────────────────

export const OutputConfigSchema = z.object({
  format: z.enum(["gif", "mp4", "webm", "png-sequence"]).default("gif"),
  width: z.number().default(1280),
  height: z.number().default(800),
  fps: z.number().min(1).max(60).default(30),
  quality: z.number().min(1).max(100).default(80),
  // Encoding preset for MP4 output. Overrides quality when set.
  // social   — optimized for Twitter/X and YouTube (CRF 25, capped bitrate)
  // balanced — general-purpose, good quality/size trade-off (CRF 20)
  // archive  — high-fidelity storage, larger file (CRF 15)
  preset: z.enum(["social", "balanced", "archive"]).optional(),
  outputDir: z.string().default("./output"),
  filename: z.string().default("clipwise-recording"),
});

export type OutputConfig = z.infer<typeof OutputConfigSchema>;

// ─── Scenario (Top-Level) ───────────────────────────────

export const StepSchema = z.object({
  name: z.string().optional(),
  actions: z.array(StepActionSchema),
  captureDelay: z.number().default(300),
  holdDuration: z.number().default(1500),
  transition: z.enum(["fade", "none"]).default("none"),
});

export type Step = z.infer<typeof StepSchema>;

export const ScenarioSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  viewport: z
    .object({
      width: z.number().default(1280),
      height: z.number().default(800),
    })
    .default({}),
  effects: EffectsConfigSchema.default({}),
  output: OutputConfigSchema.default({}),
  steps: z.array(StepSchema).min(1),
});

export type Scenario = z.infer<typeof ScenarioSchema>;

// ─── Internal Types ─────────────────────────────────────

export interface KeystrokeEvent {
  key: string;
  timestamp: number;
  /**
   * Typing session ID — incremented each time a new input is focused via the
   * `type` action.  HUD groups keystrokes by sessionId so each input field's
   * typed content appears on its own line.  Undefined for legacy recordings.
   */
  sessionId?: number;
}

export interface CapturedFrame {
  index: number;
  screenshot: Buffer;
  timestamp: number;
  cursorPosition: { x: number; y: number } | null;
  clickPosition: { x: number; y: number } | null;
  clickProgress?: number;
  viewport: { width: number; height: number };
  /** Device pixel ratio used during capture (1 = normal, 2 = Retina/HiDPI). */
  deviceScaleFactor?: number;
  stepName?: string;
  stepIndex?: number;
  actionType?: string;
  keystrokes?: KeystrokeEvent[];
}

export interface ComposedFrame {
  index: number;
  buffer: Buffer;
  timestamp: number;
  /**
   * Present when buffer contains raw RGBA pixels (not PNG).
   * Allows the encoder to skip the PNG-decode step and consume pixels directly.
   */
  rawInfo?: { width: number; height: number; channels: 4 };
}

export interface DedupStats {
  /** CDP로부터 수신한 원본 프레임 수 */
  received: number;
  /** 중복 제거 후 실제 저장된 고유 프레임 수 */
  stored: number;
  /** 중복으로 판단해 건너뛴 프레임 수 */
  skipped: number;
}

export interface RecordingSession {
  scenario: Scenario;
  frames: CapturedFrame[];
  startTime: number;
  endTime?: number;
  /** 정적 프레임 중복 제거 통계 */
  dedupStats?: DedupStats;
}

/**
 * Handle returned by ClipwiseRecorder.recordToChannel().
 *
 * frameStream: async iterable of CapturedFrames as they are captured
 *   (post-dedup, no FPS resampling — frames arrive at CDP capture rate).
 *   Closes automatically when recording ends.
 *
 * done: resolves with the full RecordingSession (including FPS-resampled
 *   frames) when recording has completely finished.
 */
export interface RecordingHandle {
  frameStream: AsyncIterable<CapturedFrame>;
  done: Promise<RecordingSession>;
}
