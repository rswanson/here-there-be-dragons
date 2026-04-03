import { describe, it, expect } from 'vitest';
import { computeLightLevel, LightLevel } from '../lighting';
import type { LightSource } from '../lighting';

describe('computeLightLevel', () => {
  const singleSource: LightSource = { x: 0, y: 0, bright: 10, dim: 5 };

  it('bright within bright radius', () => {
    expect(computeLightLevel(5, 0, [singleSource], 0)).toBe(LightLevel.Bright);
  });

  it('bright at edge of bright radius', () => {
    expect(computeLightLevel(10, 0, [singleSource], 0)).toBe(LightLevel.Bright);
  });

  it('dim beyond bright radius but within bright+dim radius', () => {
    expect(computeLightLevel(13, 0, [singleSource], 0)).toBe(LightLevel.Dim);
  });

  it('dim at edge of dim radius', () => {
    expect(computeLightLevel(15, 0, [singleSource], 0)).toBe(LightLevel.Dim);
  });

  it('dark beyond all radii', () => {
    expect(computeLightLevel(20, 0, [singleSource], 0)).toBe(LightLevel.Dark);
  });

  it('darkvision treats dark as dim when no sources reach the point', () => {
    expect(computeLightLevel(20, 0, [singleSource], 30)).toBe(LightLevel.Dim);
  });

  it('darkvision does not upgrade dim to bright', () => {
    // In dim zone from the source, darkvision should keep it dim (not bright)
    expect(computeLightLevel(13, 0, [singleSource], 30)).toBe(LightLevel.Dim);
  });

  it('darkvision does not affect bright zone', () => {
    // Already bright, darkvision irrelevant
    expect(computeLightLevel(5, 0, [singleSource], 30)).toBe(LightLevel.Bright);
  });

  it('multiple sources — best level wins (dim if neither source reaches bright)', () => {
    const sources: LightSource[] = [
      { x: 0, y: 0, bright: 5, dim: 5 },
      { x: 50, y: 0, bright: 5, dim: 5 },
    ];
    // Point at (8, 0): distance 8 from first (beyond bright 5, within dim zone 5+5=10) → Dim
    // distance 42 from second (beyond both) → no upgrade
    expect(computeLightLevel(8, 0, sources, 0)).toBe(LightLevel.Dim);
  });

  it('multiple sources — bright if any source makes it bright', () => {
    const sources: LightSource[] = [
      { x: 0, y: 0, bright: 5, dim: 5 },
      { x: 20, y: 0, bright: 15, dim: 5 },
    ];
    // Point at (8, 0): distance 8 from first (beyond bright+dim), distance 12 from second (within bright 15)
    expect(computeLightLevel(8, 0, sources, 0)).toBe(LightLevel.Bright);
  });

  it('no sources and no darkvision → dark', () => {
    expect(computeLightLevel(0, 0, [], 0)).toBe(LightLevel.Dark);
  });

  it('no sources but darkvision > 0 → dim', () => {
    expect(computeLightLevel(0, 0, [], 60)).toBe(LightLevel.Dim);
  });

  it('empty sources array with darkvision still gives dim', () => {
    expect(computeLightLevel(100, 100, [], 999)).toBe(LightLevel.Dim);
  });
});
