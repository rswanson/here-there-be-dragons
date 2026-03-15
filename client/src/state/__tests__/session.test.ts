import { describe, it, expect, beforeEach } from 'vitest'
import { useSessionStore } from '../session'

describe('useSessionStore', () => {
  beforeEach(() => {
    useSessionStore.setState({ user: null })
  })

  it('starts with no user', () => {
    expect(useSessionStore.getState().user).toBeNull()
  })

  it('setUser stores user data', () => {
    const user = {
      id: '123',
      email: 'test@example.com',
      display_name: 'Alice',
      created_at: '2025-01-01T00:00:00Z',
    }
    useSessionStore.getState().setUser(user)
    expect(useSessionStore.getState().user).toEqual(user)
  })

  it('setUser(null) clears the user', () => {
    useSessionStore.getState().setUser({
      id: '123',
      email: 'test@example.com',
      display_name: 'Alice',
      created_at: '2025-01-01T00:00:00Z',
    })
    useSessionStore.getState().setUser(null)
    expect(useSessionStore.getState().user).toBeNull()
  })
})
