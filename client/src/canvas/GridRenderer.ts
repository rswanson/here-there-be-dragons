import { Graphics } from 'pixi.js'
import type { Application } from 'pixi.js'
import { useMapStore } from '../state/map'
import type { Viewport } from './Viewport'
import type { Bounds } from './Viewport'

export class GridRenderer {
  private graphics: Graphics
  private viewport: Viewport
  private app: Application
  private unsubscribe: (() => void) | null = null

  // Change detection: cache last-rendered state to skip redundant redraws
  private lastBounds: Bounds | null = null
  private lastGridSize = 0
  private lastGridEnabled = false
  private lastGridColor = ''
  private lastGridOpacity = 0
  private lastGridLineWidth = 0

  constructor(app: Application, viewport: Viewport) {
    this.app = app
    this.viewport = viewport
    this.graphics = new Graphics()
    // Add grid as first child (behind everything else)
    viewport.container.addChildAt(this.graphics, 0)

    // Subscribe to map store changes
    this.unsubscribe = useMapStore.subscribe(() => this.invalidate())

    // Also render on each tick (for viewport changes during pan/zoom)
    this.app.ticker.add(this.render, this)

    this.render()
  }

  private invalidate(): void {
    // Force next render() to redraw by clearing cached bounds
    this.lastBounds = null
  }

  private render = (): void => {
    const map = useMapStore.getState().currentMap
    if (!map || !map.grid_enabled) {
      if (this.lastGridEnabled !== false || this.lastBounds !== null) {
        this.graphics.clear()
        this.graphics.visible = false
        this.lastGridEnabled = false
        this.lastBounds = null
      }
      return
    }

    const gridSize = map.grid_size_px
    const bounds = this.viewport.getVisibleBounds()
    const gridEnabled = map.grid_enabled
    const gridColor = map.grid_color
    const gridOpacity = map.grid_opacity
    const gridLineWidth = map.grid_line_width

    // Skip redraw if nothing changed
    if (
      this.lastBounds &&
      this.lastGridSize === gridSize &&
      this.lastGridEnabled === gridEnabled &&
      this.lastGridColor === gridColor &&
      this.lastGridOpacity === gridOpacity &&
      this.lastGridLineWidth === gridLineWidth &&
      Math.abs(bounds.x - this.lastBounds.x) < 0.01 &&
      Math.abs(bounds.y - this.lastBounds.y) < 0.01 &&
      Math.abs(bounds.width - this.lastBounds.width) < 0.01 &&
      Math.abs(bounds.height - this.lastBounds.height) < 0.01
    ) {
      return
    }

    this.lastBounds = { ...bounds }
    this.lastGridSize = gridSize
    this.lastGridEnabled = gridEnabled
    this.lastGridColor = gridColor
    this.lastGridOpacity = gridOpacity
    this.lastGridLineWidth = gridLineWidth

    this.graphics.clear()
    this.graphics.visible = true

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
