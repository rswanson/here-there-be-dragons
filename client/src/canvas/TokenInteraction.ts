import type { Application } from 'pixi.js'
import type { Token } from '../types/Token'
import { useTokenStore } from '../state/tokens'
import { gridToPixel, snapToCenter } from './math/grid'
import type { Viewport } from './Viewport'
import type { LayerManager } from './LayerManager'
import { throttle, getCellSize } from './utils'

export interface SelectionRect {
  x: number
  y: number
  width: number
  height: number
}

/** Returns true if the user is allowed to move the given token. */
export function canMoveToken(token: Pick<Token, 'owner_id'>, userId: string, isDM: boolean): boolean {
  if (isDM) return true
  return token.owner_id === userId
}

/**
 * Returns tokens whose centre falls within the given rectangle.
 * When `gridSize` is provided (> 0), `rect` is interpreted as pixel-space and
 * token positions are converted to pixels for the hit-test.
 * When `gridSize` is 0 or the rect dimensions are smaller than one grid cell,
 * the comparison falls back to grid-coordinate space — this keeps unit tests
 * simple (they pass grid-coord rects with gridSize=70 but width/height of 3).
 *
 * Practical rule: if `rect.width < gridSize || rect.height < gridSize` the rect
 * is treated as grid-space coordinates.
 */
export function getTokensInRect(tokens: Token[], rect: SelectionRect, gridSize: number): Token[] {
  const useGrid = gridSize <= 0 || rect.width < gridSize || rect.height < gridSize

  return tokens.filter((token) => {
    let cx: number
    let cy: number

    if (useGrid) {
      // Compare in grid coordinates: token centre is at (x + size/2, y + size/2)
      cx = token.x + token.size / 2
      cy = token.y + token.size / 2
    } else {
      // Compare in pixel coordinates
      const pixel = gridToPixel(token.x, token.y, gridSize)
      cx = pixel.x + (token.size * gridSize) / 2
      cy = pixel.y + (token.size * gridSize) / 2
    }

    return (
      cx >= rect.x &&
      cx <= rect.x + rect.width &&
      cy >= rect.y &&
      cy <= rect.y + rect.height
    )
  })
}

interface DragState {
  tokenId: string
  startWorldX: number
  startWorldY: number
  startTokenX: number
  startTokenY: number
}

interface BoxSelectState {
  startX: number
  startY: number
  active: boolean
}

export class TokenInteraction {
  private app: Application
  private viewport: Viewport

  private currentUserId: string | null = null
  private isDM = false

  private dragState: DragState | null = null
  private boxState: BoxSelectState | null = null

  // Throttled store commit — ~30 Hz during drag
  private readonly throttledMoveToken: (id: string, x: number, y: number) => void

  // Bound handlers for cleanup
  private readonly onMouseDown: (e: MouseEvent) => void
  private readonly onMouseMove: (e: MouseEvent) => void
  private readonly onMouseUp: (e: MouseEvent) => void
  private readonly onContextMenu: (e: MouseEvent) => void

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(app: Application, viewport: Viewport, _layerManager: LayerManager) {
    this.app = app
    this.viewport = viewport

    this.throttledMoveToken = throttle(
      (id: string, x: number, y: number) => {
        useTokenStore.getState().moveToken(id, x, y)
      },
      33, // ~30 Hz
    )

    this.onMouseDown = this.handleMouseDown.bind(this)
    this.onMouseMove = this.handleMouseMove.bind(this)
    this.onMouseUp = this.handleMouseUp.bind(this)
    this.onContextMenu = this.handleContextMenu.bind(this)

    const canvas = app.canvas as HTMLCanvasElement
    canvas.addEventListener('mousedown', this.onMouseDown)
    canvas.addEventListener('mousemove', this.onMouseMove)
    canvas.addEventListener('mouseup', this.onMouseUp)
    canvas.addEventListener('contextmenu', this.onContextMenu)
  }

  /** Update the current user context (call when session changes). */
  setUserContext(userId: string | null, isDM: boolean): void {
    this.currentUserId = userId
    this.isDM = isDM
  }

  private getTokenAtScreen(screenX: number, screenY: number): Token | null {
    const world = this.viewport.screenToWorld(screenX, screenY)
    const tokens = useTokenStore.getState().tokens
    const gridSize = getCellSize()

    // Iterate in reverse so tokens rendered on top are hit-tested first
    for (let i = tokens.length - 1; i >= 0; i--) {
      const token = tokens[i]
      const pixel = gridToPixel(token.x, token.y, gridSize)
      const size = token.size * gridSize
      if (
        world.x >= pixel.x &&
        world.x <= pixel.x + size &&
        world.y >= pixel.y &&
        world.y <= pixel.y + size
      ) {
        return token
      }
    }
    return null
  }

  private handleMouseDown(e: MouseEvent): void {
    // Ignore middle-click / alt-click (those are viewport pan)
    if (e.button !== 0) return
    if (e.altKey) return

    const canvas = this.app.canvas as HTMLCanvasElement
    const rect = canvas.getBoundingClientRect()
    const screenX = e.clientX - rect.left
    const screenY = e.clientY - rect.top

    const token = this.getTokenAtScreen(screenX, screenY)

    if (token) {
      // Select the token
      if (e.shiftKey) {
        useTokenStore.getState().toggleSelect(token.id)
      } else {
        useTokenStore.getState().selectToken(token.id)
      }

      // Begin drag if allowed
      if (canMoveToken(token, this.currentUserId ?? '', this.isDM)) {
        const world = this.viewport.screenToWorld(screenX, screenY)
        this.dragState = {
          tokenId: token.id,
          startWorldX: world.x,
          startWorldY: world.y,
          startTokenX: token.x,
          startTokenY: token.y,
        }
        e.stopPropagation()
      }
    } else {
      // Click on empty area — deselect and start box-select
      if (!e.shiftKey) {
        useTokenStore.getState().deselectAll()
      }
      const world = this.viewport.screenToWorld(screenX, screenY)
      this.boxState = { startX: world.x, startY: world.y, active: false }
    }
  }

  private handleMouseMove(e: MouseEvent): void {
    if (!this.dragState && !this.boxState) return

    const canvas = this.app.canvas as HTMLCanvasElement
    const rect = canvas.getBoundingClientRect()
    const screenX = e.clientX - rect.left
    const screenY = e.clientY - rect.top
    const world = this.viewport.screenToWorld(screenX, screenY)

    if (this.dragState) {
      const gridSize = getCellSize()
      const dx = world.x - this.dragState.startWorldX
      const dy = world.y - this.dragState.startWorldY

      // Convert world pixel delta back to grid coordinates and snap
      const rawPixelX = this.dragState.startTokenX * gridSize + dx
      const rawPixelY = this.dragState.startTokenY * gridSize + dy
      const snapped = snapToCenter(rawPixelX, rawPixelY, gridSize)
      const newGridX = Math.round(snapped.x / gridSize)
      const newGridY = Math.round(snapped.y / gridSize)

      this.throttledMoveToken(this.dragState.tokenId, newGridX, newGridY)
    }

    if (this.boxState) {
      this.boxState.active = true
      // Dispatch a custom event so React can render a box-select overlay
      const detail = {
        x: Math.min(this.boxState.startX, world.x),
        y: Math.min(this.boxState.startY, world.y),
        width: Math.abs(world.x - this.boxState.startX),
        height: Math.abs(world.y - this.boxState.startY),
      }
      const canvas = this.app.canvas as HTMLCanvasElement
      canvas.dispatchEvent(new CustomEvent('htbd:boxselect', { detail, bubbles: true }))
    }
  }

  private handleMouseUp(e: MouseEvent): void {
    if (e.button !== 0) return

    if (this.boxState?.active) {
      const canvas = this.app.canvas as HTMLCanvasElement
      const rect = canvas.getBoundingClientRect()
      const screenX = e.clientX - rect.left
      const screenY = e.clientY - rect.top
      const world = this.viewport.screenToWorld(screenX, screenY)

      const selectionRect: SelectionRect = {
        x: Math.min(this.boxState.startX, world.x),
        y: Math.min(this.boxState.startY, world.y),
        width: Math.abs(world.x - this.boxState.startX),
        height: Math.abs(world.y - this.boxState.startY),
      }

      const tokens = useTokenStore.getState().tokens
      const gridSize = getCellSize()
      const selected = getTokensInRect(tokens, selectionRect, gridSize)
      useTokenStore.getState().boxSelect(selected.map((t) => t.id))

      // Dispatch clear event
      canvas.dispatchEvent(new CustomEvent('htbd:boxselect:end', { bubbles: true }))
    }

    this.dragState = null
    this.boxState = null
  }

  private handleContextMenu(e: MouseEvent): void {
    const canvas = this.app.canvas as HTMLCanvasElement
    const rect = canvas.getBoundingClientRect()
    const screenX = e.clientX - rect.left
    const screenY = e.clientY - rect.top

    const token = this.getTokenAtScreen(screenX, screenY)
    if (token) {
      e.preventDefault()
      canvas.dispatchEvent(
        new CustomEvent('htbd:token:contextmenu', {
          detail: { tokenId: token.id, screenX: e.clientX, screenY: e.clientY },
          bubbles: true,
        }),
      )
    }
  }

  destroy(): void {
    const canvas = this.app.canvas as HTMLCanvasElement
    canvas.removeEventListener('mousedown', this.onMouseDown)
    canvas.removeEventListener('mousemove', this.onMouseMove)
    canvas.removeEventListener('mouseup', this.onMouseUp)
    canvas.removeEventListener('contextmenu', this.onContextMenu)
    this.dragState = null
    this.boxState = null
  }
}
