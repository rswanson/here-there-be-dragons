import { describe, it, expect } from 'vitest';
import { coneAffectedSquares, cubeAffectedSquares, sphereAffectedSquares, lineAffectedSquares } from '../aoe';

describe('sphereAffectedSquares', () => {
  it('returns center square for radius 0', () => {
    const squares = sphereAffectedSquares(5, 5, 0);
    expect(squares).toEqual([{ col: 5, row: 5 }]);
  });

  it('returns correct squares for 10ft sphere (radius 2)', () => {
    const squares = sphereAffectedSquares(5, 5, 2);
    expect(squares.length).toBeGreaterThan(4);
    expect(squares).toContainEqual({ col: 5, row: 5 });
    expect(squares).not.toContainEqual({ col: 3, row: 3 });
  });
});

describe('cubeAffectedSquares', () => {
  it('returns correct NxN squares', () => {
    const squares = cubeAffectedSquares(2, 3, 3);
    expect(squares.length).toBe(9);
    expect(squares).toContainEqual({ col: 2, row: 3 });
    expect(squares).toContainEqual({ col: 4, row: 5 });
  });
});

describe('coneAffectedSquares', () => {
  it('returns squares in cone direction', () => {
    const squares = coneAffectedSquares(5, 5, 3, 0, 90);
    expect(squares.length).toBeGreaterThan(0);
    expect(squares.every(s => s.col >= 5)).toBe(true);
  });
});

describe('lineAffectedSquares', () => {
  it('returns squares along a horizontal line', () => {
    const squares = lineAffectedSquares(2, 3, 5, 0, 1);
    expect(squares.length).toBe(5);
    expect(squares[0]).toEqual({ col: 2, row: 3 });
    expect(squares[4]).toEqual({ col: 6, row: 3 });
  });
});
