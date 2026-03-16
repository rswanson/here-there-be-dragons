import { describe, it, expect } from 'vitest';
import {
  gridToPixel, pixelToGrid, snapToCenter, snapToCorner,
  gridDistance, diagonalDistance, waypointDistance,
} from '../grid';

describe('gridToPixel', () => {
  it('converts grid coords to pixel coords', () => {
    expect(gridToPixel(3, 2, 70)).toEqual({ x: 210, y: 140 });
  });

  it('handles fractional grid coords', () => {
    expect(gridToPixel(1.5, 2.5, 70)).toEqual({ x: 105, y: 175 });
  });
});

describe('pixelToGrid', () => {
  it('converts pixel coords to grid coords', () => {
    expect(pixelToGrid(210, 140, 70)).toEqual({ col: 3, row: 2 });
  });

  it('floors fractional positions', () => {
    expect(pixelToGrid(215, 145, 70)).toEqual({ col: 3, row: 2 });
  });
});

describe('snapToCenter', () => {
  it('snaps pixel position to cell center', () => {
    expect(snapToCenter(215, 145, 70)).toEqual({ x: 245, y: 175 });
  });
});

describe('snapToCorner', () => {
  it('snaps pixel position to nearest grid intersection', () => {
    expect(snapToCorner(215, 145, 70)).toEqual({ x: 210, y: 140 });
  });

  it('snaps to nearest corner', () => {
    expect(snapToCorner(260, 170, 70)).toEqual({ x: 280, y: 140 });
  });
});

describe('diagonalDistance', () => {
  it('computes dnd_standard distance (alternating 5/10)', () => {
    expect(diagonalDistance(0, 0, 3, 3, 5, 'dnd_standard')).toBe(20);
  });

  it('computes euclidean distance', () => {
    const d = diagonalDistance(0, 0, 3, 4, 5, 'euclidean');
    expect(d).toBeCloseTo(25);
  });

  it('computes manhattan distance', () => {
    expect(diagonalDistance(0, 0, 3, 4, 5, 'manhattan')).toBe(35);
  });

  it('computes straight line distance', () => {
    expect(diagonalDistance(0, 0, 0, 5, 5, 'dnd_standard')).toBe(25);
  });
});

describe('gridDistance', () => {
  it('computes distance between two grid points', () => {
    expect(gridDistance(0, 0, 3, 0, 5, 'dnd_standard')).toBe(15);
  });
});

describe('waypointDistance', () => {
  it('computes total distance for multi-segment path', () => {
    const result = waypointDistance(
      [{ col: 0, row: 0 }, { col: 3, row: 0 }, { col: 3, row: 4 }],
      5, 'dnd_standard',
    );
    expect(result.segments).toEqual([15, 20]);
    expect(result.total).toBe(35);
  });

  it('returns empty for single point', () => {
    const result = waypointDistance([{ col: 0, row: 0 }], 5, 'dnd_standard');
    expect(result.segments).toEqual([]);
    expect(result.total).toBe(0);
  });
});
