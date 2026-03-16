import type { Map } from '../types/Map'
import type { MapWithLayers } from '../types/MapWithLayers'
import type { CreateMapRequest } from '../types/CreateMapRequest'
import type { UpdateMapRequest } from '../types/UpdateMapRequest'
import type { MapLayer } from '../types/MapLayer'
import type { CreateLayerRequest } from '../types/CreateLayerRequest'
import type { UpdateLayerRequest } from '../types/UpdateLayerRequest'
import type { MapImage } from '../types/MapImage'
import type { PlaceMapImageRequest } from '../types/PlaceMapImageRequest'
import type { UpdateMapImageRequest } from '../types/UpdateMapImageRequest'

const base = '/api'

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const resp = await fetch(url, { credentials: 'include', ...options })
  if (!resp.ok) throw new Error(`${resp.status}: ${await resp.text()}`)
  if (resp.status === 204) return undefined as T
  return resp.json()
}

export const mapsApi = {
  create: (campaignId: string, data: CreateMapRequest) =>
    request<Map>(`${base}/campaigns/${campaignId}/maps`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  list: (campaignId: string) =>
    request<Map[]>(`${base}/campaigns/${campaignId}/maps`),

  get: (mapId: string) =>
    request<MapWithLayers>(`${base}/maps/${mapId}`),

  update: (mapId: string, data: UpdateMapRequest) =>
    request<Map>(`${base}/maps/${mapId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  delete: (mapId: string) =>
    request<void>(`${base}/maps/${mapId}`, { method: 'DELETE' }),

  createLayer: (mapId: string, data: CreateLayerRequest) =>
    request<MapLayer>(`${base}/maps/${mapId}/layers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  updateLayer: (layerId: string, data: UpdateLayerRequest) =>
    request<MapLayer>(`${base}/layers/${layerId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  deleteLayer: (layerId: string) =>
    request<void>(`${base}/layers/${layerId}`, { method: 'DELETE' }),

  reorderLayers: (mapId: string, layerIds: string[]) =>
    request<void>(`${base}/maps/${mapId}/layers/order`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(layerIds),
    }),

  placeImage: (layerId: string, data: PlaceMapImageRequest) =>
    request<MapImage>(`${base}/layers/${layerId}/images`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  updateImage: (imageId: string, data: UpdateMapImageRequest) =>
    request<MapImage>(`${base}/images/${imageId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  deleteImage: (imageId: string) =>
    request<void>(`${base}/images/${imageId}`, { method: 'DELETE' }),
}
