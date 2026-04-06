import { describe, it, expect, beforeEach } from 'vitest';
import { useVisionStore } from '../vision';
import type { Point } from '../../canvas/math/raycasting';

const makePolygon = (): Point[] => [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 10 },
  { x: 0, y: 10 },
];

describe('useVisionStore', () => {
  beforeEach(() => {
    useVisionStore.setState(useVisionStore.getInitialState());
  });

  it('starts with no polygons and clean dirty flag', () => {
    const state = useVisionStore.getState();
    expect(state.polygons).toEqual({});
    expect(state.dirty).toBe(false);
  });

  it('setPolygon stores polygon for a token', () => {
    const polygon = makePolygon();
    useVisionStore.getState().setPolygon('token-1', polygon);
    expect(useVisionStore.getState().polygons['token-1']).toEqual(polygon);
  });

  it('setPolygon stores multiple polygons independently', () => {
    useVisionStore.getState().setPolygon('token-1', makePolygon());
    useVisionStore.getState().setPolygon('token-2', [{ x: 5, y: 5 }]);
    const state = useVisionStore.getState();
    expect(Object.keys(state.polygons)).toHaveLength(2);
    expect(state.polygons['token-2']).toEqual([{ x: 5, y: 5 }]);
  });

  it('setPolygon overwrites existing polygon for same token', () => {
    useVisionStore.getState().setPolygon('token-1', makePolygon());
    const updated = [{ x: 1, y: 2 }];
    useVisionStore.getState().setPolygon('token-1', updated);
    expect(useVisionStore.getState().polygons['token-1']).toEqual(updated);
  });

  it('clearPolygons removes all polygons', () => {
    useVisionStore.getState().setPolygon('token-1', makePolygon());
    useVisionStore.getState().setPolygon('token-2', makePolygon());
    useVisionStore.getState().clearPolygons();
    expect(useVisionStore.getState().polygons).toEqual({});
  });

  it('setDirty sets dirty to true', () => {
    useVisionStore.getState().setDirty();
    expect(useVisionStore.getState().dirty).toBe(true);
  });

  it('clearDirty sets dirty to false', () => {
    useVisionStore.getState().setDirty();
    useVisionStore.getState().clearDirty();
    expect(useVisionStore.getState().dirty).toBe(false);
  });

  it('dirty starts false and can be toggled', () => {
    expect(useVisionStore.getState().dirty).toBe(false);
    useVisionStore.getState().setDirty();
    expect(useVisionStore.getState().dirty).toBe(true);
    useVisionStore.getState().clearDirty();
    expect(useVisionStore.getState().dirty).toBe(false);
  });
});
