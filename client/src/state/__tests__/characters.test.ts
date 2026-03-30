import { describe, it, expect, beforeEach } from 'vitest'
import { useCharacterStore } from '../characters'
import type { Character } from '../../types/Character'

const makeCharacter = (overrides: Partial<Character> = {}): Character => ({
  id: 'char-1',
  campaign_id: 'campaign-1',
  owner_id: 'user-1',
  game_system_id: 'stub',
  name: 'Test Hero',
  portrait_asset_id: null,
  visible_to_players: true,
  fields: { strength: 10, str_mod: 0, hp_current: 10, hp_max: 10 },
  bonuses: {},
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...overrides,
})

describe('useCharacterStore', () => {
  beforeEach(() => {
    useCharacterStore.setState(useCharacterStore.getInitialState())
  })

  it('starts empty', () => {
    const state = useCharacterStore.getState()
    expect(state.characters).toEqual([])
    expect(state.activeCharacterId).toBeNull()
  })

  it('loads characters', () => {
    const chars = [makeCharacter(), makeCharacter({ id: 'char-2', name: 'Hero 2' })]
    useCharacterStore.getState().loadCharacters(chars)
    expect(useCharacterStore.getState().characters).toHaveLength(2)
  })

  it('adds a character without duplicates', () => {
    const char = makeCharacter()
    useCharacterStore.getState().addCharacter(char)
    useCharacterStore.getState().addCharacter(char)
    expect(useCharacterStore.getState().characters).toHaveLength(1)
  })

  it('removes a character', () => {
    useCharacterStore.getState().addCharacter(makeCharacter())
    useCharacterStore.getState().removeCharacter('char-1')
    expect(useCharacterStore.getState().characters).toHaveLength(0)
  })

  it('clears activeCharacterId when removing active character', () => {
    useCharacterStore.getState().addCharacter(makeCharacter())
    useCharacterStore.getState().setActiveCharacter('char-1')
    useCharacterStore.getState().removeCharacter('char-1')
    expect(useCharacterStore.getState().activeCharacterId).toBeNull()
  })

  it('updates character fields', () => {
    useCharacterStore.getState().addCharacter(makeCharacter())
    useCharacterStore.getState().handleFieldsUpdated('char-1', { strength: 16, str_mod: 3 })
    const char = useCharacterStore.getState().characters.find((c) => c.id === 'char-1')
    expect(char?.fields.strength).toBe(16)
    expect(char?.fields.str_mod).toBe(3)
  })

  it('adds a bonus entry', () => {
    useCharacterStore.getState().addCharacter(makeCharacter())
    useCharacterStore.getState().handleBonusAdded('char-1', 'armor_class', {
      id: 'bonus-1', source: 'Plate', bonus_type: 'armor', value: 8,
    })
    const char = useCharacterStore.getState().characters.find((c) => c.id === 'char-1')
    expect(char?.bonuses.armor_class).toHaveLength(1)
    expect(char?.bonuses.armor_class[0].source).toBe('Plate')
  })

  it('removes a bonus entry', () => {
    useCharacterStore.getState().addCharacter(makeCharacter({
      bonuses: { armor_class: [{ id: 'bonus-1', source: 'Plate', bonus_type: 'armor', value: 8 }] },
    }))
    useCharacterStore.getState().handleBonusRemoved('char-1', 'bonus-1', 'armor_class')
    const char = useCharacterStore.getState().characters.find((c) => c.id === 'char-1')
    expect(char?.bonuses.armor_class).toHaveLength(0)
  })

  it('updates a bonus entry', () => {
    useCharacterStore.getState().addCharacter(makeCharacter({
      bonuses: { armor_class: [{ id: 'bonus-1', source: 'Leather', bonus_type: 'armor', value: 2 }] },
    }))
    useCharacterStore.getState().handleBonusUpdated('char-1', 'armor_class', {
      id: 'bonus-1', source: 'Full Plate', bonus_type: 'armor', value: 8,
    })
    const char = useCharacterStore.getState().characters.find((c) => c.id === 'char-1')
    expect(char?.bonuses.armor_class[0].value).toBe(8)
    expect(char?.bonuses.armor_class[0].source).toBe('Full Plate')
  })
})
