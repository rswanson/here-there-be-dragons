import { create } from 'zustand';
import type { Encounter } from '../types/Encounter';
import type { Combatant } from '../types/Combatant';

interface InitiativeState {
  encounter: Encounter | null;

  handleEncounterStarted: (encounter: Encounter) => void;
  handleCombatantAdded: (combatant: Combatant) => void;
  handleCombatantRemoved: (combatantId: string) => void;
  handleCombatantInitiativeUpdated: (
    combatantId: string,
    value: number,
    sortOrder: number,
  ) => void;
  handleAllInitiativeRolled: (combatants: Combatant[]) => void;
  handleTurnAdvanced: (
    currentTurnIndex: number,
    roundNumber: number,
  ) => void;
  handleEncounterEnded: () => void;
}

const initialState = {
  encounter: null as Encounter | null,
};

export const useInitiativeStore = create<InitiativeState>()((set) => ({
  ...initialState,

  handleEncounterStarted: (encounter) => set({ encounter }),

  handleCombatantAdded: (combatant) =>
    set((s) => {
      if (!s.encounter) return s;
      return {
        encounter: {
          ...s.encounter,
          combatants: [...s.encounter.combatants, combatant],
        },
      };
    }),

  handleCombatantRemoved: (combatantId) =>
    set((s) => {
      if (!s.encounter) return s;
      return {
        encounter: {
          ...s.encounter,
          combatants: s.encounter.combatants.filter(
            (c) => c.id !== combatantId,
          ),
        },
      };
    }),

  handleCombatantInitiativeUpdated: (combatantId, value, sortOrder) =>
    set((s) => {
      if (!s.encounter) return s;
      return {
        encounter: {
          ...s.encounter,
          combatants: s.encounter.combatants.map((c) =>
            c.id === combatantId
              ? { ...c, initiative_value: value, sort_order: sortOrder }
              : c,
          ),
        },
      };
    }),

  handleAllInitiativeRolled: (combatants) =>
    set((s) => {
      if (!s.encounter) return s;
      return { encounter: { ...s.encounter, combatants } };
    }),

  handleTurnAdvanced: (currentTurnIndex, roundNumber) =>
    set((s) => {
      if (!s.encounter) return s;
      return {
        encounter: {
          ...s.encounter,
          current_turn_index: currentTurnIndex,
          round_number: roundNumber,
        },
      };
    }),

  handleEncounterEnded: () => set({ encounter: null }),
}));
