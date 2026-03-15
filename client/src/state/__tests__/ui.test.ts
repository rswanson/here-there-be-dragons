import { describe, it, expect, beforeEach } from 'vitest'
import { useUiStore } from '../ui'

describe('useUiStore', () => {
  beforeEach(() => {
    // Reset store to initial state
    useUiStore.setState({
      sidebarOpen: true,
      activeTool: null,
      selectedTokenId: null,
      mapAssetUrl: null,
    })
  })

  it('has correct initial state', () => {
    const state = useUiStore.getState()
    expect(state.sidebarOpen).toBe(true)
    expect(state.activeTool).toBeNull()
    expect(state.selectedTokenId).toBeNull()
    expect(state.mapAssetUrl).toBeNull()
  })

  it('toggleSidebar flips sidebarOpen', () => {
    useUiStore.getState().toggleSidebar()
    expect(useUiStore.getState().sidebarOpen).toBe(false)

    useUiStore.getState().toggleSidebar()
    expect(useUiStore.getState().sidebarOpen).toBe(true)
  })

  it('setActiveTool sets and clears tool', () => {
    useUiStore.getState().setActiveTool('draw')
    expect(useUiStore.getState().activeTool).toBe('draw')

    useUiStore.getState().setActiveTool(null)
    expect(useUiStore.getState().activeTool).toBeNull()
  })

  it('setSelectedToken sets and clears token', () => {
    useUiStore.getState().setSelectedToken('token-123')
    expect(useUiStore.getState().selectedTokenId).toBe('token-123')

    useUiStore.getState().setSelectedToken(null)
    expect(useUiStore.getState().selectedTokenId).toBeNull()
  })

  it('setMapAssetUrl sets the map URL', () => {
    useUiStore.getState().setMapAssetUrl('/api/assets/abc-123')
    expect(useUiStore.getState().mapAssetUrl).toBe('/api/assets/abc-123')
  })

  it('setMapAssetUrl can clear the map URL', () => {
    useUiStore.getState().setMapAssetUrl('/api/assets/abc-123')
    useUiStore.getState().setMapAssetUrl(null)
    expect(useUiStore.getState().mapAssetUrl).toBeNull()
  })
})
