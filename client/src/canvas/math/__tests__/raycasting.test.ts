import { describe, it, expect } from 'vitest';
import { computeVisibilityPolygon, raySegmentIntersect } from '../raycasting';
import type { Point, Segment } from '../raycasting';

// Helper: compute signed polygon area via shoelace formula
function area(polygon: Point[]): number {
  let a = 0;
  const n = polygon.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    a += polygon[i].x * polygon[j].y;
    a -= polygon[j].x * polygon[i].y;
  }
  return Math.abs(a) / 2;
}

// Helper: point-in-polygon using ray casting
function isPointInPolygon(px: number, py: number, polygon: Point[]): boolean {
  let inside = false;
  const n = polygon.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

describe('raySegmentIntersect', () => {
  it('returns intersection point for crossing ray and segment', () => {
    // Ray along +x from origin, segment along y-axis at x=5
    const result = raySegmentIntersect(0, 0, 1, 0, { x1: 5, y1: -5, x2: 5, y2: 5 });
    expect(result).not.toBeNull();
    expect(result!.x).toBeCloseTo(5, 4);
    expect(result!.y).toBeCloseTo(0, 4);
  });

  it('returns null for parallel ray and segment', () => {
    // Ray along +x from origin, segment also along +x at y=1
    const result = raySegmentIntersect(0, 0, 1, 0, { x1: 0, y1: 1, x2: 10, y2: 1 });
    expect(result).toBeNull();
  });

  it('returns null for ray in opposite direction', () => {
    // Segment behind the ray origin
    const result = raySegmentIntersect(0, 0, 1, 0, { x1: -5, y1: -1, x2: -5, y2: 1 });
    expect(result).toBeNull();
  });
});

describe('computeVisibilityPolygon', () => {
  it('no walls — forms approximate circle with area within 15% of πr²', () => {
    const r = 100;
    const polygon = computeVisibilityPolygon(0, 0, r, []);
    expect(polygon.length).toBeGreaterThan(10);
    const polyArea = area(polygon);
    const circleArea = Math.PI * r * r;
    const ratio = polyArea / circleArea;
    // Circle approximated with 32 segments should be within 1% of πr²
    expect(ratio).toBeGreaterThan(0.85);
    expect(ratio).toBeLessThanOrEqual(1.05);
  });

  it('vertical wall blocks one side — all polygon points are on the near side', () => {
    const r = 100;
    // Vertical wall at x=10 blocking everything beyond
    const walls: Segment[] = [{ x1: 10, y1: -200, x2: 10, y2: 200 }];
    const polygon = computeVisibilityPolygon(0, 0, r, walls);
    // No point should be more than ~range past the wall
    for (const pt of polygon) {
      expect(pt.x).toBeLessThanOrEqual(10 + 0.01);
    }
  });

  it('box room — full interior visible (~100 sq units for 10x10)', () => {
    const r = 20;
    // 10x10 box centered at (0,0): walls along all 4 sides
    const walls: Segment[] = [
      { x1: -5, y1: -5, x2: 5, y2: -5 }, // bottom
      { x1: 5, y1: -5, x2: 5, y2: 5 },   // right
      { x1: 5, y1: 5, x2: -5, y2: 5 },   // top
      { x1: -5, y1: 5, x2: -5, y2: -5 }, // left
    ];
    const polygon = computeVisibilityPolygon(0, 0, r, walls);
    const polyArea = area(polygon);
    // Should be close to 100 sq units (10x10 = 100), allow some overshoot at corners
    expect(polyArea).toBeGreaterThan(80);
    expect(polyArea).toBeLessThan(130);
  });

  it('L-shaped corridor — corner is hidden from origin', () => {
    const r = 200;
    // Origin at (0, 0)
    // L-shaped corridor: goes right then turns north
    // Block the corner by placing walls that form an L
    // The far end of the corridor (around x=30, y=30) should not be visible
    const walls: Segment[] = [
      // Bottom wall of horizontal corridor
      { x1: 0, y1: -5, x2: 20, y2: -5 },
      // Top wall of horizontal corridor - stops at the turn
      { x1: 0, y1: 5, x2: 10, y2: 5 },
      // Corner block
      { x1: 10, y1: 5, x2: 10, y2: 30 },
      // Right wall of vertical corridor
      { x1: 20, y1: -5, x2: 20, y2: 30 },
    ];
    const polygon = computeVisibilityPolygon(0, 0, r, walls);
    // Point deep in the hidden corner (around x=15, y=20) should not be visible
    const hiddenPoint = isPointInPolygon(15, 20, polygon);
    expect(hiddenPoint).toBe(false);
  });
});
