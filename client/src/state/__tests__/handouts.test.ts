import { describe, it, expect, beforeEach } from 'vitest'
import { useHandoutStore } from '../handouts'
import type { Handout } from '../../types/Handout'

const makeHandout = (overrides: Partial<Handout> = {}): Handout => ({
  id: 'handout-1',
  campaign_id: 'campaign-1',
  title: 'The Ancient Map',
  content: 'A weathered parchment...',
  visibility: 'everyone',
  player_ids: [],
  created_by: 'user-1',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...overrides,
})

describe('useHandoutStore', () => {
  beforeEach(() => {
    useHandoutStore.setState(useHandoutStore.getInitialState())
  })

  it('starts empty', () => {
    const state = useHandoutStore.getState()
    expect(state.handouts).toEqual([])
    expect(state.activeHandout).toBeNull()
  })

  it('loadHandouts replaces the list', () => {
    const handouts = [
      makeHandout(),
      makeHandout({ id: 'handout-2', title: 'Secret Letter' }),
    ]
    useHandoutStore.getState().loadHandouts(handouts)
    expect(useHandoutStore.getState().handouts).toHaveLength(2)
  })

  it('handleHandoutCreated adds a new handout', () => {
    useHandoutStore.getState().handleHandoutCreated(makeHandout())
    expect(useHandoutStore.getState().handouts).toHaveLength(1)
  })

  it('handleHandoutCreated does not duplicate', () => {
    const handout = makeHandout()
    useHandoutStore.getState().handleHandoutCreated(handout)
    useHandoutStore.getState().handleHandoutCreated(handout)
    expect(useHandoutStore.getState().handouts).toHaveLength(1)
  })

  it('handleHandoutUpdated replaces the matching handout', () => {
    useHandoutStore.getState().loadHandouts([makeHandout()])
    const updated = makeHandout({ title: 'Updated Title', content: 'New content' })
    useHandoutStore.getState().handleHandoutUpdated(updated)
    const h = useHandoutStore.getState().handouts[0]
    expect(h.title).toBe('Updated Title')
    expect(h.content).toBe('New content')
  })

  it('handleHandoutUpdated updates activeHandout if it matches', () => {
    const handout = makeHandout()
    useHandoutStore.getState().loadHandouts([handout])
    useHandoutStore.getState().setActiveHandout(handout)
    const updated = makeHandout({ title: 'Active Updated' })
    useHandoutStore.getState().handleHandoutUpdated(updated)
    expect(useHandoutStore.getState().activeHandout?.title).toBe('Active Updated')
  })

  it('handleHandoutDeleted removes the handout', () => {
    useHandoutStore.getState().loadHandouts([makeHandout()])
    useHandoutStore.getState().handleHandoutDeleted('handout-1')
    expect(useHandoutStore.getState().handouts).toHaveLength(0)
  })

  it('handleHandoutDeleted clears activeHandout if it matches', () => {
    const handout = makeHandout()
    useHandoutStore.getState().loadHandouts([handout])
    useHandoutStore.getState().setActiveHandout(handout)
    useHandoutStore.getState().handleHandoutDeleted('handout-1')
    expect(useHandoutStore.getState().activeHandout).toBeNull()
  })

  it('handleHandoutDeleted does not clear activeHandout if different id', () => {
    const handout = makeHandout({ id: 'handout-1' })
    const other = makeHandout({ id: 'handout-2', title: 'Other' })
    useHandoutStore.getState().loadHandouts([handout, other])
    useHandoutStore.getState().setActiveHandout(handout)
    useHandoutStore.getState().handleHandoutDeleted('handout-2')
    expect(useHandoutStore.getState().activeHandout?.id).toBe('handout-1')
  })

  it('setActiveHandout sets and clears the active handout', () => {
    const handout = makeHandout()
    useHandoutStore.getState().setActiveHandout(handout)
    expect(useHandoutStore.getState().activeHandout?.id).toBe('handout-1')
    useHandoutStore.getState().setActiveHandout(null)
    expect(useHandoutStore.getState().activeHandout).toBeNull()
  })
})
