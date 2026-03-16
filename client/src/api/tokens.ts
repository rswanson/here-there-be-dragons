import type { Token } from '../types/Token'
import type { CreateTokenRequest } from '../types/CreateTokenRequest'
import type { UpdateTokenRequest } from '../types/UpdateTokenRequest'

const base = '/api'

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const resp = await fetch(url, { credentials: 'include', ...options })
  if (!resp.ok) throw new Error(`${resp.status}: ${await resp.text()}`)
  if (resp.status === 204) return undefined as T
  return resp.json()
}

export const tokensApi = {
  create: (layerId: string, data: CreateTokenRequest) =>
    request<Token>(`${base}/layers/${layerId}/tokens`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  update: (tokenId: string, data: UpdateTokenRequest) =>
    request<Token>(`${base}/tokens/${tokenId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  delete: (tokenId: string) =>
    request<void>(`${base}/tokens/${tokenId}`, { method: 'DELETE' }),
}
