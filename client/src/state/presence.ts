import { create } from 'zustand';
import type { ConnectedUser } from '../types/ConnectedUser';
import type { ServerMessage } from '../types/ServerMessage';

type ConnectionState = 'connecting' | 'connected' | 'disconnected';

interface PresenceState {
  connectedUsers: ConnectedUser[];
  isConnected: boolean;
  connectionState: ConnectionState;

  handleServerMessage: (msg: ServerMessage) => void;
  setConnectionState: (state: ConnectionState) => void;
  reset: () => void;
}

const initialState = {
  connectedUsers: [] as ConnectedUser[],
  isConnected: false,
  connectionState: 'disconnected' as ConnectionState,
};

export const usePresenceStore = create<PresenceState>()((set) => ({
  ...initialState,

  handleServerMessage: (msg) => {
    switch (msg.type) {
      case 'SessionJoined':
        set({
          connectedUsers: msg.payload.connected_users,
          isConnected: true,
          connectionState: 'connected',
        });
        break;
      case 'UserJoined':
        set((s) => ({
          connectedUsers: s.connectedUsers.some(
            (u) => u.user_id === msg.payload.user_id,
          )
            ? s.connectedUsers
            : [
                ...s.connectedUsers,
                {
                  user_id: msg.payload.user_id,
                  display_name: msg.payload.display_name,
                  // UserJoined doesn't carry role; SessionJoined provides accurate roles.
                  // Use 'unknown' to avoid misrepresenting DMs as players.
                  role: 'unknown',
                },
              ],
        }));
        break;
      case 'UserLeft':
        set((s) => ({
          connectedUsers: s.connectedUsers.filter(
            (u) => u.user_id !== msg.payload.user_id,
          ),
        }));
        break;
    }
  },

  setConnectionState: (connectionState) =>
    set({
      connectionState,
      isConnected: connectionState === 'connected',
    }),

  reset: () => set({ ...initialState }),
}));
