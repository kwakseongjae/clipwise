// Core recorder
export { ClipwiseRecorder } from "./core/recorder.js";

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
  calculateAdaptiveZoomInWindow,
  calculatePanOffset,
  lerpZoom,
  resolveZoomScale,
  ZOOM_INTENSITY_SCALES,
} from "./effects/zoom.js";
export type { ZoomIntensity } from "./effects/zoom.js";
export { renderCursorTrail, renderCursorHighlight } from "./effects/cursor.js";
export { renderKeystrokeHud } from "./effects/keystroke.js";
export { applyCrossfade, applySlide, applyBlur, applyTransition } from "./effects/transition.js";
export { renderWatermark } from "./effects/watermark.js";

// Scenario parsing & validation
export { parseScenario, loadScenario } from "./script/parser.js";
export { validateScenario } from "./script/validator.js";

// Types
export type {
  Scenario,
  Step,
  StepAction,
  StepEffectsOverride,
  TransitionType,
  AudioConfig,
  EffectsConfig,
  OutputConfig,
  CapturedFrame,
  ComposedFrame,
  RecordingSession,
  RecordingHandle,
  KeystrokeEvent,
} from "./script/types.js";
