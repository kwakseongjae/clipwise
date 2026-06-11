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
  /** browser 타입의 주소창에 표시할 URL (실제 녹화 URL과 무관한 표시용). */
  url: z.string().default("localhost"),
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
  // Zero-Footprint 계약 (v0.8): 모든 산출물은 .clipwise/ 아래로.
  outputDir: z.string().default(".clipwise/output"),
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
  /** 트랙 BPM — scenes 타임라인에서 지정 시 신 길이를 비트 격자에 스냅(비트 싱크 컷). */
  bpm: z.number().min(40).max(220).optional(),
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

/**
 * Mock route — 녹화 브라우저의 네트워크 응답을 픽스처로 대체한다.
 * URL은 부분 문자열 매칭 (waitForResponse와 동일한 의미론).
 */
export const MockRouteSchema = z.object({
  /** 매칭할 URL 부분 문자열 (예: "/api/dashboard/stats"). */
  url: z.string().min(1),
  /** 응답 본문 JSON 파일 경로 (시나리오 파일 기준 상대 경로). */
  fixture: z.string().optional(),
  /** 인라인 응답 본문 — fixture 대신 YAML에 직접 작성. */
  body: z.unknown().optional(),
  status: z.number().int().min(100).max(599).default(200),
  contentType: z.string().default("application/json"),
});

export type MockRoute = z.infer<typeof MockRouteSchema>;

/**
 * Prepare — 녹화 브라우저에만 적용되는 런타임 주입 설정.
 *
 * 사용자가 데모를 위해 앱 코드를 수정하게 되는 압력(dev 오버레이 숨김,
 * 데모 데이터 시드, 날짜/랜덤 고정 등)을 전부 주입으로 대체한다.
 * 소스·빌드·배포는 무접촉이며, 주입은 녹화 세션의 브라우저 컨텍스트에만
 * 적용된다.
 */
export const PrepareConfigSchema = z.object({
  /** 녹화에서 숨길 요소의 CSS 셀렉터 (쿠키 배너, dev 오버레이 등). */
  hide: z.array(z.string().min(1)).default([]),
  /** 블러 처리할 요소의 CSS 셀렉터 (이메일, 금액 등 민감 정보) — 스크롤·이동을 따라간다. */
  mask: z.array(z.string().min(1)).default([]),
  /** Date/Date.now를 이 시각으로 고정 (ISO 8601, 예: "2026-06-10T09:00:00Z"). */
  freezeTime: z.string().optional(),
  /** Math.random을 이 시드의 결정론적 PRNG로 대체. */
  seedRandom: z.number().int().optional(),
  /** 페이지 로드 전 시드할 웹 스토리지 항목. */
  storage: z
    .object({
      localStorage: z.record(z.string()).default({}),
      sessionStorage: z.record(z.string()).default({}),
    })
    .optional(),
  /** 네트워크 응답 목(mock) — 사용자 DB를 시드하지 않고 데모 데이터 제공. */
  mock: z.array(MockRouteSchema).default([]),
  /** 임의 CSS/JS 파일 주입 (시나리오 파일 기준 상대 경로). */
  inject: z
    .object({
      css: z.union([z.string(), z.array(z.string())]).optional(),
      js: z.union([z.string(), z.array(z.string())]).optional(),
    })
    .optional(),
});

export type PrepareConfig = z.infer<typeof PrepareConfigSchema>;

// ─── Scene System (v0.9 preview) ─────────────────────────
// 타임라인 = motion/vignette 신의 순서. screen 신은 푸티지 소스(테이크)로,
// 타임라인에 직접 등장하지 않고 vignette가 구간·영역·배속으로 인용한다.

/** motion 신 — HTML 템플릿(내장 이름 또는 경로)을 deterministic seek 캡처. */
export const MotionSceneSchema = z.object({
  type: z.literal("motion"),
  /** 내장 템플릿(intro-title|feature-callout|kinetic-type|vignette) 또는 .html 경로. */
  template: z.string().min(1),
  /** 신 길이 (ms). */
  duration: z.number().min(200).max(60000),
  /** 템플릿에 query param으로 주입할 props. */
  props: z.record(z.union([z.string(), z.number(), z.boolean()])).default({}),
});

/** screen 신 — 실녹화 테이크. 커서 이펙트만 입힌 클린 푸티지가 된다. */
export const ScreenSceneSchema = z.object({
  type: z.literal("screen"),
  /** vignette가 참조할 푸티지 ID. */
  id: z.string().min(1),
  steps: z.array(StepSchema).min(1),
});

/** 푸티지 주석 — circle/arrow(선 드로잉), spotlight(주변 디밍).
 *  좌표는 셀렉터 실측(권장) 또는 푸티지 원본 px. */
export const SceneFxSchema = z.object({
  kind: z.enum(["circle", "arrow", "spotlight"]),
  /** 대상 요소 셀렉터 — bounding box를 실측해 좌표로 사용. */
  selector: z.string().optional(),
  /** 명시 좌표 — circle: [x,y,w,h], arrow: [x1,y1,x2,y2]. */
  coords: z.array(z.number()).length(4).optional(),
  /** 신 내 드로잉 시작 시각 (ms). */
  delay: z.number().min(0).default(0),
});

/** vignette 신 — screen 푸티지를 카드 레이어로 합성 (크롭·푸시인·분할·배속). */
export const VignetteSceneSchema = z.object({
  type: z.literal("vignette"),
  /** 인용할 screen 신의 id. */
  footage: z.string().min(1),
  duration: z.number().min(500).max(60000),
  layout: z.enum(["hero", "crop", "split"]).default("hero"),
  num: z.string().optional(),
  label: z.string().optional(),
  caption: z.string().optional(),
  /** split 레이아웃의 코드 카드 라인들. */
  code: z.array(z.string()).optional(),
  /** 크롭 영역 — selector 실측(+pad) 또는 명시 좌표. 생략 시 전체 화면. */
  crop: z
    .object({
      selector: z.string().optional(),
      pad: z.number().default(14),
      x: z.number().optional(),
      y: z.number().optional(),
      w: z.number().optional(),
      h: z.number().optional(),
      /** 크롭 높이 상한 (px, 원본 기준) — 와이드 스트립 연출용. */
      maxH: z.number().optional(),
    })
    .optional(),
  /** 푸시인 카메라 (스케일 from→to).
   *  origin: 푸시 중심점 — 셀렉터(실측) 지정 시 그 요소를 향해 밀어 들어가
   *  다음 신의 크롭과 이어지는 매치컷을 만든다. 기본은 화면 중앙 약간 위. */
  push: z
    .object({
      from: z.number().default(1),
      to: z.number().default(1),
      origin: z.string().optional(),
    })
    .optional(),
  /** 푸티지 인용 시작점 — 초(number) 또는 step 경계 anchor. */
  start: z
    .union([z.number(), z.object({ step: z.number().int().min(0), offset: z.number().default(0) })])
    .default(0),
  /** 푸티지 재생 배속. */
  rate: z.number().min(0.1).max(8).default(1),
  fx: z.array(SceneFxSchema).default([]),
});

export const SceneSchema = z.discriminatedUnion("type", [
  MotionSceneSchema,
  ScreenSceneSchema,
  VignetteSceneSchema,
]);

export type MotionScene = z.infer<typeof MotionSceneSchema>;
export type ScreenScene = z.infer<typeof ScreenSceneSchema>;
export type VignetteScene = z.infer<typeof VignetteSceneSchema>;
export type SceneFx = z.infer<typeof SceneFxSchema>;
export type Scene = z.infer<typeof SceneSchema>;

export const ScenarioSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  viewport: z
    .object({
      width: z.number().default(1280),
      height: z.number().default(800),
      /** HiDPI 캡처 배율 — 2면 물리 픽셀 2배(레티나급)로 녹화·합성한다. */
      deviceScaleFactor: z.number().min(1).max(3).default(1),
    })
    .default({}),
  /** Optional authentication — restores browser session for logged-in pages. */
  auth: AuthConfigSchema.optional(),
  /** Optional recording-time runtime injection (hide/mock/freezeTime/...). */
  prepare: PrepareConfigSchema.optional(),
  effects: EffectsConfigSchema.default({}),
  output: OutputConfigSchema.default({}),
  /** Optional audio narration — muxed into MP4 output. */
  audio: AudioConfigSchema.optional(),
  /** steps 기반(클래식) 시나리오. scenes가 있으면 생략 가능. */
  steps: z.array(StepSchema).default([]),
  /** Scene System (v0.9 preview) — motion/screen/vignette 타임라인. */
  scenes: z.array(SceneSchema).optional(),
}).superRefine((s, ctx) => {
  if (s.steps.length === 0 && !s.scenes?.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["steps"],
      message: "Array must contain at least 1 element(s) — provide steps or scenes",
    });
  }
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
