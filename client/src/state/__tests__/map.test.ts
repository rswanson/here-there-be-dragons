/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach } from 'vitest'
import { useMapStore } from '../map'

describe('useMapStore', () => {
  beforeEach(() => {
    useMapStore.setState(useMapStore.getInitialState())
  })

  it('starts with no map loaded', () => {
    const state = useMapStore.getState()
    expect(state.currentMap).toBeNull()
    expect(state.layers).toEqual([])
  })

  it('loads a map with layers', () => {
    const map = { id: '1', name: 'Tavern', grid_enabled: true, grid_size_px: 70 } as any
    const layers = [
      { id: 'l1', name: 'Background', sort_order: 0 },
      { id: 'l2', name: 'Tokens', sort_order: 1 },
    ] as any[]

    useMapStore.getState().loadMap(map, layers)

    const state = useMapStore.getState()
    expect(state.currentMap?.id).toBe('1')
    expect(state.layers.length).toBe(2)
    expect(state.activeLayerId).toBe('l1')
  })

  it('sets active layer', () => {
    useMapStore.getState().loadMap({ id: '1' } as any, [{ id: 'l1' }, { id: 'l2' }] as any[])
    useMapStore.getState().setActiveLayer('l2')
    expect(useMapStore.getState().activeLayerId).toBe('l2')
  })

  it('updates layer properties', () => {
    useMapStore.getState().loadMap({ id: '1' } as any, [
      { id: 'l1', name: 'Old', visible: true, locked: false } as any,
    ])
    useMapStore.getState().updateLayer('l1', { name: 'New', locked: true })

    const layer = useMapStore.getState().layers[0]
    expect(layer.name).toBe('New')
    expect(layer.locked).toBe(true)
    expect(layer.visible).toBe(true) // unchanged
  })
})
