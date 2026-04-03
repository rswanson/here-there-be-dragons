import { describe, it, expect, beforeEach } from 'vitest';
import { useFogStore } from '../fog';
import type { FogCell } from '../../types/FogCell';

describe('useFogStore', () => {
  beforeEach(() => {
    useFogStore.setState(useFogStore.getInitialState());
  });

  it('starts empty with dm vision mode', () => {
    const state = useFogStore.getState();
    expect(state.revealedCells.size).toBe(0);
    expect(state.exploredCells.size).toBe(0);
    expect(state.visionMode).toBe('dm');
    expect(state.previewPlayerId).toBeNull();
  });

  it('loadRevealedCells populates revealed set', () => {
    const cells: FogCell[] = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
    ];
    useFogStore.getState().loadRevealedCells(cells);
    expect(useFogStore.getState().revealedCells.size).toBe(3);
    expect(useFogStore.getState().isRevealed(0, 0)).toBe(true);
    expect(useFogStore.getState().isRevealed(1, 0)).toBe(true);
    expect(useFogStore.getState().isRevealed(5, 5)).toBe(false);
  });

  it('loadRevealedCells replaces previous state', () => {
    useFogStore.getState().loadRevealedCells([{ x: 0, y: 0 }, { x: 1, y: 1 }]);
    useFogStore.getState().loadRevealedCells([{ x: 5, y: 5 }]);
    expect(useFogStore.getState().revealedCells.size).toBe(1);
    expect(useFogStore.getState().isRevealed(0, 0)).toBe(false);
    expect(useFogStore.getState().isRevealed(5, 5)).toBe(true);
  });

  it('revealCells adds to existing revealed cells', () => {
    useFogStore.getState().loadRevealedCells([{ x: 0, y: 0 }]);
    useFogStore.getState().revealCells([{ x: 1, y: 1 }, { x: 2, y: 2 }]);
    expect(useFogStore.getState().revealedCells.size).toBe(3);
    expect(useFogStore.getState().isRevealed(0, 0)).toBe(true);
    expect(useFogStore.getState().isRevealed(1, 1)).toBe(true);
  });

  it('revealCells deduplicates', () => {
    useFogStore.getState().loadRevealedCells([{ x: 0, y: 0 }]);
    useFogStore.getState().revealCells([{ x: 0, y: 0 }, { x: 1, y: 1 }]);
    expect(useFogStore.getState().revealedCells.size).toBe(2);
  });

  it('hideCells removes from revealed cells', () => {
    useFogStore.getState().loadRevealedCells([{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }]);
    useFogStore.getState().hideCells([{ x: 0, y: 0 }, { x: 2, y: 2 }]);
    expect(useFogStore.getState().revealedCells.size).toBe(1);
    expect(useFogStore.getState().isRevealed(0, 0)).toBe(false);
    expect(useFogStore.getState().isRevealed(1, 1)).toBe(true);
  });

  it('hideCells ignores cells not in the set', () => {
    useFogStore.getState().loadRevealedCells([{ x: 0, y: 0 }]);
    useFogStore.getState().hideCells([{ x: 99, y: 99 }]);
    expect(useFogStore.getState().revealedCells.size).toBe(1);
  });

  it('setVisionMode switches to player mode', () => {
    useFogStore.getState().setVisionMode('player', 'user-abc');
    const state = useFogStore.getState();
    expect(state.visionMode).toBe('player');
    expect(state.previewPlayerId).toBe('user-abc');
  });

  it('setVisionMode switches back to dm mode', () => {
    useFogStore.getState().setVisionMode('player', 'user-abc');
    useFogStore.getState().setVisionMode('dm');
    const state = useFogStore.getState();
    expect(state.visionMode).toBe('dm');
    expect(state.previewPlayerId).toBeNull();
  });

  it('markExplored adds to exploredCells', () => {
    useFogStore.getState().markExplored(3, 4);
    expect(useFogStore.getState().isExplored(3, 4)).toBe(true);
    expect(useFogStore.getState().isExplored(3, 5)).toBe(false);
  });

  it('isExplored returns false for unexplored cell', () => {
    expect(useFogStore.getState().isExplored(0, 0)).toBe(false);
  });

  it('markExplored is idempotent', () => {
    useFogStore.getState().markExplored(1, 1);
    useFogStore.getState().markExplored(1, 1);
    expect(useFogStore.getState().exploredCells.size).toBe(1);
  });
});
