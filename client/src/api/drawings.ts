import type { Drawing } from '../types/Drawing'
import type { CreateDrawingRequest } from '../types/CreateDrawingRequest'
import type { UpdateDrawingRequest } from '../types/UpdateDrawingRequest'
import { request } from './client'

export const drawingsApi = {
  create: (layerId: string, data: CreateDrawingRequest) =>
    request<Drawing>(`/layers/${layerId}/drawings`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (drawingId: string, data: UpdateDrawingRequest) =>
    request<Drawing>(`/drawings/${drawingId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  delete: (drawingId: string) =>
    request<void>(`/drawings/${drawingId}`, { method: 'DELETE' }),
}
