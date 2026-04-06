import { create } from 'zustand';
import type { Point } from '../canvas/math/raycasting';

interface VisionState {
  polygons: Record<string, Point[]>;
  dirty: boolean;

  setPolygon: (tokenId: string, polygon: Point[]) => void;
  clearPolygons: () => void;
  setDirty: () => void;
  clearDirty: () => void;
}

const initialState = {
  polygons: {} as Record<string, Point[]>,
  dirty: false,
};

export const useVisionStore = create<VisionState>()((set) => ({
  ...initialState,

  setPolygon: (tokenId, polygon) =>
    set((s) => ({
      polygons: { ...s.polygons, [tokenId]: polygon },
    })),

  clearPolygons: () => set({ polygons: {} }),

  setDirty: () => set({ dirty: true }),

  clearDirty: () => set({ dirty: false }),
}));
