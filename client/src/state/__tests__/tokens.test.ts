/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach } from 'vitest';
import { useTokenStore } from '../tokens';

describe('useTokenStore', () => {
  beforeEach(() => {
    useTokenStore.setState(useTokenStore.getInitialState());
  });

  it('starts with empty tokens', () => {
    expect(useTokenStore.getState().tokens).toEqual([]);
    expect(useTokenStore.getState().selectedIds).toEqual([]);
  });

  it('loads tokens', () => {
    useTokenStore.getState().loadTokens([
      { id: 't1', name: 'Goblin' } as any,
      { id: 't2', name: 'Orc' } as any,
    ]);
    expect(useTokenStore.getState().tokens.length).toBe(2);
  });

  it('selects and deselects tokens', () => {
    useTokenStore.getState().loadTokens([{ id: 't1' } as any]);
    useTokenStore.getState().selectToken('t1');
    expect(useTokenStore.getState().selectedIds).toEqual(['t1']);

    useTokenStore.getState().deselectAll();
    expect(useTokenStore.getState().selectedIds).toEqual([]);
  });

  it('toggle-selects for multi-select', () => {
    useTokenStore.getState().loadTokens([
      { id: 't1' } as any, { id: 't2' } as any,
    ]);
    useTokenStore.getState().selectToken('t1');
    useTokenStore.getState().toggleSelect('t2');
    expect(useTokenStore.getState().selectedIds).toEqual(['t1', 't2']);

    useTokenStore.getState().toggleSelect('t1');
    expect(useTokenStore.getState().selectedIds).toEqual(['t2']);
  });

  it('updates token position', () => {
    useTokenStore.getState().loadTokens([{ id: 't1', x: 0, y: 0 } as any]);
    useTokenStore.getState().moveToken('t1', 5, 3);
    const token = useTokenStore.getState().tokens[0];
    expect(token.x).toBe(5);
    expect(token.y).toBe(3);
  });
});
