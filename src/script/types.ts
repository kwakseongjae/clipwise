import { z } from "zod";

// ─── Selector Validation ────────────────────────────────

const SafeSelectorSchema = z.string().regex(
  /^[a-zA-Z0-9\-_#.\[\]="':\s~^$|*,>+()@]+$/,
  "Selector contains invalid characters"
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
});

export const TypeActionSchema = z.object({
  action: z.literal("type"),
  selector: SafeSelectorSchema,
  text: z.string(),
  delay: z.number().default(50),
});

export const ScrollActionSchema = z.object({
  action: z.literal("scroll"),
  selector: SafeSelectorSchema.optional(),
  y: z.number().default(0),
  x: z.number().default(0),
  smooth: z.boolean().default(true),
});

export const WaitActionSchema = z.object({
  action: z.literal("wait"),
  duration: z.number().describe("Wait duration in milliseconds"),
});

export const HoverActionSchema = z.object({
  action: z.literal("hover"),
  selector: SafeSelectorSchema,
});

export const ScreenshotActionSchema = z.object({
  action: z.literal("screenshot"),
  name: z.string().optional(),
  fullPage: z.boolean().default(false),
});

export const StepActionSchema = z.discriminatedUnion("action", [
  NavigateActionSchema,
  ClickActionSchema,
  TypeActionSchema,
  ScrollActionSchema,
  WaitActionSchema,
  HoverActionSchema,
  ScreenshotActionSchema,
]);

export type StepAction = z.infer<typeof StepActionSchema>;

// ─── Effects Configuration ──────────────────────────────

export const AutoZoomConfigSchema = z.object({
  followCursor: z.boolean().default(true),
  maxScale: z.number().min(1).max(5).default(2.0),
  transitionDuration: z.number().default(400),
  padding: z.number().default(200),
});

export const ZoomEffectSchema = z.object({
  enabled: z.boolean().default(true),
  scale: z.number().min(1).max(5).default(1.8),
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
  fps: z.number().min(1).max(60).default(15),
  quality: z.number().min(1).max(100).default(80),
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
}

export interface CapturedFrame {
  index: number;
  screenshot: Buffer;
  timestamp: number;
  cursorPosition: { x: number; y: number } | null;
  clickPosition: { x: number; y: number } | null;
  clickProgress?: number;
  viewport: { width: number; height: number };
  stepName?: string;
  stepIndex?: number;
  actionType?: string;
  keystrokes?: KeystrokeEvent[];
}

export interface ComposedFrame {
  index: number;
  buffer: Buffer;
  timestamp: number;
}

export interface RecordingSession {
  scenario: Scenario;
  frames: CapturedFrame[];
  startTime: number;
  endTime?: number;
}
