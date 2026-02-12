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
 * @param frames - Array of frames with optional clickPosition
 * @param currentIndex - Index of the current frame
 * @param maxScale - Peak zoom scale
 * @param transitionFrames - Number of frames for zoom-in/zoom-out transition
 * @returns Scale value for the current frame (1.0 = no zoom)
 */
export function calculateAdaptiveZoom(
  frames: Array<{ clickPosition: { x: number; y: number } | null }>,
  currentIndex: number,
  maxScale: number,
  transitionFrames: number,
): number {
  if (maxScale <= 1) return 1;

  // Find the nearest click frame
  let minDistance = Infinity;

  for (let i = 0; i < frames.length; i++) {
    if (frames[i].clickPosition) {
      const distance = Math.abs(i - currentIndex);
      minDistance = Math.min(minDistance, distance);
    }
  }

  if (minDistance === Infinity) return 1;

  // Zoom envelope: ramp up to maxScale near click, fade out over transitionFrames
  if (minDistance <= transitionFrames) {
    const t = 1 - minDistance / transitionFrames;
    const eased = easeInOutCubic(t);
    return 1 + (maxScale - 1) * eased;
  }

  return 1;
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
