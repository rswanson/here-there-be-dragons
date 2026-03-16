import type { Drawing } from '../types/Drawing'
import type { CreateDrawingRequest } from '../types/CreateDrawingRequest'
import type { UpdateDrawingRequest } from '../types/UpdateDrawingRequest'

const base = '/api'

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const resp = await fetch(url, { credentials: 'include', ...options })
  if (!resp.ok) throw new Error(`${resp.status}: ${await resp.text()}`)
  if (resp.status === 204) return undefined as T
  return resp.json()
}

export const drawingsApi = {
  create: (layerId: string, data: CreateDrawingRequest) =>
    request<Drawing>(`${base}/layers/${layerId}/drawings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  update: (drawingId: string, data: UpdateDrawingRequest) =>
    request<Drawing>(`${base}/drawings/${drawingId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  delete: (drawingId: string) =>
    request<void>(`${base}/drawings/${drawingId}`, { method: 'DELETE' }),
}
