import { request } from './client'
import type { ChatMessage } from '../types/ChatMessage'

export const chatApi = {
  getRecent: (campaignId: string, limit = 50) =>
    request<ChatMessage[]>(`/campaigns/${campaignId}/chat?limit=${limit}`),

  getBefore: (campaignId: string, beforeId: string, limit = 50) =>
    request<ChatMessage[]>(
      `/campaigns/${campaignId}/chat/before/${beforeId}?limit=${limit}`,
    ),
}
