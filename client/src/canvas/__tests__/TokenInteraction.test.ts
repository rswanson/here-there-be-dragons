/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from 'vitest'
import { canMoveToken, getTokensInRect } from '../TokenInteraction'

describe('TokenInteraction', () => {
  it('allows DM to move any token', () => {
    const token = { owner_id: 'user-1' } as any
    expect(canMoveToken(token, 'user-2', true)).toBe(true)
  })

  it('allows owner to move own token', () => {
    const token = { owner_id: 'user-1' } as any
    expect(canMoveToken(token, 'user-1', false)).toBe(true)
  })

  it('prevents non-owner non-DM from moving token', () => {
    const token = { owner_id: 'user-1' } as any
    expect(canMoveToken(token, 'user-2', false)).toBe(false)
  })

  it('selects tokens within a rectangle', () => {
    const tokens = [
      { id: 't1', x: 1, y: 1, size: 1 },
      { id: 't2', x: 5, y: 5, size: 1 },
      { id: 't3', x: 2, y: 2, size: 1 },
    ] as any[]
    const rect = { x: 0, y: 0, width: 3, height: 3 }
    const selected = getTokensInRect(tokens, rect, 70)
    expect(selected.map((t) => t.id).sort()).toEqual(['t1', 't3'])
  })

  it('selects no tokens when rect does not overlap any', () => {
    const tokens = [
      { id: 't1', x: 1, y: 1, size: 1 },
      { id: 't2', x: 5, y: 5, size: 1 },
    ] as any[]
    const rect = { x: 10, y: 10, width: 2, height: 2 }
    const selected = getTokensInRect(tokens, rect, 70)
    expect(selected).toHaveLength(0)
  })

  it('allows DM to move token with null owner', () => {
    const token = { owner_id: null } as any
    expect(canMoveToken(token, 'user-1', true)).toBe(true)
  })

  it('prevents non-DM from moving token with null owner', () => {
    const token = { owner_id: null } as any
    expect(canMoveToken(token, 'user-1', false)).toBe(false)
  })
})
