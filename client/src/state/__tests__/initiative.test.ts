import { describe, it, expect, beforeEach } from 'vitest'
import { useInitiativeStore } from '../initiative'
import type { Encounter } from '../../types/Encounter'
import type { Combatant } from '../../types/Combatant'

const makeCombatant = (overrides: Partial<Combatant> = {}): Combatant => ({
  id: 'combatant-1',
  encounter_id: 'encounter-1',
  character_id: null,
  name: 'Goblin',
  initiative_value: 0,
  sort_order: 0,
  is_active: false,
  ...overrides,
})

const makeEncounter = (overrides: Partial<Encounter> = {}): Encounter => ({
  id: 'encounter-1',
  campaign_id: 'campaign-1',
  active: true,
  current_turn_index: 0,
  round_number: 1,
  combatants: [],
  created_at: '2026-01-01T00:00:00Z',
  ...overrides,
})

describe('useInitiativeStore', () => {
  beforeEach(() => {
    useInitiativeStore.setState(useInitiativeStore.getInitialState())
  })

  it('starts with null encounter', () => {
    expect(useInitiativeStore.getState().encounter).toBeNull()
  })

  it('handleEncounterStarted sets the encounter', () => {
    const encounter = makeEncounter()
    useInitiativeStore.getState().handleEncounterStarted(encounter)
    expect(useInitiativeStore.getState().encounter?.id).toBe('encounter-1')
  })

  it('handleCombatantAdded appends a combatant', () => {
    useInitiativeStore.getState().handleEncounterStarted(makeEncounter())
    useInitiativeStore.getState().handleCombatantAdded(makeCombatant())
    expect(useInitiativeStore.getState().encounter?.combatants).toHaveLength(1)
  })

  it('handleCombatantAdded does nothing without an encounter', () => {
    useInitiativeStore.getState().handleCombatantAdded(makeCombatant())
    expect(useInitiativeStore.getState().encounter).toBeNull()
  })

  it('handleCombatantRemoved removes by id', () => {
    useInitiativeStore
      .getState()
      .handleEncounterStarted(makeEncounter({ combatants: [makeCombatant()] }))
    useInitiativeStore.getState().handleCombatantRemoved('combatant-1')
    expect(useInitiativeStore.getState().encounter?.combatants).toHaveLength(0)
  })

  it('handleCombatantRemoved does nothing without an encounter', () => {
    useInitiativeStore.getState().handleCombatantRemoved('combatant-1')
    expect(useInitiativeStore.getState().encounter).toBeNull()
  })

  it('handleCombatantInitiativeUpdated updates value and sort_order', () => {
    useInitiativeStore
      .getState()
      .handleEncounterStarted(makeEncounter({ combatants: [makeCombatant()] }))
    useInitiativeStore
      .getState()
      .handleCombatantInitiativeUpdated('combatant-1', 18, 1)
    const combatant = useInitiativeStore.getState().encounter?.combatants[0]
    expect(combatant?.initiative_value).toBe(18)
    expect(combatant?.sort_order).toBe(1)
  })

  it('handleAllInitiativeRolled replaces the combatants list', () => {
    useInitiativeStore.getState().handleEncounterStarted(makeEncounter())
    const combatants = [
      makeCombatant({ id: 'combatant-1', initiative_value: 20 }),
      makeCombatant({ id: 'combatant-2', name: 'Orc', initiative_value: 15 }),
    ]
    useInitiativeStore.getState().handleAllInitiativeRolled(combatants)
    expect(useInitiativeStore.getState().encounter?.combatants).toHaveLength(2)
    expect(useInitiativeStore.getState().encounter?.combatants[0].initiative_value).toBe(20)
  })

  it('handleTurnAdvanced updates current_turn_index and round_number', () => {
    useInitiativeStore.getState().handleEncounterStarted(makeEncounter())
    useInitiativeStore.getState().handleTurnAdvanced(2, 3)
    const enc = useInitiativeStore.getState().encounter
    expect(enc?.current_turn_index).toBe(2)
    expect(enc?.round_number).toBe(3)
  })

  it('handleEncounterEnded sets encounter to null', () => {
    useInitiativeStore.getState().handleEncounterStarted(makeEncounter())
    useInitiativeStore.getState().handleEncounterEnded()
    expect(useInitiativeStore.getState().encounter).toBeNull()
  })

  it('full lifecycle: start → add → update → advance → end', () => {
    // Start
    useInitiativeStore.getState().handleEncounterStarted(makeEncounter())
    expect(useInitiativeStore.getState().encounter?.active).toBe(true)

    // Add combatants
    useInitiativeStore
      .getState()
      .handleCombatantAdded(makeCombatant({ id: 'c1', name: 'Fighter' }))
    useInitiativeStore
      .getState()
      .handleCombatantAdded(makeCombatant({ id: 'c2', name: 'Wizard' }))
    expect(useInitiativeStore.getState().encounter?.combatants).toHaveLength(2)

    // Roll initiative
    useInitiativeStore.getState().handleCombatantInitiativeUpdated('c1', 14, 0)
    useInitiativeStore.getState().handleCombatantInitiativeUpdated('c2', 20, 1)
    const c2 = useInitiativeStore
      .getState()
      .encounter?.combatants.find((c) => c.id === 'c2')
    expect(c2?.initiative_value).toBe(20)

    // Advance turn
    useInitiativeStore.getState().handleTurnAdvanced(1, 1)
    expect(useInitiativeStore.getState().encounter?.current_turn_index).toBe(1)

    // End
    useInitiativeStore.getState().handleEncounterEnded()
    expect(useInitiativeStore.getState().encounter).toBeNull()
  })
})
