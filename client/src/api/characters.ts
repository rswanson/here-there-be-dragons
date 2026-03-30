import { request } from './client'
import type { Character } from '../types/Character'
import type { CreateCharacterRequest } from '../types/CreateCharacterRequest'
import type { UpdateCharacterRequest } from '../types/UpdateCharacterRequest'

export const charactersApi = {
  list: (campaignId: string) =>
    request<Character[]>(`/campaigns/${campaignId}/characters`),

  get: (characterId: string) =>
    request<Character>(`/characters/${characterId}`),

  create: (campaignId: string, data: CreateCharacterRequest) =>
    request<Character>(`/campaigns/${campaignId}/characters`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (characterId: string, data: UpdateCharacterRequest) =>
    request<Character>(`/characters/${characterId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  delete: (characterId: string) =>
    request<void>(`/characters/${characterId}`, { method: 'DELETE' }),

  export: (characterId: string) =>
    request<Record<string, unknown>>(`/characters/${characterId}/export`, {
      method: 'POST',
    }),

  import: (campaignId: string, data: Record<string, unknown>) =>
    request<Character>(`/campaigns/${campaignId}/characters/import`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
}
