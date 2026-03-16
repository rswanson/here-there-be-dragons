import { Container } from 'pixi.js'
import type { Application } from 'pixi.js'

export interface Bounds {
  x: number
  y: number
  width: number
  height: number
}

export class Viewport {
  readonly container: Container
  private app: Application
  private isPanning = false
  private lastPointer = { x: 0, y: 0 }
  private readonly MIN_ZOOM = 0.1
  private readonly MAX_ZOOM = 5

  // Bound event handler references for cleanup
  private readonly onMouseDown: (e: MouseEvent) => void
  private readonly onMouseMove: (e: MouseEvent) => void
  private readonly onMouseUp: (e: MouseEvent) => void
  private readonly onWheel: (e: WheelEvent) => void
  private readonly onKeyDown: (e: KeyboardEvent) => void

  constructor(app: Application) {
    this.app = app
    this.container = new Container()
    app.stage.addChild(this.container)

    this.onMouseDown = this.handleMouseDown.bind(this)
    this.onMouseMove = this.handleMouseMove.bind(this)
    this.onMouseUp = this.handleMouseUp.bind(this)
    this.onWheel = this.handleWheel.bind(this)
    this.onKeyDown = this.handleKeyDown.bind(this)

    const canvas = app.canvas as HTMLCanvasElement
    canvas.addEventListener('mousedown', this.onMouseDown)
    canvas.addEventListener('mousemove', this.onMouseMove)
    canvas.addEventListener('mouseup', this.onMouseUp)
    canvas.addEventListener('mouseleave', this.onMouseUp)
    canvas.addEventListener('wheel', this.onWheel, { passive: false })
    window.addEventListener('keydown', this.onKeyDown)
  }

  private handleMouseDown(e: MouseEvent): void {
    // Middle mouse button (button === 1) or Alt+left click for pan
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      this.isPanning = true
      this.lastPointer = { x: e.clientX, y: e.clientY }
      e.preventDefault()
    }
  }

  private handleMouseMove(e: MouseEvent): void {
    if (!this.isPanning) return

    const dx = e.clientX - this.lastPointer.x
    const dy = e.clientY - this.lastPointer.y
    this.lastPointer = { x: e.clientX, y: e.clientY }

    this.container.position.x += dx
    this.container.position.y += dy
  }

  private handleMouseUp(e: MouseEvent): void {
    if (e.button === 1 || (e.button === 0 && e.altKey) || e.type === 'mouseleave') {
      this.isPanning = false
    }
  }

  private handleWheel(e: WheelEvent): void {
    e.preventDefault()

    const canvas = this.app.canvas as HTMLCanvasElement
    const rect = canvas.getBoundingClientRect()

    // Cursor position relative to canvas
    const screenX = e.clientX - rect.left
    const screenY = e.clientY - rect.top

    // Determine zoom factor
    const zoomFactor = e.deltaY < 0 ? 1.1 : 1 / 1.1
    const currentScale = this.container.scale.x
    const newScale = Math.min(this.MAX_ZOOM, Math.max(this.MIN_ZOOM, currentScale * zoomFactor))

    if (newScale === currentScale) return

    // Zoom centered on cursor: adjust position so the world point under the
    // cursor stays at the same screen position after scaling.
    const worldX = (screenX - this.container.position.x) / currentScale
    const worldY = (screenY - this.container.position.y) / currentScale

    this.container.scale.set(newScale)
    this.container.position.x = screenX - worldX * newScale
    this.container.position.y = screenY - worldY * newScale
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Home') {
      // Fit-to-map: reset to identity transform
      this.container.position.set(0, 0)
      this.container.scale.set(1)
    }
    // 'F' (center on selected token) is a no-op here; callers should use centerOn()
  }

  /** Convert a screen-space point to world-space coordinates. */
  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    const scale = this.container.scale.x
    return {
      x: (sx - this.container.position.x) / scale,
      y: (sy - this.container.position.y) / scale,
    }
  }

  /** Convert a screen-space MouseEvent to world-space coordinates. */
  screenToWorldFromEvent(e: MouseEvent): { x: number; y: number } {
    const rect = (this.app.canvas as HTMLCanvasElement).getBoundingClientRect()
    return this.screenToWorld(e.clientX - rect.left, e.clientY - rect.top)
  }

  /** Convert a world-space point to screen-space coordinates. */
  worldToScreen(wx: number, wy: number): { x: number; y: number } {
    const scale = this.container.scale.x
    return {
      x: wx * scale + this.container.position.x,
      y: wy * scale + this.container.position.y,
    }
  }

  /** Return the world-space rectangle currently visible on screen. */
  getVisibleBounds(): Bounds {
    const screen = this.app.screen
    const topLeft = this.screenToWorld(0, 0)
    const bottomRight = this.screenToWorld(screen.width, screen.height)
    return {
      x: topLeft.x,
      y: topLeft.y,
      width: bottomRight.x - topLeft.x,
      height: bottomRight.y - topLeft.y,
    }
  }

  /**
   * Scale and center the viewport so that a rect of the given world dimensions
   * fits within the screen (used for "fit to map" / Home key behaviour).
   */
  fitToRect(width: number, height: number): void {
    const screen = this.app.screen
    const scaleX = screen.width / width
    const scaleY = screen.height / height
    const scale = Math.min(this.MAX_ZOOM, Math.max(this.MIN_ZOOM, Math.min(scaleX, scaleY)))

    this.container.scale.set(scale)
    this.container.position.x = (screen.width - width * scale) / 2
    this.container.position.y = (screen.height - height * scale) / 2
  }

  /** Pan so that the given world-space point is at the centre of the screen. */
  centerOn(wx: number, wy: number): void {
    const screen = this.app.screen
    const scale = this.container.scale.x
    this.container.position.x = screen.width / 2 - wx * scale
    this.container.position.y = screen.height / 2 - wy * scale
  }

  /** Remove event listeners and detach the container from the stage. */
  destroy(): void {
    const canvas = this.app.canvas as HTMLCanvasElement
    canvas.removeEventListener('mousedown', this.onMouseDown)
    canvas.removeEventListener('mousemove', this.onMouseMove)
    canvas.removeEventListener('mouseup', this.onMouseUp)
    canvas.removeEventListener('mouseleave', this.onMouseUp)
    canvas.removeEventListener('wheel', this.onWheel)
    window.removeEventListener('keydown', this.onKeyDown)

    if (this.container.parent) {
      this.container.parent.removeChild(this.container)
    }
    this.container.destroy()
  }
}
