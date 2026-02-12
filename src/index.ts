// Core recorder
export { ClipwiseRecorder } from "./core/recorder.js";

// Composition & encoding
export { CanvasRenderer } from "./compose/canvas-renderer.js";
export type { FrameContext } from "./compose/canvas-renderer.js";
export { encodeGif, encodeMp4, savePngSequence } from "./compose/video-encoder.js";

// Effects
export { calculateAdaptiveZoom, calculatePanOffset, lerpZoom } from "./effects/zoom.js";
export { renderCursorTrail, renderCursorHighlight } from "./effects/cursor.js";
export { renderKeystrokeHud } from "./effects/keystroke.js";
export { applyCrossfade } from "./effects/transition.js";
export { renderWatermark } from "./effects/watermark.js";

// Scenario parsing & validation
export { parseScenario, loadScenario } from "./script/parser.js";
export { validateScenario } from "./script/validator.js";

// Types
export type {
  Scenario,
  Step,
  StepAction,
  EffectsConfig,
  OutputConfig,
  CapturedFrame,
  ComposedFrame,
  RecordingSession,
  KeystrokeEvent,
} from "./script/types.js";
