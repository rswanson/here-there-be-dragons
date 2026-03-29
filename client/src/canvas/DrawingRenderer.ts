import { Graphics } from 'pixi.js'
import { useDrawingStore } from '../state/drawings'
import type { Drawing } from '../types/Drawing'
import type { DrawingType } from '../types/DrawingType'
import type { LayerManager } from './LayerManager'
import { parsePoints, hexToNumber } from './utils'

function renderDrawing(g: Graphics, drawing: Drawing): void {
  g.clear()

  const pts = parsePoints(drawing.points)
  if (pts.length === 0) return

  const type: DrawingType = drawing.drawing_type
  const strokeColor = hexToNumber(drawing.stroke_color)
  const strokeOpt = {
    color: strokeColor,
    alpha: drawing.stroke_opacity,
    width: drawing.stroke_width,
  }
  const hasFill = drawing.fill_color !== null
  const fillOpt = hasFill
    ? {
        color: hexToNumber(drawing.fill_color as string),
        alpha: drawing.fill_opacity,
      }
    : null

  switch (type) {
    case 'freehand': {
      if (pts.length < 2) return
      g.moveTo(pts[0].x, pts[0].y)
      for (let i = 1; i < pts.length; i++) {
        g.lineTo(pts[i].x, pts[i].y)
      }
      g.stroke(strokeOpt)
      break
    }

    case 'line': {
      if (pts.length < 2) return
      g.moveTo(pts[0].x, pts[0].y)
      g.lineTo(pts[1].x, pts[1].y)
      g.stroke(strokeOpt)
      break
    }

    case 'rectangle': {
      if (pts.length < 2) return
      const x = Math.min(pts[0].x, pts[1].x)
      const y = Math.min(pts[0].y, pts[1].y)
      const w = Math.abs(pts[1].x - pts[0].x)
      const h = Math.abs(pts[1].y - pts[0].y)
      g.rect(x, y, w, h)
      if (fillOpt) g.fill(fillOpt)
      g.stroke(strokeOpt)
      break
    }

    case 'circle': {
      if (pts.length < 2) return
      const cx = pts[0].x
      const cy = pts[0].y
      const radius = Math.sqrt(
        (pts[1].x - cx) * (pts[1].x - cx) + (pts[1].y - cy) * (pts[1].y - cy),
      )
      g.circle(cx, cy, radius)
      if (fillOpt) g.fill(fillOpt)
      g.stroke(strokeOpt)
      break
    }

    case 'polygon': {
      if (pts.length < 3) return
      const flat: number[] = pts.flatMap((p) => [p.x, p.y])
      g.poly(flat, true)
      if (fillOpt) g.fill(fillOpt)
      g.stroke(strokeOpt)
      break
    }

    // AoE types are rendered by AoeTemplates once placed — they are stored as
    // polygons of affected squares, so treat them like polygons here.
    case 'aoe_cone':
    case 'aoe_cube':
    case 'aoe_sphere':
    case 'aoe_line': {
      if (pts.length < 3) return
      const flat: number[] = pts.flatMap((p) => [p.x, p.y])
      g.poly(flat, true)
      const aoeFill = fillOpt ?? { color: 0xff4400, alpha: 0.3 }
      g.fill(aoeFill)
      g.stroke(strokeOpt)
      break
    }

    default:
      break
  }
}

export class DrawingRenderer {
  private layerManager: LayerManager
  private graphics = new Map<string, Graphics>()
  private unsubscribe: (() => void) | null = null

  // Change detection: track previous drawings array reference
  private prevDrawings: Drawing[] = []

  constructor(layerManager: LayerManager) {
    this.layerManager = layerManager
    this.unsubscribe = useDrawingStore.subscribe(() => {
      const { drawings } = useDrawingStore.getState()
      if (drawings !== this.prevDrawings) {
        this.prevDrawings = drawings
        this.sync()
      }
    })
    this.sync()
  }

  private sync(): void {
    const drawings = useDrawingStore.getState().drawings

    // Remove Graphics for drawings that no longer exist
    const currentIds = new Set(drawings.map((d) => d.id))
    for (const [id, g] of this.graphics) {
      if (!currentIds.has(id)) {
        g.parent?.removeChild(g)
        g.destroy()
        this.graphics.delete(id)
      }
    }

    // Create / update each drawing
    for (const drawing of drawings) {
      let g = this.graphics.get(drawing.id)
      if (!g) {
        g = new Graphics()
        this.graphics.set(drawing.id, g)
      }

      renderDrawing(g, drawing)

      // Attach to the correct layer container
      const layerContainer = this.layerManager.getContainer(drawing.layer_id)
      if (layerContainer && g.parent !== layerContainer) {
        g.parent?.removeChild(g)
        layerContainer.addChild(g)
      }
    }
  }

  destroy(): void {
    this.unsubscribe?.()
    for (const [, g] of this.graphics) {
      g.parent?.removeChild(g)
      g.destroy()
    }
    this.graphics.clear()
  }
}
