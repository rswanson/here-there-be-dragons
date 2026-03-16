export interface PixelPoint { x: number; y: number; }
export interface GridPoint { col: number; row: number; }

export type DiagonalMode = 'dnd_standard' | 'euclidean' | 'manhattan';
export type SnapMode = 'off' | 'center' | 'corner';

export function gridToPixel(col: number, row: number, cellSize: number): PixelPoint {
  return { x: col * cellSize, y: row * cellSize };
}

export function pixelToGrid(x: number, y: number, cellSize: number): GridPoint {
  return { col: Math.floor(x / cellSize), row: Math.floor(y / cellSize) };
}

export function snapToCenter(x: number, y: number, cellSize: number): PixelPoint {
  const col = Math.floor(x / cellSize);
  const row = Math.floor(y / cellSize);
  return { x: col * cellSize + cellSize / 2, y: row * cellSize + cellSize / 2 };
}

export function snapToCorner(x: number, y: number, cellSize: number): PixelPoint {
  return {
    x: Math.round(x / cellSize) * cellSize,
    y: Math.round(y / cellSize) * cellSize,
  };
}

export function snapPosition(x: number, y: number, cellSize: number, mode: SnapMode): PixelPoint {
  switch (mode) {
    case 'center': return snapToCenter(x, y, cellSize);
    case 'corner': return snapToCorner(x, y, cellSize);
    case 'off': return { x, y };
  }
}

export function gridDistance(
  c1: number, r1: number, c2: number, r2: number,
  gridScale: number, mode: DiagonalMode,
): number {
  return diagonalDistance(c1, r1, c2, r2, gridScale, mode);
}

export function diagonalDistance(
  c1: number, r1: number, c2: number, r2: number,
  gridScale: number, mode: DiagonalMode,
): number {
  const dc = Math.abs(c2 - c1);
  const dr = Math.abs(r2 - r1);

  switch (mode) {
    case 'euclidean':
      return Math.sqrt(dc * dc + dr * dr) * gridScale;

    case 'manhattan':
      return (dc + dr) * gridScale;

    case 'dnd_standard': {
      const diag = Math.min(dc, dr);
      const straight = Math.max(dc, dr) - diag;
      const diagCost = Math.floor(diag / 2) * 3 + (diag % 2);
      return (straight + diagCost) * gridScale;
    }
  }
}

export function waypointDistance(
  points: GridPoint[],
  gridScale: number,
  mode: DiagonalMode,
): { segments: number[]; total: number } {
  const segments: number[] = [];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const d = gridDistance(
      points[i - 1].col, points[i - 1].row,
      points[i].col, points[i].row,
      gridScale, mode,
    );
    segments.push(d);
    total += d;
  }
  return { segments, total };
}
