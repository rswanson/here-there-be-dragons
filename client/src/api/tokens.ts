import type { Token } from '../types/Token'
import type { CreateTokenRequest } from '../types/CreateTokenRequest'
import type { UpdateTokenRequest } from '../types/UpdateTokenRequest'
import { request } from './client'

export const tokensApi = {
  create: (layerId: string, data: CreateTokenRequest) =>
    request<Token>(`/layers/${layerId}/tokens`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (tokenId: string, data: UpdateTokenRequest) =>
    request<Token>(`/tokens/${tokenId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  delete: (tokenId: string) =>
    request<void>(`/tokens/${tokenId}`, { method: 'DELETE' }),
}
