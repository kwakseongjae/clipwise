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

  // Control points for cubic bezier - offset perpendicular to direction
  // for a natural arc movement
  const cp1: Point = {
    x: from.x + dx * 0.25 + dy * 0.1,
    y: from.y + dy * 0.25 - dx * 0.1,
  };
  const cp2: Point = {
    x: from.x + dx * 0.75 - dy * 0.1,
    y: from.y + dy * 0.75 + dx * 0.1,
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
