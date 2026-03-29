import type { Map } from '../types/Map'
import type { MapWithLayers } from '../types/MapWithLayers'
import type { MapFullState } from '../types/MapFullState'
import type { CreateMapRequest } from '../types/CreateMapRequest'
import type { UpdateMapRequest } from '../types/UpdateMapRequest'
import type { MapLayer } from '../types/MapLayer'
import type { CreateLayerRequest } from '../types/CreateLayerRequest'
import type { UpdateLayerRequest } from '../types/UpdateLayerRequest'
import type { MapImage } from '../types/MapImage'
import type { PlaceMapImageRequest } from '../types/PlaceMapImageRequest'
import type { UpdateMapImageRequest } from '../types/UpdateMapImageRequest'
import { request } from './client'

export const mapsApi = {
  create: (campaignId: string, data: CreateMapRequest) =>
    request<Map>(`/campaigns/${campaignId}/maps`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  list: (campaignId: string) =>
    request<Map[]>(`/campaigns/${campaignId}/maps`),

  get: (mapId: string) =>
    request<MapWithLayers>(`/maps/${mapId}`),

  getState: (mapId: string) =>
    request<MapFullState>(`/maps/${mapId}/state`),

  update: (mapId: string, data: UpdateMapRequest) =>
    request<Map>(`/maps/${mapId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  delete: (mapId: string) =>
    request<void>(`/maps/${mapId}`, { method: 'DELETE' }),

  createLayer: (mapId: string, data: CreateLayerRequest) =>
    request<MapLayer>(`/maps/${mapId}/layers`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateLayer: (layerId: string, data: UpdateLayerRequest) =>
    request<MapLayer>(`/layers/${layerId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  deleteLayer: (layerId: string) =>
    request<void>(`/layers/${layerId}`, { method: 'DELETE' }),

  reorderLayers: (mapId: string, layerIds: string[]) =>
    request<void>(`/maps/${mapId}/layers/order`, {
      method: 'PUT',
      body: JSON.stringify(layerIds),
    }),

  placeImage: (layerId: string, data: PlaceMapImageRequest) =>
    request<MapImage>(`/layers/${layerId}/images`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateImage: (imageId: string, data: UpdateMapImageRequest) =>
    request<MapImage>(`/images/${imageId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  deleteImage: (imageId: string) =>
    request<void>(`/images/${imageId}`, { method: 'DELETE' }),
}
