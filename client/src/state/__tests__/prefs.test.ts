import { describe, it, expect, beforeEach } from 'vitest'
import { usePrefsStore } from '../prefs'

describe('usePrefsStore', () => {
  beforeEach(() => {
    usePrefsStore.setState({ theme: 'dark', reducedMotion: false })
  })

  it('defaults to dark theme', () => {
    expect(usePrefsStore.getState().theme).toBe('dark')
  })

  it('defaults reducedMotion to false', () => {
    expect(usePrefsStore.getState().reducedMotion).toBe(false)
  })

  it('setReducedMotion toggles preference', () => {
    usePrefsStore.getState().setReducedMotion(true)
    expect(usePrefsStore.getState().reducedMotion).toBe(true)

    usePrefsStore.getState().setReducedMotion(false)
    expect(usePrefsStore.getState().reducedMotion).toBe(false)
  })
})
