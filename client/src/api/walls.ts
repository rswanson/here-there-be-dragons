import type { Wall } from '../types/Wall'
import type { CreateWallRequest } from '../types/CreateWallRequest'
import type { UpdateWallRequest } from '../types/UpdateWallRequest'

const BASE = '/api'

export async function listWalls(mapId: string): Promise<Wall[]> {
  const res = await fetch(`${BASE}/maps/${mapId}/walls`, { credentials: 'include' })
  if (!res.ok) throw new Error(`Failed to list walls: ${res.status}`)
  return res.json()
}

export async function createWalls(mapId: string, walls: CreateWallRequest[]): Promise<Wall[]> {
  const res = await fetch(`${BASE}/maps/${mapId}/walls`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(walls),
  })
  if (!res.ok) throw new Error(`Failed to create walls: ${res.status}`)
  return res.json()
}

export async function updateWall(wallId: string, patch: UpdateWallRequest): Promise<Wall> {
  const res = await fetch(`${BASE}/walls/${wallId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(patch),
  })
  if (!res.ok) throw new Error(`Failed to update wall: ${res.status}`)
  return res.json()
}

export async function deleteWall(wallId: string): Promise<void> {
  const res = await fetch(`${BASE}/walls/${wallId}`, {
    method: 'DELETE',
    credentials: 'include',
  })
  if (!res.ok) throw new Error(`Failed to delete wall: ${res.status}`)
}
