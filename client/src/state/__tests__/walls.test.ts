import { describe, it, expect, beforeEach } from 'vitest';
import { useWallStore } from '../walls';
import type { Wall } from '../../types/Wall';

const makeWall = (overrides: Partial<Wall> = {}): Wall => ({
  id: 'wall-1',
  map_id: 'map-1',
  x1: 0,
  y1: 0,
  x2: 100,
  y2: 0,
  wall_type: 'wall',
  door_state: 'closed',
  created_at: '2026-01-01T00:00:00Z',
  ...overrides,
});

describe('useWallStore', () => {
  beforeEach(() => {
    useWallStore.setState(useWallStore.getInitialState());
  });

  it('starts empty', () => {
    const state = useWallStore.getState();
    expect(state.walls).toEqual([]);
    expect(state.selectedIds).toEqual([]);
  });

  it('loadWalls replaces existing walls and clears selection', () => {
    useWallStore.getState().selectWall('wall-old');
    const walls = [makeWall({ id: 'wall-1' }), makeWall({ id: 'wall-2' })];
    useWallStore.getState().loadWalls(walls);
    const state = useWallStore.getState();
    expect(state.walls).toHaveLength(2);
    expect(state.selectedIds).toEqual([]);
  });

  it('addWalls deduplicates by id', () => {
    useWallStore.getState().addWalls([makeWall({ id: 'wall-1' })]);
    useWallStore.getState().addWalls([makeWall({ id: 'wall-1' }), makeWall({ id: 'wall-2' })]);
    expect(useWallStore.getState().walls).toHaveLength(2);
  });

  it('addWalls appends new walls', () => {
    useWallStore.getState().addWalls([makeWall({ id: 'wall-1' })]);
    useWallStore.getState().addWalls([makeWall({ id: 'wall-2' }), makeWall({ id: 'wall-3' })]);
    expect(useWallStore.getState().walls).toHaveLength(3);
  });

  it('removeWalls removes by id', () => {
    useWallStore
      .getState()
      .loadWalls([makeWall({ id: 'wall-1' }), makeWall({ id: 'wall-2' }), makeWall({ id: 'wall-3' })]);
    useWallStore.getState().removeWalls(['wall-1', 'wall-3']);
    const walls = useWallStore.getState().walls;
    expect(walls).toHaveLength(1);
    expect(walls[0].id).toBe('wall-2');
  });

  it('removeWalls also removes from selectedIds', () => {
    useWallStore.getState().loadWalls([makeWall({ id: 'wall-1' }), makeWall({ id: 'wall-2' })]);
    useWallStore.getState().selectWall('wall-1');
    useWallStore.getState().removeWalls(['wall-1']);
    expect(useWallStore.getState().selectedIds).toEqual([]);
  });

  it('updateWall patches matching wall', () => {
    useWallStore.getState().loadWalls([makeWall({ id: 'wall-1', x2: 100 })]);
    useWallStore.getState().updateWall('wall-1', { x2: 200 });
    const wall = useWallStore.getState().walls.find((w) => w.id === 'wall-1');
    expect(wall?.x2).toBe(200);
  });

  it('updateWall does not affect other walls', () => {
    useWallStore.getState().loadWalls([makeWall({ id: 'wall-1' }), makeWall({ id: 'wall-2', x2: 50 })]);
    useWallStore.getState().updateWall('wall-1', { x2: 999 });
    const other = useWallStore.getState().walls.find((w) => w.id === 'wall-2');
    expect(other?.x2).toBe(50);
  });

  it('updateDoorState changes door_state on matching wall', () => {
    useWallStore.getState().loadWalls([makeWall({ id: 'wall-1', wall_type: 'door', door_state: 'closed' })]);
    useWallStore.getState().updateDoorState('wall-1', 'open');
    const wall = useWallStore.getState().walls.find((w) => w.id === 'wall-1');
    expect(wall?.door_state).toBe('open');
  });

  it('updateDoorState can set locked state', () => {
    useWallStore.getState().loadWalls([makeWall({ id: 'wall-1', wall_type: 'door', door_state: 'open' })]);
    useWallStore.getState().updateDoorState('wall-1', 'locked');
    const wall = useWallStore.getState().walls.find((w) => w.id === 'wall-1');
    expect(wall?.door_state).toBe('locked');
  });

  it('selectWall sets selectedIds to single wall', () => {
    useWallStore.getState().loadWalls([makeWall({ id: 'wall-1' }), makeWall({ id: 'wall-2' })]);
    useWallStore.getState().selectWall('wall-1');
    useWallStore.getState().selectWall('wall-2');
    expect(useWallStore.getState().selectedIds).toEqual(['wall-2']);
  });

  it('deselectAll clears selection', () => {
    useWallStore.getState().loadWalls([makeWall({ id: 'wall-1' })]);
    useWallStore.getState().selectWall('wall-1');
    useWallStore.getState().deselectAll();
    expect(useWallStore.getState().selectedIds).toEqual([]);
  });
});
