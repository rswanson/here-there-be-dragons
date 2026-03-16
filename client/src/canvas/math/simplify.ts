interface Point { x: number; y: number; }

/**
 * Ramer-Douglas-Peucker line simplification.
 * Reduces the number of points in a polyline while preserving its shape.
 * @param points Input polyline
 * @param epsilon Maximum perpendicular distance threshold
 */
export function simplifyPoints(points: Point[], epsilon: number): Point[] {
  if (points.length <= 2) return [...points];

  // Find the point furthest from the line between first and last
  let maxDist = 0;
  let maxIdx = 0;

  const start = points[0];
  const end = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicularDistance(points[i], start, end);
    if (d > maxDist) {
      maxDist = d;
      maxIdx = i;
    }
  }

  if (maxDist > epsilon) {
    const left = simplifyPoints(points.slice(0, maxIdx + 1), epsilon);
    const right = simplifyPoints(points.slice(maxIdx), epsilon);
    return [...left.slice(0, -1), ...right];
  }

  return [start, end];
}

function perpendicularDistance(point: Point, lineStart: Point, lineEnd: Point): number {
  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;
  const lineLenSq = dx * dx + dy * dy;

  if (lineLenSq === 0) {
    // Start and end are the same point
    const ddx = point.x - lineStart.x;
    const ddy = point.y - lineStart.y;
    return Math.sqrt(ddx * ddx + ddy * ddy);
  }

  return Math.abs(dy * point.x - dx * point.y + lineEnd.x * lineStart.y - lineEnd.y * lineStart.x) /
    Math.sqrt(lineLenSq);
}
