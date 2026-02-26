import sharp from "sharp";

export interface ZoomConfig {
  scale: number;
  duration: number;
  easing: string;
}

/**
 * Apply a zoom effect to a frame buffer by cropping around a focus point
 * and resizing back to the original dimensions.
 */
export async function applyZoom(
  frameBuffer: Buffer,
  focusPoint: { x: number; y: number },
  scale: number,
  frameWidth: number,
  frameHeight: number,
): Promise<Buffer> {
  if (scale <= 1) return frameBuffer;

  // Calculate the crop region size (inverse of scale)
  const cropWidth = Math.round(frameWidth / scale);
  const cropHeight = Math.round(frameHeight / scale);

  // Center the crop on the focus point, clamped to image bounds
  let left = Math.round(focusPoint.x - cropWidth / 2);
  let top = Math.round(focusPoint.y - cropHeight / 2);

  left = Math.max(0, Math.min(left, frameWidth - cropWidth));
  top = Math.max(0, Math.min(top, frameHeight - cropHeight));

  return sharp(frameBuffer)
    .extract({ left, top, width: cropWidth, height: cropHeight })
    .resize(frameWidth, frameHeight, { kernel: sharp.kernel.lanczos3 })
    .png()
    .toBuffer();
}

/**
 * Calculate a sequence of scale values for a zoom-in -> hold -> zoom-out animation.
 *
 * @param totalFrames - Total number of frames in the sequence
 * @param maxScale - Peak zoom level
 * @param holdFrames - How many frames to hold at peak zoom
 * @returns Array of scale values (1.0 = no zoom)
 */
export function calculateZoomSequence(
  totalFrames: number,
  maxScale: number,
  holdFrames: number,
): number[] {
  if (totalFrames <= 0) return [];
  if (maxScale <= 1) return Array(totalFrames).fill(1);

  const animFrames = totalFrames - holdFrames;
  if (animFrames <= 0) return Array(totalFrames).fill(maxScale);

  const zoomInFrames = Math.floor(animFrames / 2);
  const zoomOutFrames = animFrames - zoomInFrames;

  const scales: number[] = [];

  // Zoom in phase
  for (let i = 0; i < zoomInFrames; i++) {
    const t = i / Math.max(1, zoomInFrames - 1);
    const eased = easeInOutCubic(t);
    scales.push(1 + (maxScale - 1) * eased);
  }

  // Hold phase
  for (let i = 0; i < holdFrames; i++) {
    scales.push(maxScale);
  }

  // Zoom out phase
  for (let i = 0; i < zoomOutFrames; i++) {
    const t = i / Math.max(1, zoomOutFrames - 1);
    const eased = easeInOutCubic(t);
    scales.push(maxScale - (maxScale - 1) * eased);
  }

  return scales;
}

/**
 * Calculate adaptive zoom scale based on proximity to click/action frames.
 * Zooms in smoothly near important actions, stays at 1.0 during idle.
 *
 * Scans only the ±transitionFrames influence window — frames outside that
 * range always produce 1.0 anyway, so scanning the full array is wasted work.
 * This reduces per-call cost from O(n) to O(transitionFrames).
 *
 * For bulk context calculation over many frames, prefer the lookup-based API:
 *   buildZoomClickLookup() once → calculateAdaptiveZoomFromLookup() per frame
 * which achieves O(n + n·log k) instead of O(n·transitionFrames).
 *
 * @param frames - Array of frames with optional clickPosition
 * @param currentIndex - Index of the current frame
 * @param maxScale - Peak zoom scale
 * @param transitionFrames - Half-width of the zoom influence window (frames)
 * @returns Scale value for the current frame (1.0 = no zoom)
 */
export function calculateAdaptiveZoom(
  frames: Array<{ clickPosition: { x: number; y: number } | null }>,
  currentIndex: number,
  maxScale: number,
  transitionFrames: number,
): number {
  if (maxScale <= 1) return 1;

  // Only scan within the influence window — identical results, far fewer iterations
  const lo = Math.max(0, currentIndex - transitionFrames);
  const hi = Math.min(frames.length - 1, currentIndex + transitionFrames);

  let minDistance = Infinity;
  for (let i = lo; i <= hi; i++) {
    if (frames[i].clickPosition) {
      const distance = Math.abs(i - currentIndex);
      if (distance < minDistance) minDistance = distance;
    }
  }

  if (minDistance > transitionFrames) return 1;
  const t = 1 - minDistance / transitionFrames;
  return 1 + (maxScale - 1) * easeInOutCubic(t);
}

// ─── Lookup-based API (O(n log k) batch) ─────────────────────────────────────

/**
 * Pre-extract the indices of all click frames in a single O(n) pass.
 * Pass the result to calculateAdaptiveZoomFromLookup() for O(log k) per-frame
 * zoom computation, instead of O(transitionFrames) per frame.
 *
 * @returns Sorted array of frame indices that carry a clickPosition.
 */
export function buildZoomClickLookup(
  frames: ReadonlyArray<{ clickPosition: unknown }>,
): number[] {
  const indices: number[] = [];
  for (let i = 0; i < frames.length; i++) {
    if (frames[i].clickPosition !== null && frames[i].clickPosition !== undefined) {
      indices.push(i);
    }
  }
  return indices; // already ascending
}

/**
 * Calculate adaptive zoom scale using a pre-built click index lookup.
 * Binary-searches the lookup for the nearest click — O(log k) per call.
 *
 * Use buildZoomClickLookup() once before iterating, then call this per frame.
 *
 * @param clickLookup - Sorted array of click frame indices from buildZoomClickLookup()
 * @param currentIndex - Index of the frame being evaluated
 */
export function calculateAdaptiveZoomFromLookup(
  clickLookup: readonly number[],
  currentIndex: number,
  maxScale: number,
  transitionFrames: number,
): number {
  if (maxScale <= 1 || clickLookup.length === 0) return 1;

  // Binary search: find insertion point for currentIndex
  let lo = 0;
  let hi = clickLookup.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (clickLookup[mid] < currentIndex) lo = mid + 1;
    else hi = mid;
  }

  // Nearest click is lo-1 (left neighbour) or lo (right neighbour)
  const distBefore = lo > 0 ? currentIndex - clickLookup[lo - 1] : Infinity;
  const distAfter = lo < clickLookup.length ? clickLookup[lo] - currentIndex : Infinity;
  const minDistance = Math.min(distBefore, distAfter);

  if (minDistance > transitionFrames) return 1;
  const t = 1 - minDistance / transitionFrames;
  return 1 + (maxScale - 1) * easeInOutCubic(t);
}

// ─── Window-based API (Phase 3-A streaming) ──────────────────────────────────

/**
 * Calculate adaptive zoom scale using only a local window of frames.
 * Does NOT need the full frame array — only frames within
 * [currentIndex - transitionFrames, currentIndex + transitionFrames].
 *
 * This is the Phase 3-A compatible API: when composition runs concurrently
 * with recording, only the ±transitionFrames lookahead buffer needs to be
 * available before frame i can be composed.
 *
 * @param windowFrames - Slice of frames around currentIndex
 * @param windowStart  - Absolute timeline index of windowFrames[0]
 * @param currentIndex - Absolute timeline index of the frame being composed
 */
export function calculateAdaptiveZoomInWindow(
  windowFrames: ReadonlyArray<{ clickPosition: unknown }>,
  windowStart: number,
  currentIndex: number,
  maxScale: number,
  transitionFrames: number,
): number {
  if (maxScale <= 1) return 1;

  let minDistance = Infinity;
  for (let j = 0; j < windowFrames.length; j++) {
    if (windowFrames[j].clickPosition !== null && windowFrames[j].clickPosition !== undefined) {
      const dist = Math.abs(windowStart + j - currentIndex);
      if (dist < minDistance) minDistance = dist;
    }
  }

  if (minDistance > transitionFrames) return 1;
  const t = 1 - minDistance / transitionFrames;
  return 1 + (maxScale - 1) * easeInOutCubic(t);
}

/**
 * Calculate pan offset to keep a focus point centered when zoomed in.
 * The offset defines the top-left corner of the visible crop region.
 */
export function calculatePanOffset(
  focusPoint: { x: number; y: number },
  scale: number,
  frameWidth: number,
  frameHeight: number,
): { x: number; y: number } {
  if (scale <= 1) return { x: 0, y: 0 };

  // When zoomed, the visible area is smaller
  const visibleWidth = frameWidth / scale;
  const visibleHeight = frameHeight / scale;

  // Center the view on the focus point
  let offsetX = focusPoint.x - visibleWidth / 2;
  let offsetY = focusPoint.y - visibleHeight / 2;

  // Clamp to frame bounds
  offsetX = Math.max(0, Math.min(offsetX, frameWidth - visibleWidth));
  offsetY = Math.max(0, Math.min(offsetY, frameHeight - visibleHeight));

  return { x: Math.round(offsetX), y: Math.round(offsetY) };
}

/**
 * Smoothly interpolate (lerp) between current and target zoom values.
 */
export function lerpZoom(
  current: number,
  target: number,
  factor: number,
): number {
  return current + (target - current) * Math.min(1, Math.max(0, factor));
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
