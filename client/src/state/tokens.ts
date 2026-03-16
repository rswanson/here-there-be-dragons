import { create } from 'zustand';
import type { Token } from '../types/Token';

interface TokenState {
  tokens: Token[];
  selectedIds: string[];

  loadTokens: (tokens: Token[]) => void;
  addToken: (token: Token) => void;
  removeToken: (tokenId: string) => void;
  updateToken: (tokenId: string, patch: Partial<Token>) => void;
  moveToken: (tokenId: string, x: number, y: number) => void;

  selectToken: (tokenId: string) => void;
  toggleSelect: (tokenId: string) => void;
  deselectAll: () => void;
  boxSelect: (tokenIds: string[]) => void;
}

const initialState = {
  tokens: [] as Token[],
  selectedIds: [] as string[],
};

export const useTokenStore = create<TokenState>()((set) => ({
  ...initialState,

  loadTokens: (tokens) => set({ tokens, selectedIds: [] }),

  addToken: (token) =>
    set((s) => ({
      tokens: [...s.tokens, token],
    })),

  removeToken: (tokenId) =>
    set((s) => ({
      tokens: s.tokens.filter((t) => t.id !== tokenId),
      selectedIds: s.selectedIds.filter((id) => id !== tokenId),
    })),

  updateToken: (tokenId, patch) =>
    set((s) => ({
      tokens: s.tokens.map((t) => (t.id === tokenId ? { ...t, ...patch } : t)),
    })),

  moveToken: (tokenId, x, y) =>
    set((s) => ({
      tokens: s.tokens.map((t) => (t.id === tokenId ? { ...t, x, y } : t)),
    })),

  selectToken: (tokenId) => set({ selectedIds: [tokenId] }),

  toggleSelect: (tokenId) =>
    set((s) => ({
      selectedIds: s.selectedIds.includes(tokenId)
        ? s.selectedIds.filter((id) => id !== tokenId)
        : [...s.selectedIds, tokenId],
    })),

  deselectAll: () => set({ selectedIds: [] }),

  boxSelect: (tokenIds) => set({ selectedIds: tokenIds }),
}));
