/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach } from 'vitest';
import { useDrawingStore } from '../drawings';

describe('useDrawingStore', () => {
  beforeEach(() => {
    useDrawingStore.setState(useDrawingStore.getInitialState());
  });

  it('starts empty', () => {
    expect(useDrawingStore.getState().drawings).toEqual([]);
  });

  it('adds and removes drawings', () => {
    const d = { id: 'd1', layer_id: 'l1', drawing_type: 'line' } as any;
    useDrawingStore.getState().addDrawing(d);
    expect(useDrawingStore.getState().drawings.length).toBe(1);

    useDrawingStore.getState().removeDrawing('d1');
    expect(useDrawingStore.getState().drawings.length).toBe(0);
  });

  it('supports undo/redo', () => {
    const d1 = { id: 'd1', layer_id: 'l1' } as any;
    useDrawingStore.getState().addDrawing(d1);

    useDrawingStore.getState().undo('l1');
    expect(useDrawingStore.getState().drawings.length).toBe(0);

    useDrawingStore.getState().redo('l1');
    expect(useDrawingStore.getState().drawings.length).toBe(1);
  });
});
