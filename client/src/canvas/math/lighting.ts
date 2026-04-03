export const LightLevel = {
  Bright: 'bright',
  Dim: 'dim',
  Dark: 'dark',
} as const

export type LightLevel = (typeof LightLevel)[keyof typeof LightLevel]

export type LightSource = {
  x: number;
  y: number;
  bright: number;
  dim: number;
};

/**
 * Compute the light level at point (cx, cy) given a set of light sources
 * and a darkvision range.
 *
 * Rules:
 * - If within any source's bright radius → Bright (immediate return)
 * - If within any source's bright+dim radius → Dim candidate
 * - After all sources: if Dark and darkvisionRange > 0 → Dim
 * - Darkvision never upgrades Dim to Bright
 */
export function computeLightLevel(
  cx: number,
  cy: number,
  sources: LightSource[],
  darkvisionRange: number,
): LightLevel {
  let best: LightLevel = LightLevel.Dark;

  for (const source of sources) {
    const dx = cx - source.x;
    const dy = cy - source.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist <= source.bright) {
      return LightLevel.Bright;
    }

    if (dist <= source.bright + source.dim) {
      best = LightLevel.Dim;
    }
  }

  if (best === LightLevel.Dark && darkvisionRange > 0) {
    return LightLevel.Dim;
  }

  return best;
}
