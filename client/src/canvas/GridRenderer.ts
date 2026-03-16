import { Graphics } from 'pixi.js'
import type { Application } from 'pixi.js'
import { useMapStore } from '../state/map'
import type { Viewport } from './Viewport'

export class GridRenderer {
  private graphics: Graphics
  private viewport: Viewport
  private app: Application
  private unsubscribe: (() => void) | null = null

  constructor(app: Application, viewport: Viewport) {
    this.app = app
    this.viewport = viewport
    this.graphics = new Graphics()
    // Add grid as first child (behind everything else)
    viewport.container.addChildAt(this.graphics, 0)

    // Subscribe to map store changes
    this.unsubscribe = useMapStore.subscribe(() => this.render())

    // Also render on each tick (for viewport changes during pan/zoom)
    this.app.ticker.add(this.render, this)

    this.render()
  }

  private render = (): void => {
    const map = useMapStore.getState().currentMap
    this.graphics.clear()
    if (!map || !map.grid_enabled) {
      this.graphics.visible = false
      return
    }
    this.graphics.visible = true

    const gridSize = map.grid_size_px
    const bounds = this.viewport.getVisibleBounds()

    // Calculate grid line range based on visible bounds (culling)
    const startCol = Math.max(0, Math.floor(bounds.x / gridSize))
    const endCol = Math.min(map.width_squares, Math.ceil((bounds.x + bounds.width) / gridSize))
    const startRow = Math.max(0, Math.floor(bounds.y / gridSize))
    const endRow = Math.min(map.height_squares, Math.ceil((bounds.y + bounds.height) / gridSize))

    const totalWidth = map.width_squares * gridSize
    const totalHeight = map.height_squares * gridSize

    this.graphics.setStrokeStyle({
      width: map.grid_line_width,
      color: map.grid_color,
      alpha: map.grid_opacity,
    })

    // Draw vertical lines
    for (let col = startCol; col <= endCol; col++) {
      const x = col * gridSize
      this.graphics.moveTo(x, Math.max(0, startRow * gridSize))
      this.graphics.lineTo(x, Math.min(totalHeight, endRow * gridSize))
    }

    // Draw horizontal lines
    for (let row = startRow; row <= endRow; row++) {
      const y = row * gridSize
      this.graphics.moveTo(Math.max(0, startCol * gridSize), y)
      this.graphics.lineTo(Math.min(totalWidth, endCol * gridSize), y)
    }

    this.graphics.stroke()
  }

  destroy(): void {
    this.app.ticker.remove(this.render, this)
    this.unsubscribe?.()
    if (this.graphics.parent) {
      this.graphics.parent.removeChild(this.graphics)
    }
    this.graphics.destroy()
  }
}
