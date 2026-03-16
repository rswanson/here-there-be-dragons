import { create } from 'zustand'
import type { Map } from '../types/Map'
import type { MapLayer } from '../types/MapLayer'

interface MapState {
  currentMap: Map | null
  layers: MapLayer[]
  activeLayerId: string | null

  loadMap: (map: Map, layers: MapLayer[]) => void
  unloadMap: () => void
  setActiveLayer: (layerId: string) => void
  updateMap: (patch: Partial<Map>) => void
  updateLayer: (layerId: string, patch: Partial<MapLayer>) => void
  addLayer: (layer: MapLayer) => void
  removeLayer: (layerId: string) => void
  reorderLayers: (layerIds: string[]) => void
}

const initialState = {
  currentMap: null,
  layers: [],
  activeLayerId: null,
}

export const useMapStore = create<MapState>()((set) => ({
  ...initialState,

  loadMap: (map, layers) =>
    set({
      currentMap: map,
      layers,
      activeLayerId: layers[0]?.id ?? null,
    }),

  unloadMap: () => set({ ...initialState }),

  setActiveLayer: (layerId) => set({ activeLayerId: layerId }),

  updateMap: (patch) =>
    set((s) => ({
      currentMap: s.currentMap ? { ...s.currentMap, ...patch } : null,
    })),

  updateLayer: (layerId, patch) =>
    set((s) => ({
      layers: s.layers.map((l) => (l.id === layerId ? { ...l, ...patch } : l)),
    })),

  addLayer: (layer) =>
    set((s) => ({
      layers: [...s.layers, layer],
    })),

  removeLayer: (layerId) =>
    set((s) => ({
      layers: s.layers.filter((l) => l.id !== layerId),
      activeLayerId:
        s.activeLayerId === layerId
          ? (s.layers.find((l) => l.id !== layerId)?.id ?? null)
          : s.activeLayerId,
    })),

  reorderLayers: (layerIds) =>
    set((s) => ({
      layers: layerIds
        .map((id, i) => {
          const layer = s.layers.find((l) => l.id === id)
          return layer ? { ...layer, sort_order: i } : null
        })
        .filter((l): l is MapLayer => l !== null),
    })),
}))
