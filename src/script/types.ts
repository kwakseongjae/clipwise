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
  /** 대기 중 프레임 연속 캡처 (로딩 애니메이션 보존). */
  captureWhileWaiting: z.boolean().default(false),
  /** captureWhileWaiting 사용 시 출력 영상 속도 배율 (1-32). */
  displaySpeed: z.number().min(1).max(32).default(8),
});

export const WaitForNavigationActionSchema = z.object({
  action: z.literal("waitForNavigation"),
  waitUntil: z.enum(["load", "domcontentloaded", "networkidle"]).default("networkidle"),
  timeout: z.number().min(0).default(15000),
  captureWhileWaiting: z.boolean().default(false),
  displaySpeed: z.number().min(1).max(32).default(8),
});

export const WaitForURLActionSchema = z.object({
  action: z.literal("waitForURL"),
  url: z.string().min(1),
  timeout: z.number().min(0).default(15000),
  captureWhileWaiting: z.boolean().default(false),
  displaySpeed: z.number().min(1).max(32).default(8),
});

export const WaitForFunctionActionSchema = z.object({
  action: z.literal("waitForFunction"),
  expression: z.string().min(1),
  polling: z.union([z.literal("raf"), z.number().min(0)]).default("raf"),
  timeout: z.number().min(0).default(30000),
  captureWhileWaiting: z.boolean().default(false),
  displaySpeed: z.number().min(1).max(32).default(8),
});

export const WaitForResponseActionSchema = z.object({
  action: z.literal("waitForResponse"),
  url: z.string().min(1),
  status: z.number().min(100).max(599).optional(),
  timeout: z.number().min(0).default(30000),
  captureWhileWaiting: z.boolean().default(false),
  displaySpeed: z.number().min(1).max(32).default(8),
});

/**
 * Smart wait — records real wait time, then auto-speeds up in output.
 *
 * Unlike `wait` (which always produces dead time), `smartWait` records the
 * actual wait (e.g., API call latency) and applies `displaySpeed` during
 * composition to compress idle frames.  The transition from normal→fast→normal
 * is eased to avoid jarring speed jumps.
 */
export const SmartWaitActionSchema = z.object({
  action: z.literal("smartWait"),
  /** Condition to wait for */
  until: z.enum(["networkIdle", "selector", "domStable"]).default("networkIdle"),
  /** CSS selector (required when until="selector") */
  selector: SafeSelectorSchema.optional(),
  /** Maximum wait in ms */
  timeout: z.number().min(0).default(30000),
  /** Speed multiplier for the wait period in the output video (default: 8×) */
  displaySpeed: z.number().min(1).max(32).default(8),
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
  SmartWaitActionSchema,
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
   * Default: 1.25 to match "light" intensity (industry standard).
   */
  scale: z.number().min(1).max(5).default(1.25),
  /**
   * Intensity preset — overrides `scale` when set.
   * Calibrated against Loom (light≈1.25x) and Camtasia (moderate≈1.35x).
   * Default: "light" (1.25x) — matches industry standard (Screen Studio, Loom).
   */
  intensity: ZoomIntensitySchema.default("light"),
  duration: z.number().default(800),
  easing: z
    .enum(["ease-in-out", "ease-in", "ease-out", "linear", "spring"])
    .default("ease-in-out"),
  autoZoom: AutoZoomConfigSchema.default({}),
});

export const CursorEffectSchema = z.object({
  enabled: z.boolean().default(true),
  size: z.number().default(20),
  color: z.string().default("#000000"),
  speed: z.enum(["fast", "normal", "slow"]).default("normal"),
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
  idleSpeed: z.number().min(0.5).max(8).default(2.0),
  actionSpeed: z.number().min(0.25).max(2).default(0.8),
  transitionFrames: z.number().default(15),
});

/**
 * Content-aware smart speed — auto-compresses wait/loading periods.
 *
 * Unlike speedRamp (which only detects clicks), smartSpeed uses semantic
 * metadata from smartWait actions and per-frame change scoring to decide
 * which frames to accelerate.  Compatible with streaming pipeline.
 */
export const SmartSpeedConfigSchema = z.object({
  enabled: z.boolean().default(false),
  /** Speed multiplier for frames during smartWait (overridden by per-action displaySpeed) */
  waitSpeed: z.number().min(1).max(32).default(8),
  /** Speed multiplier for idle frames (no DOM/network changes) */
  idleSpeed: z.number().min(1).max(16).default(4),
  /** Duration (ms) to ease between speed changes (prevents jarring jumps) */
  transitionDuration: z.number().default(300),
  /** Minimum segment duration (ms) — don't speed up very short segments */
  minSegmentDuration: z.number().default(500),
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
  smartSpeed: SmartSpeedConfigSchema.default({}),
  keystroke: KeystrokeConfigSchema.default({}),
  watermark: WatermarkConfigSchema.default({}),
});

export type EffectsConfig = z.infer<typeof EffectsConfigSchema>;

// ─── Output Configuration ───────────────────────────────

export const OutputConfigSchema = z.object({
  format: z.enum(["gif", "mp4", "webm", "png-sequence"]).default("mp4"),
  width: z.number().default(1280),
  height: z.number().default(800),
  fps: z.number().min(1).max(60).default(30),
  /** @deprecated Use `preset` instead. Will be removed in v0.7. */
  quality: z.number().min(1).max(100).default(80),
  // Encoding preset for MP4 output. Overrides quality when set.
  // social   — optimized for Twitter/X and YouTube (CRF 25, capped bitrate)
  // balanced — general-purpose, good quality/size trade-off (CRF 20)
  // archive  — high-fidelity storage, larger file (CRF 15)
  preset: z.enum(["social", "balanced", "archive"]).optional(),
  /** Codec override: h264 (default), hevc (10-bit), av1 (smallest files, slow encode) */
  codec: z.enum(["auto", "h264", "hevc", "av1"]).default("auto"),
  outputDir: z.string().default("./output"),
  filename: z.string().default("clipwise-recording"),
});

export type OutputConfig = z.infer<typeof OutputConfigSchema>;

// ─── Scenario (Top-Level) ───────────────────────────────

/**
 * Per-step effects override — allows each step to customize effects
 * independently from the global effects config.  Only the fields
 * specified here are merged; everything else falls back to global.
 */
export const StepEffectsOverrideSchema = z.object({
  zoom: ZoomEffectSchema.partial().optional(),
  cursor: CursorEffectSchema.partial().optional(),
  background: BackgroundSchema.partial().optional(),
  deviceFrame: DeviceFrameSchema.partial().optional(),
  speedRamp: SpeedRampConfigSchema.partial().optional(),
  smartSpeed: SmartSpeedConfigSchema.partial().optional(),
  keystroke: KeystrokeConfigSchema.partial().optional(),
  watermark: WatermarkConfigSchema.partial().optional(),
}).optional();

export type StepEffectsOverride = z.infer<typeof StepEffectsOverrideSchema>;

export const TransitionTypeSchema = z.enum([
  "none",
  "fade",
  "slide-left",
  "slide-up",
  "blur",
]);

export type TransitionType = z.infer<typeof TransitionTypeSchema>;

export const StepSchema = z.object({
  name: z.string().optional(),
  actions: z.array(StepActionSchema),
  captureDelay: z.number().default(300),
  holdDuration: z.number().default(1500),
  transition: TransitionTypeSchema.default("none"),
  /** Per-step effects override — merges with global effects config. */
  effects: StepEffectsOverrideSchema,
});

export type Step = z.infer<typeof StepSchema>;

/**
 * Audio narration configuration — mux an audio file into the MP4 output.
 */
export const AudioConfigSchema = z.object({
  /** Path to the audio file (MP3, WAV, AAC, etc.). */
  file: z.string().min(1),
  /** Volume level (0.0 = silent, 1.0 = full). */
  volume: z.number().min(0).max(1).default(1.0),
  /** Fade-in duration in milliseconds. */
  fadeIn: z.number().min(0).default(0),
  /** Fade-out duration in milliseconds. */
  fadeOut: z.number().min(0).default(0),
});

export type AudioConfig = z.infer<typeof AudioConfigSchema>;

/**
 * Authentication configuration — restores a browser session for recording
 * pages behind login.  Supports Playwright's storageState file (recommended)
 * or inline cookie definitions.
 *
 * Generate a storageState file:
 *   npx playwright codegen --save-storage=auth.json https://my-app.com
 */
export const AuthConfigSchema = z.object({
  /** Path to a Playwright storageState JSON file (cookies + localStorage). */
  storageState: z.string().optional(),
  /** Inline cookie definitions (applied after storageState if both specified). */
  cookies: z
    .array(
      z.object({
        name: z.string(),
        value: z.string(),
        domain: z.string(),
        path: z.string().default("/"),
        httpOnly: z.boolean().default(false),
        secure: z.boolean().default(false),
        sameSite: z.enum(["Strict", "Lax", "None"]).default("Lax"),
      }),
    )
    .optional(),
});

export type AuthConfig = z.infer<typeof AuthConfigSchema>;

export const ScenarioSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  viewport: z
    .object({
      width: z.number().default(1280),
      height: z.number().default(800),
    })
    .default({}),
  /** Optional authentication — restores browser session for logged-in pages. */
  auth: AuthConfigSchema.optional(),
  effects: EffectsConfigSchema.default({}),
  output: OutputConfigSchema.default({}),
  /** Optional audio narration — muxed into MP4 output. */
  audio: AudioConfigSchema.optional(),
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
  /** True when the frame was captured during a scroll action. */
  isScrolling?: boolean;
  /** True when the frame was captured during a smartWait period. */
  isWaitingPhase?: boolean;
  /** Speed multiplier for this frame when in a smartWait phase. */
  displaySpeed?: number;
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
