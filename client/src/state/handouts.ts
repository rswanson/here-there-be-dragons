import { create } from 'zustand';
import type { Handout } from '../types/Handout';

interface HandoutState {
  handouts: Handout[];
  activeHandout: Handout | null;

  loadHandouts: (handouts: Handout[]) => void;
  setActiveHandout: (handout: Handout | null) => void;
  handleHandoutCreated: (handout: Handout) => void;
  handleHandoutUpdated: (handout: Handout) => void;
  handleHandoutDeleted: (handoutId: string) => void;
}

const initialState = {
  handouts: [] as Handout[],
  activeHandout: null as Handout | null,
};

export const useHandoutStore = create<HandoutState>()((set) => ({
  ...initialState,

  loadHandouts: (handouts) => set({ handouts }),

  setActiveHandout: (handout) => set({ activeHandout: handout }),

  handleHandoutCreated: (handout) =>
    set((s) => ({
      handouts: s.handouts.some((h) => h.id === handout.id)
        ? s.handouts
        : [...s.handouts, handout],
    })),

  handleHandoutUpdated: (handout) =>
    set((s) => ({
      handouts: s.handouts.map((h) => (h.id === handout.id ? handout : h)),
      activeHandout:
        s.activeHandout?.id === handout.id ? handout : s.activeHandout,
    })),

  handleHandoutDeleted: (handoutId) =>
    set((s) => ({
      handouts: s.handouts.filter((h) => h.id !== handoutId),
      activeHandout:
        s.activeHandout?.id === handoutId ? null : s.activeHandout,
    })),
}));
