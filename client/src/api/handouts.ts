import { request } from './client'
import type { Handout } from '../types/Handout'
import type { CreateHandoutRequest } from '../types/CreateHandoutRequest'
import type { UpdateHandoutRequest } from '../types/UpdateHandoutRequest'

export const handoutsApi = {
  list: (campaignId: string) =>
    request<Handout[]>(`/campaigns/${campaignId}/handouts`),

  get: (id: string) => request<Handout>(`/handouts/${id}`),

  create: (campaignId: string, data: CreateHandoutRequest) =>
    request<Handout>(`/campaigns/${campaignId}/handouts`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id: string, data: UpdateHandoutRequest) =>
    request<Handout>(`/handouts/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  delete: (id: string) =>
    request<void>(`/handouts/${id}`, { method: 'DELETE' }),
}
