import { create } from 'zustand';
import type { Character } from '../types/Character';
import type { BonusEntry } from '../types/BonusEntry';
import type { SheetSchema } from '../types/SheetSchema';

interface CharacterState {
  characters: Character[];
  activeCharacterId: string | null;
  schemas: Record<string, SheetSchema>;

  loadCharacters: (characters: Character[]) => void;
  addCharacter: (character: Character) => void;
  removeCharacter: (characterId: string) => void;
  updateCharacterMeta: (characterId: string, patch: Partial<Character>) => void;
  setActiveCharacter: (characterId: string | null) => void;
  cacheSchema: (gameSystemId: string, schema: SheetSchema) => void;

  handleFieldsUpdated: (characterId: string, fields: Record<string, unknown>) => void;
  handleBonusAdded: (characterId: string, fieldId: string, bonus: BonusEntry) => void;
  handleBonusRemoved: (characterId: string, bonusId: string, fieldId: string) => void;
  handleBonusUpdated: (characterId: string, fieldId: string, bonus: BonusEntry) => void;
}

const initialState = {
  characters: [] as Character[],
  activeCharacterId: null as string | null,
  schemas: {} as Record<string, SheetSchema>,
};

export const useCharacterStore = create<CharacterState>()((set) => ({
  ...initialState,

  loadCharacters: (characters) => set({ characters }),

  addCharacter: (character) =>
    set((s) => ({
      characters: s.characters.some((c) => c.id === character.id)
        ? s.characters
        : [...s.characters, character],
    })),

  removeCharacter: (characterId) =>
    set((s) => ({
      characters: s.characters.filter((c) => c.id !== characterId),
      activeCharacterId:
        s.activeCharacterId === characterId ? null : s.activeCharacterId,
    })),

  updateCharacterMeta: (characterId, patch) =>
    set((s) => ({
      characters: s.characters.map((c) =>
        c.id === characterId ? { ...c, ...patch } : c,
      ),
    })),

  setActiveCharacter: (characterId) => set({ activeCharacterId: characterId }),

  cacheSchema: (gameSystemId, schema) =>
    set((s) => ({
      schemas: { ...s.schemas, [gameSystemId]: schema },
    })),

  handleFieldsUpdated: (characterId, fields) =>
    set((s) => ({
      characters: s.characters.map((c) =>
        c.id === characterId ? { ...c, fields: { ...c.fields, ...fields } } : c,
      ),
    })),

  handleBonusAdded: (characterId, fieldId, bonus) =>
    set((s) => ({
      characters: s.characters.map((c) => {
        if (c.id !== characterId) return c;
        const existing = c.bonuses[fieldId] ?? [];
        return {
          ...c,
          bonuses: { ...c.bonuses, [fieldId]: [...existing, bonus] },
        };
      }),
    })),

  handleBonusRemoved: (characterId, bonusId, fieldId) =>
    set((s) => ({
      characters: s.characters.map((c) => {
        if (c.id !== characterId) return c;
        const existing = c.bonuses[fieldId] ?? [];
        return {
          ...c,
          bonuses: {
            ...c.bonuses,
            [fieldId]: existing.filter((b) => b.id !== bonusId),
          },
        };
      }),
    })),

  handleBonusUpdated: (characterId, fieldId, bonus) =>
    set((s) => ({
      characters: s.characters.map((c) => {
        if (c.id !== characterId) return c;
        const existing = c.bonuses[fieldId] ?? [];
        return {
          ...c,
          bonuses: {
            ...c.bonuses,
            [fieldId]: existing.map((b) => (b.id === bonus.id ? bonus : b)),
          },
        };
      }),
    })),
}));
