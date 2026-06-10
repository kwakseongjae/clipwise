// Core recorder
export { ClipwiseRecorder } from "./core/recorder.js";

// Prepare — 녹화 시 런타임 주입 (hide/mock/freezeTime/storage/inject)
export {
  applyPrepare,
  buildHideCss,
  buildCssInjectionScript,
  buildFreezeTimeScript,
  buildSeedRandomScript,
  buildStorageScript,
} from "./core/prepare.js";

// Composition & encoding
export { CanvasRenderer } from "./compose/canvas-renderer.js";
export type { FrameContext } from "./compose/canvas-renderer.js";
export { encodeGif, encodeMp4, encodeMp4Stream, savePngSequence } from "./compose/video-encoder.js";
export { StreamingSession, ConcurrentSession } from "./compose/streaming-session.js";
export type { PipelineProgress, ConcurrentResult } from "./compose/streaming-session.js";

// Effects
export {
  calculateAdaptiveZoom,
  buildZoomClickLookup,
  calculateAdaptiveZoomFromLookup,
  calculateAdaptiveZoomFromZones,
  calculateAdaptiveZoomInWindow,
  calculatePanOffset,
  lerpZoom,
  mergeClickZones,
  resolveZoomScale,
  springEasing,
  applyZoomEasing,
  ZOOM_INTENSITY_SCALES,
} from "./effects/zoom.js";
export type { ZoomIntensity, ZoomEasing, ZoomZone } from "./effects/zoom.js";
export { renderCursorTrail, renderCursorHighlight } from "./effects/cursor.js";
export { renderKeystrokeHud } from "./effects/keystroke.js";
export { applyCrossfade, applySlide, applyBlur, applyTransition } from "./effects/transition.js";
export { renderWatermark } from "./effects/watermark.js";

// Scene System (v0.9 preview)
export { renderScenesTimeline } from "./scenes/runner.js";
export type { SceneProgress } from "./scenes/runner.js";

// Scenario parsing & validation
export { parseScenario, loadScenario, resolvePreparePaths } from "./script/parser.js";
export { validateScenario } from "./script/validator.js";

// Types
export type {
  Scenario,
  Step,
  StepAction,
  StepEffectsOverride,
  TransitionType,
  AuthConfig,
  PrepareConfig,
  MockRoute,
  Scene,
  MotionScene,
  ScreenScene,
  VignetteScene,
  SceneFx,
  AudioConfig,
  EffectsConfig,
  OutputConfig,
  CapturedFrame,
  ComposedFrame,
  RecordingSession,
  RecordingHandle,
  KeystrokeEvent,
} from "./script/types.js";
