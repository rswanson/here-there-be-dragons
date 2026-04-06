import { create } from 'zustand';
import type { Wall } from '../types/Wall';
import type { DoorState } from '../types/DoorState';

interface WallState {
  walls: Wall[];
  selectedIds: string[];

  loadWalls: (walls: Wall[]) => void;
  addWalls: (walls: Wall[]) => void;
  removeWalls: (wallIds: string[]) => void;
  updateWall: (wallId: string, patch: Partial<Wall>) => void;
  updateDoorState: (wallId: string, doorState: DoorState) => void;

  selectWall: (wallId: string) => void;
  deselectAll: () => void;
}

const initialState = {
  walls: [] as Wall[],
  selectedIds: [] as string[],
};

export const useWallStore = create<WallState>()((set) => ({
  ...initialState,

  loadWalls: (walls) => set({ walls, selectedIds: [] }),

  addWalls: (walls) =>
    set((s) => {
      const existingIds = new Set(s.walls.map((w) => w.id));
      const newWalls = walls.filter((w) => !existingIds.has(w.id));
      return { walls: [...s.walls, ...newWalls] };
    }),

  removeWalls: (wallIds) =>
    set((s) => {
      const idsToRemove = new Set(wallIds);
      return {
        walls: s.walls.filter((w) => !idsToRemove.has(w.id)),
        selectedIds: s.selectedIds.filter((id) => !idsToRemove.has(id)),
      };
    }),

  updateWall: (wallId, patch) =>
    set((s) => ({
      walls: s.walls.map((w) => (w.id === wallId ? { ...w, ...patch } : w)),
    })),

  updateDoorState: (wallId, doorState) =>
    set((s) => ({
      walls: s.walls.map((w) => (w.id === wallId ? { ...w, door_state: doorState } : w)),
    })),

  selectWall: (wallId) => set({ selectedIds: [wallId] }),

  deselectAll: () => set({ selectedIds: [] }),
}));
