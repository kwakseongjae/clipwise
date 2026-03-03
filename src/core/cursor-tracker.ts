export interface Point {
  x: number;
  y: number;
}

/**
 * Cubic ease-in-out easing function.
 * Produces smooth acceleration and deceleration.
 */
export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * Generate a smooth path between two points using cubic bezier interpolation.
 * The control points create a natural curved movement rather than a straight line.
 *
 * Perpendicular offset is capped at 30px regardless of distance, so long-distance
 * movements stay visually straight rather than drawing a large visible arc.
 */
export function interpolatePath(
  from: Point,
  to: Point,
  steps: number,
): Point[] {
  if (steps <= 0) return [to];
  if (steps === 1) return [from, to];

  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);

  // Perpendicular unit vector (rotate 90°).  Cap the offset at 30px so large
  // movements don't produce a visually exaggerated arc.
  const perpScale = Math.min(distance * 0.06, 30);
  const normX = distance > 0 ? (dy / distance) * perpScale : 0;
  const normY = distance > 0 ? (-dx / distance) * perpScale : 0;

  const cp1: Point = {
    x: from.x + dx * 0.25 + normX,
    y: from.y + dy * 0.25 + normY,
  };
  const cp2: Point = {
    x: from.x + dx * 0.75 - normX,
    y: from.y + dy * 0.75 - normY,
  };

  const points: Point[] = [];

  for (let i = 0; i <= steps; i++) {
    const rawT = i / steps;
    const t = easeInOutCubic(rawT);

    // Cubic bezier formula: B(t) = (1-t)^3*P0 + 3*(1-t)^2*t*P1 + 3*(1-t)*t^2*P2 + t^3*P3
    const oneMinusT = 1 - t;
    const x =
      oneMinusT * oneMinusT * oneMinusT * from.x +
      3 * oneMinusT * oneMinusT * t * cp1.x +
      3 * oneMinusT * t * t * cp2.x +
      t * t * t * to.x;
    const y =
      oneMinusT * oneMinusT * oneMinusT * from.y +
      3 * oneMinusT * oneMinusT * t * cp1.y +
      3 * oneMinusT * t * t * cp2.y +
      t * t * t * to.y;

    points.push({ x: Math.round(x), y: Math.round(y) });
  }

  return points;
}

/**
 * Smooth a path by applying Chaikin's corner-cutting algorithm.
 * This reduces sharp direction changes for more natural cursor movement.
 *
 * @param points - The path points to smooth
 * @param tension - How aggressively to smooth (0 = no smoothing, 1 = max). Default 0.5.
 */
export function smoothPath(points: Point[], tension = 0.5): Point[] {
  if (points.length < 3) return points;

  const factor = Math.max(0, Math.min(1, tension));
  const cut = 0.25 * factor;

  const smoothed: Point[] = [points[0]];

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];

    // Chaikin's algorithm: cut corners at 25% and 75%
    smoothed.push({
      x: Math.round(p0.x + (p1.x - p0.x) * cut),
      y: Math.round(p0.y + (p1.y - p0.y) * cut),
    });
    smoothed.push({
      x: Math.round(p0.x + (p1.x - p0.x) * (1 - cut)),
      y: Math.round(p0.y + (p1.y - p0.y) * (1 - cut)),
    });
  }

  smoothed.push(points[points.length - 1]);

  return smoothed;
}
