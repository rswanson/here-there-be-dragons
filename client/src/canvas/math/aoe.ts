import type { GridPoint } from './grid';

export function sphereAffectedSquares(
  centerCol: number, centerRow: number, radius: number,
): GridPoint[] {
  if (radius === 0) return [{ col: centerCol, row: centerRow }];

  const squares: GridPoint[] = [];
  const r = radius + 0.5;
  for (let c = centerCol - radius; c <= centerCol + radius; c++) {
    for (let r2 = centerRow - radius; r2 <= centerRow + radius; r2++) {
      const dc = c - centerCol;
      const dr = r2 - centerRow;
      if (Math.sqrt(dc * dc + dr * dr) <= r) {
        squares.push({ col: c, row: r2 });
      }
    }
  }
  return squares;
}

export function cubeAffectedSquares(
  originCol: number, originRow: number, size: number,
): GridPoint[] {
  const squares: GridPoint[] = [];
  for (let c = originCol; c < originCol + size; c++) {
    for (let r = originRow; r < originRow + size; r++) {
      squares.push({ col: c, row: r });
    }
  }
  return squares;
}

export function coneAffectedSquares(
  originCol: number, originRow: number,
  length: number, direction: number, angle: number = 90,
): GridPoint[] {
  const squares: GridPoint[] = [];
  const halfAngle = (angle / 2) * (Math.PI / 180);
  const dirRad = direction * (Math.PI / 180);

  for (let c = originCol - length; c <= originCol + length; c++) {
    for (let r = originRow - length; r <= originRow + length; r++) {
      const dx = (c + 0.5) - originCol;
      const dy = (r + 0.5) - originRow;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist === 0 || dist > length + 0.5) continue;

      const cellAngle = Math.atan2(dy, dx);
      let angleDiff = Math.abs(cellAngle - dirRad);
      if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff;

      if (angleDiff <= halfAngle) {
        squares.push({ col: c, row: r });
      }
    }
  }
  return squares;
}

export function lineAffectedSquares(
  originCol: number, originRow: number,
  length: number, direction: number, width: number = 1,
): GridPoint[] {
  const squares: GridPoint[] = [];
  const dirRad = direction * (Math.PI / 180);
  const perpRad = dirRad + Math.PI / 2;

  const dx = Math.cos(dirRad);
  const dy = Math.sin(dirRad);
  const px = Math.cos(perpRad);
  const py = Math.sin(perpRad);

  const halfWidth = (width - 1) / 2;

  for (let l = 0; l < length; l++) {
    for (let w = -Math.floor(halfWidth); w <= Math.ceil(halfWidth); w++) {
      const col = Math.round(originCol + dx * l + px * w);
      const row = Math.round(originRow + dy * l + py * w);
      if (!squares.some(s => s.col === col && s.row === row)) {
        squares.push({ col, row });
      }
    }
  }
  return squares;
}
