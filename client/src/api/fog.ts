import type { FogCell } from '../types/FogCell'

const BASE = '/api'

export async function getFog(mapId: string): Promise<FogCell[]> {
  const res = await fetch(`${BASE}/maps/${mapId}/fog`, { credentials: 'include' })
  if (!res.ok) throw new Error(`Failed to get fog: ${res.status}`)
  return res.json()
}

export async function updateFog(mapId: string, cells: FogCell[], revealed: boolean): Promise<FogCell[]> {
  const res = await fetch(`${BASE}/maps/${mapId}/fog`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ cells, revealed }),
  })
  if (!res.ok) throw new Error(`Failed to update fog: ${res.status}`)
  return res.json()
}
