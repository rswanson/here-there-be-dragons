import { useTokenStore } from '../state/tokens'
import { useToolStore } from '../state/tools'
import { useWallStore } from '../state/walls'
import { wsClient } from '../api/ws'
import { useVisionStore } from '../state/vision'
import type { Wall } from '../types/Wall'

export class AccessibilityDOM {
  private container: HTMLDivElement
  private liveRegion: HTMLDivElement
  private tokenList: HTMLUListElement
  private wallList: HTMLUListElement
  private unsubTokens: (() => void) | null = null
  private unsubTools: (() => void) | null = null
  private unsubWalls: (() => void) | null = null

  // Change detection: track previous arrays by reference
  private prevTokens: unknown[] = []

  constructor(parent: HTMLElement) {
    this.container = document.createElement('div')
    this.container.className = 'sr-only'
    this.container.setAttribute('aria-label', 'Canvas state')

    this.liveRegion = document.createElement('div')
    this.liveRegion.setAttribute('aria-live', 'polite')
    this.liveRegion.setAttribute('aria-atomic', 'true')
    this.container.appendChild(this.liveRegion)

    this.tokenList = document.createElement('ul')
    this.tokenList.setAttribute('aria-label', 'Tokens on map')
    this.container.appendChild(this.tokenList)

    this.wallList = document.createElement('ul')
    this.wallList.setAttribute('aria-label', 'Walls and doors on map')
    this.container.appendChild(this.wallList)

    parent.appendChild(this.container)

    this.unsubTokens = useTokenStore.subscribe(() => {
      const { tokens } = useTokenStore.getState()
      if (tokens !== this.prevTokens) {
        this.prevTokens = tokens
        this.syncTokens()
      }
    })
    this.unsubTools = useToolStore.subscribe((state, prev) => {
      if (state.activeTool !== prev.activeTool) {
        this.announce(`Tool: ${state.activeTool} selected`)
      }
    })
    this.unsubWalls = useWallStore.subscribe((state, prev) => {
      if (state.walls !== prev.walls) {
        this.syncWalls(state.walls)
      }
    })

    this.syncTokens()
    this.syncWalls(useWallStore.getState().walls)
  }

  private syncTokens(): void {
    const tokens = useTokenStore.getState().tokens
    this.tokenList.innerHTML = ''
    for (const token of tokens) {
      const li = document.createElement('li')
      const parts = [token.name]
      if (token.bars.length > 0) {
        const hpBar = token.bars[0]
        parts.push(`${hpBar.label}: ${hpBar.current}/${hpBar.max}`)
      }
      if (token.status_markers.length > 0) {
        parts.push(token.status_markers.join(', '))
      }
      parts.push(`at position ${token.x}, ${token.y}`)
      li.textContent = parts.join(', ')
      this.tokenList.appendChild(li)
    }
  }

  private syncWalls(walls: Wall[]): void {
    this.wallList.innerHTML = ''
    for (const wall of walls) {
      const li = document.createElement('li')

      if (wall.wall_type === 'door') {
        // Render doors as interactive buttons
        const btn = document.createElement('button')
        const stateLabel = wall.door_state ?? 'closed'
        btn.textContent = `Door at (${wall.x1},${wall.y1}) to (${wall.x2},${wall.y2}) — ${stateLabel}`
        btn.setAttribute('aria-label', `Door at (${wall.x1},${wall.y1}) to (${wall.x2},${wall.y2}), currently ${stateLabel}. Press to toggle.`)
        btn.addEventListener('click', () => {
          wsClient.send({ type: 'ToggleDoor', payload: { wall_id: wall.id } })
          useVisionStore.getState().setDirty()
        })
        li.appendChild(btn)
      } else {
        li.textContent = `Wall from (${wall.x1},${wall.y1}) to (${wall.x2},${wall.y2})`
      }

      this.wallList.appendChild(li)
    }
  }

  announce(message: string): void {
    this.liveRegion.textContent = ''
    // Force screen reader to re-read by clearing first, then setting after a tick
    requestAnimationFrame(() => {
      this.liveRegion.textContent = message
    })
  }

  /** Announce a door state change (called externally when door toggle is received from server) */
  announceDoorChange(doorState: string): void {
    if (doorState === 'open') {
      this.announce('Door opened')
    } else if (doorState === 'locked') {
      this.announce('Door is locked')
    } else {
      this.announce('Door closed')
    }
  }

  destroy(): void {
    this.unsubTokens?.()
    this.unsubTools?.()
    this.unsubWalls?.()
    this.container.remove()
  }
}
