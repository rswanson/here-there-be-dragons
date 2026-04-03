import { create } from 'zustand';
import type { FogCell } from '../types/FogCell';

function cellKey(x: number, y: number): string {
  return `${x},${y}`;
}

type VisionMode = 'dm' | 'player';

interface FogState {
  revealedCells: Set<string>;
  exploredCells: Set<string>;
  visionMode: VisionMode;
  previewPlayerId: string | null;

  loadRevealedCells: (cells: FogCell[]) => void;
  revealCells: (cells: FogCell[]) => void;
  hideCells: (cells: FogCell[]) => void;
  isRevealed: (x: number, y: number) => boolean;

  markExplored: (x: number, y: number) => void;
  isExplored: (x: number, y: number) => boolean;

  setVisionMode: (mode: VisionMode, playerId?: string) => void;
  loadExploredFromStorage: (mapId: string, userId: string) => void;
  saveExploredToStorage: (mapId: string, userId: string) => void;
}

const initialState = {
  revealedCells: new Set<string>(),
  exploredCells: new Set<string>(),
  visionMode: 'dm' as VisionMode,
  previewPlayerId: null as string | null,
};

export const useFogStore = create<FogState>()((set, get) => ({
  ...initialState,

  loadRevealedCells: (cells) =>
    set({
      revealedCells: new Set(cells.map((c) => cellKey(c.x, c.y))),
    }),

  revealCells: (cells) =>
    set((s) => {
      const next = new Set(s.revealedCells);
      for (const c of cells) {
        next.add(cellKey(c.x, c.y));
      }
      return { revealedCells: next };
    }),

  hideCells: (cells) =>
    set((s) => {
      const next = new Set(s.revealedCells);
      for (const c of cells) {
        next.delete(cellKey(c.x, c.y));
      }
      return { revealedCells: next };
    }),

  isRevealed: (x, y) => get().revealedCells.has(cellKey(x, y)),

  markExplored: (x, y) =>
    set((s) => {
      const next = new Set(s.exploredCells);
      next.add(cellKey(x, y));
      return { exploredCells: next };
    }),

  isExplored: (x, y) => get().exploredCells.has(cellKey(x, y)),

  setVisionMode: (mode, playerId) =>
    set({
      visionMode: mode,
      previewPlayerId: playerId ?? null,
    }),

  loadExploredFromStorage: (mapId, userId) => {
    try {
      const key = `explored:${mapId}:${userId}`;
      const raw = localStorage.getItem(key);
      if (!raw) return;
      const cells: string[] = JSON.parse(raw);
      set({ exploredCells: new Set(cells) });
    } catch {
      // Ignore storage errors
    }
  },

  saveExploredToStorage: (mapId, userId) => {
    try {
      const key = `explored:${mapId}:${userId}`;
      const cells = Array.from(get().exploredCells);
      localStorage.setItem(key, JSON.stringify(cells));
    } catch {
      // Ignore storage errors
    }
  },
}));
