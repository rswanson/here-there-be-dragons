/**
 * 2D raycasting visibility polygon algorithm.
 * Pure math — no PixiJS or store dependencies.
 */

export type Point = { x: number; y: number };
export type Segment = { x1: number; y1: number; x2: number; y2: number };

const EPSILON = 0.0001;
const ANGLE_EPSILON = 0.00001;
const CIRCLE_SEGMENTS = 32;

/**
 * Find the intersection of a ray from (ox, oy) in direction (rdx, rdy)
 * with a segment. Returns the intersection point or null if no hit.
 */
export function raySegmentIntersect(
  ox: number,
  oy: number,
  rdx: number,
  rdy: number,
  seg: Segment,
): Point | null {
  const sdx = seg.x2 - seg.x1;
  const sdy = seg.y2 - seg.y1;

  // Solve: (ox + t*rdx, oy + t*rdy) = (seg.x1 + u*sdx, seg.y1 + u*sdy)
  const denom = rdx * sdy - rdy * sdx;

  if (Math.abs(denom) < EPSILON) {
    // Parallel
    return null;
  }

  const dx = seg.x1 - ox;
  const dy = seg.y1 - oy;

  const t = (dx * sdy - dy * sdx) / denom;
  const u = (dx * rdy - dy * rdx) / denom;

  if (t < 0 || u < -EPSILON || u > 1 + EPSILON) {
    return null;
  }

  return {
    x: ox + t * rdx,
    y: oy + t * rdy,
  };
}

/**
 * Compute a visibility polygon from origin (ox, oy) with the given range,
 * blocked by the provided wall segments.
 *
 * Returns an array of polygon vertices (unsorted by default, sorted by angle).
 */
export function computeVisibilityPolygon(
  ox: number,
  oy: number,
  range: number,
  walls: Segment[],
): Point[] {
  const angles: number[] = [];

  // 1. Add circle boundary angles for smooth fallback
  for (let i = 0; i < CIRCLE_SEGMENTS; i++) {
    angles.push((i / CIRCLE_SEGMENTS) * Math.PI * 2);
  }

  // 2. For each wall endpoint within range, add 3 rays (angle ± epsilon)
  for (const wall of walls) {
    for (const [px, py] of [
      [wall.x1, wall.y1],
      [wall.x2, wall.y2],
    ]) {
      const dx = px - ox;
      const dy = py - oy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= range + EPSILON) {
        const angle = Math.atan2(dy, dx);
        angles.push(angle - ANGLE_EPSILON);
        angles.push(angle);
        angles.push(angle + ANGLE_EPSILON);
      }
    }
  }

  // 3. Sort angles
  angles.sort((a, b) => a - b);

  // 4. For each angle, cast ray and find nearest wall intersection
  const points: Point[] = [];

  for (const angle of angles) {
    const rdx = Math.cos(angle);
    const rdy = Math.sin(angle);

    let nearestT = range;
    let hit: Point | null = null;

    for (const wall of walls) {
      const result = raySegmentIntersect(ox, oy, rdx, rdy, wall);
      if (result !== null) {
        const dx = result.x - ox;
        const dy = result.y - oy;
        const t = Math.sqrt(dx * dx + dy * dy);
        if (t < nearestT) {
          nearestT = t;
          hit = result;
        }
      }
    }

    // 5. If no wall hit, use range limit point
    if (hit === null) {
      points.push({
        x: ox + rdx * range,
        y: oy + rdy * range,
      });
    } else {
      points.push(hit);
    }
  }

  // 6. Deduplicate very close points
  const deduped: Point[] = [];
  for (const pt of points) {
    if (deduped.length === 0) {
      deduped.push(pt);
      continue;
    }
    const prev = deduped[deduped.length - 1];
    const dx = pt.x - prev.x;
    const dy = pt.y - prev.y;
    if (Math.sqrt(dx * dx + dy * dy) > EPSILON) {
      deduped.push(pt);
    }
  }

  return deduped;
}
