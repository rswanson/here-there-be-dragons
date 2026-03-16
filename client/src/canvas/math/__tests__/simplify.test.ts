import { describe, it, expect } from 'vitest';
import { simplifyPoints } from '../simplify';

describe('simplifyPoints (Ramer-Douglas-Peucker)', () => {
  it('returns endpoints for a straight line', () => {
    const points = [
      { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 },
      { x: 3, y: 0 }, { x: 4, y: 0 },
    ];
    const result = simplifyPoints(points, 1);
    expect(result).toEqual([{ x: 0, y: 0 }, { x: 4, y: 0 }]);
  });

  it('preserves corners', () => {
    const points = [
      { x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 },
    ];
    const result = simplifyPoints(points, 1);
    expect(result.length).toBe(3);
  });

  it('reduces point count for noisy curves', () => {
    // Generate a noisy sine wave
    const points = Array.from({ length: 100 }, (_, i) => ({
      x: i,
      y: Math.sin(i / 10) * 20 + (Math.random() - 0.5) * 2,
    }));
    const result = simplifyPoints(points, 2);
    expect(result.length).toBeLessThan(points.length);
    expect(result.length).toBeGreaterThan(2);
  });

  it('returns original for 2 or fewer points', () => {
    expect(simplifyPoints([{ x: 0, y: 0 }], 1)).toEqual([{ x: 0, y: 0 }]);
    expect(simplifyPoints([], 1)).toEqual([]);
  });
});
