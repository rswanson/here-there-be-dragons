import { describe, it, expect, beforeEach } from 'vitest';
import { usePresenceStore } from '../presence';
import type { ServerMessage } from '../../types/ServerMessage';

describe('usePresenceStore', () => {
  beforeEach(() => {
    usePresenceStore.setState(usePresenceStore.getInitialState());
  });

  it('starts disconnected with no users', () => {
    const state = usePresenceStore.getState();
    expect(state.connectedUsers).toEqual([]);
    expect(state.isConnected).toBe(false);
    expect(state.connectionState).toBe('disconnected');
  });

  it('SessionJoined sets connected users and isConnected=true', () => {
    const msg: ServerMessage = {
      type: 'SessionJoined',
      payload: {
        user_id: 'u1',
        campaign_id: 'c1',
        connected_users: [
          { user_id: 'u1', display_name: 'Alice', role: 'dm' },
          { user_id: 'u2', display_name: 'Bob', role: 'player' },
        ],
      },
    };

    usePresenceStore.getState().handleServerMessage(msg);

    const state = usePresenceStore.getState();
    expect(state.connectedUsers).toHaveLength(2);
    expect(state.connectedUsers[0].display_name).toBe('Alice');
    expect(state.isConnected).toBe(true);
    expect(state.connectionState).toBe('connected');
  });

  it('UserJoined adds to the list', () => {
    // Start with one user via SessionJoined
    usePresenceStore.getState().handleServerMessage({
      type: 'SessionJoined',
      payload: {
        user_id: 'u1',
        campaign_id: 'c1',
        connected_users: [
          { user_id: 'u1', display_name: 'Alice', role: 'dm' },
        ],
      },
    });

    usePresenceStore.getState().handleServerMessage({
      type: 'UserJoined',
      payload: { user_id: 'u2', display_name: 'Bob' },
    });

    const state = usePresenceStore.getState();
    expect(state.connectedUsers).toHaveLength(2);
    expect(state.connectedUsers[1].user_id).toBe('u2');
    expect(state.connectedUsers[1].display_name).toBe('Bob');
  });

  it('UserLeft removes from the list', () => {
    usePresenceStore.getState().handleServerMessage({
      type: 'SessionJoined',
      payload: {
        user_id: 'u1',
        campaign_id: 'c1',
        connected_users: [
          { user_id: 'u1', display_name: 'Alice', role: 'dm' },
          { user_id: 'u2', display_name: 'Bob', role: 'player' },
        ],
      },
    });

    usePresenceStore.getState().handleServerMessage({
      type: 'UserLeft',
      payload: { user_id: 'u2', display_name: 'Bob' },
    });

    const state = usePresenceStore.getState();
    expect(state.connectedUsers).toHaveLength(1);
    expect(state.connectedUsers[0].user_id).toBe('u1');
  });

  it('setConnectionState updates state', () => {
    usePresenceStore.getState().setConnectionState('connecting');
    expect(usePresenceStore.getState().connectionState).toBe('connecting');
    expect(usePresenceStore.getState().isConnected).toBe(false);

    usePresenceStore.getState().setConnectionState('connected');
    expect(usePresenceStore.getState().connectionState).toBe('connected');
    expect(usePresenceStore.getState().isConnected).toBe(true);

    usePresenceStore.getState().setConnectionState('disconnected');
    expect(usePresenceStore.getState().connectionState).toBe('disconnected');
    expect(usePresenceStore.getState().isConnected).toBe(false);
  });

  it('reset clears everything', () => {
    usePresenceStore.getState().handleServerMessage({
      type: 'SessionJoined',
      payload: {
        user_id: 'u1',
        campaign_id: 'c1',
        connected_users: [
          { user_id: 'u1', display_name: 'Alice', role: 'dm' },
        ],
      },
    });

    usePresenceStore.getState().reset();

    const state = usePresenceStore.getState();
    expect(state.connectedUsers).toEqual([]);
    expect(state.isConnected).toBe(false);
    expect(state.connectionState).toBe('disconnected');
  });
});
