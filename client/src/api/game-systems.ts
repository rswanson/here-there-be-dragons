import { request } from './client'
import type { GameSystemInfo } from '../types/GameSystemInfo'
import type { SheetSchema } from '../types/SheetSchema'

export const gameSystemsApi = {
  list: () => request<GameSystemInfo[]>('/game-systems'),
  getSchema: (id: string) => request<SheetSchema>(`/game-systems/${id}/schema`),
}
