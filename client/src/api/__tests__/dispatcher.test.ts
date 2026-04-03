/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach } from 'vitest';
import { createMessageDispatcher } from '../dispatcher';
import { useTokenStore } from '../../state/tokens';
import { useDrawingStore } from '../../state/drawings';
import { usePresenceStore } from '../../state/presence';
import { useMapStore } from '../../state/map';

describe('createMessageDispatcher', () => {
  const dispatch = createMessageDispatcher();

  beforeEach(() => {
    useTokenStore.setState(useTokenStore.getInitialState());
    useDrawingStore.setState(useDrawingStore.getInitialState());
    usePresenceStore.setState(usePresenceStore.getInitialState());
    useMapStore.setState(useMapStore.getInitialState());
  });

  it('TokenMoved routes to token store and updates position', () => {
    useTokenStore.getState().loadTokens([
      { id: 't1', x: 0, y: 0 } as any,
    ]);

    dispatch({
      type: 'TokenMoved',
      payload: { token_id: 't1', x: 5, y: 3, moved_by: 'u1' },
    });

    const token = useTokenStore.getState().tokens[0];
    expect(token.x).toBe(5);
    expect(token.y).toBe(3);
  });

  it('TokenCreated adds token to store', () => {
    dispatch({
      type: 'TokenCreated',
      payload: {
        layer_id: 'l1',
        token: { id: 't1', name: 'Goblin' } as any,
        created_by: 'u1',
      },
    });

    expect(useTokenStore.getState().tokens).toHaveLength(1);
    expect(useTokenStore.getState().tokens[0].id).toBe('t1');
  });

  it('TokenUpdated patches token in store', () => {
    useTokenStore.getState().loadTokens([
      { id: 't1', name: 'Goblin', x: 0, y: 0 } as any,
    ]);

    dispatch({
      type: 'TokenUpdated',
      payload: {
        token_id: 't1',
        patch: { name: 'Hobgoblin' } as any,
        updated_by: 'u1',
      },
    });

    expect(useTokenStore.getState().tokens[0].name).toBe('Hobgoblin');
  });

  it('TokenDeleted removes token from store', () => {
    useTokenStore.getState().loadTokens([{ id: 't1' } as any]);

    dispatch({
      type: 'TokenDeleted',
      payload: { token_id: 't1', deleted_by: 'u1' },
    });

    expect(useTokenStore.getState().tokens).toHaveLength(0);
  });

  it('DrawingCreated adds drawing to store', () => {
    dispatch({
      type: 'DrawingCreated',
      payload: {
        layer_id: 'l1',
        drawing: { id: 'd1', layer_id: 'l1' } as any,
      },
    });

    expect(useDrawingStore.getState().drawings).toHaveLength(1);
    expect(useDrawingStore.getState().drawings[0].id).toBe('d1');
  });

  it('DrawingDeleted removes drawing from store', () => {
    useDrawingStore.getState().loadDrawings([
      { id: 'd1', layer_id: 'l1' } as any,
    ]);

    dispatch({
      type: 'DrawingDeleted',
      payload: { drawing_id: 'd1' },
    });

    expect(useDrawingStore.getState().drawings).toHaveLength(0);
  });

  it('SessionJoined routes to presence store', () => {
    dispatch({
      type: 'SessionJoined',
      payload: {
        user_id: 'u1',
        campaign_id: 'c1',
        connected_users: [
          { user_id: 'u1', display_name: 'Alice', role: 'dm' },
        ],
      },
    });

    const state = usePresenceStore.getState();
    expect(state.isConnected).toBe(true);
    expect(state.connectedUsers).toHaveLength(1);
  });

  it('UserJoined routes to presence store', () => {
    // First join session
    dispatch({
      type: 'SessionJoined',
      payload: {
        user_id: 'u1',
        campaign_id: 'c1',
        connected_users: [
          { user_id: 'u1', display_name: 'Alice', role: 'dm' },
        ],
      },
    });

    dispatch({
      type: 'UserJoined',
      payload: { user_id: 'u2', display_name: 'Bob' },
    });

    expect(usePresenceStore.getState().connectedUsers).toHaveLength(2);
  });

  it('FullState loads all stores', () => {
    dispatch({
      type: 'FullState',
      payload: {
        map: { id: 'm1', name: 'Test Map' } as any,
        layers: [{ id: 'l1', sort_order: 0 } as any],
        tokens: [{ id: 't1' } as any],
        drawings: [{ id: 'd1', layer_id: 'l1' } as any],
        walls: [],
        fog_cells: [],
      },
    });

    expect(useMapStore.getState().currentMap?.id).toBe('m1');
    expect(useMapStore.getState().layers).toHaveLength(1);
    expect(useTokenStore.getState().tokens).toHaveLength(1);
    expect(useDrawingStore.getState().drawings).toHaveLength(1);
  });

  it('unknown/no-op messages do not crash', () => {
    expect(() => {
      dispatch({ type: 'Pong' });
    }).not.toThrow();

    expect(() => {
      dispatch({ type: 'Error', payload: { code: 'err', message: 'fail' } });
    }).not.toThrow();
  });
});
