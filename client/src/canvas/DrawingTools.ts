import type { Application } from 'pixi.js'
import { Graphics } from 'pixi.js'
import type { ToolName } from '../state/tools'
import { useToolStore } from '../state/tools'
import { useMapStore } from '../state/map'
import { useDrawingStore } from '../state/drawings'
import type { Drawing } from '../types/Drawing'
import type { DrawingType } from '../types/DrawingType'
import { simplifyPoints } from './math/simplify'
import type { Viewport } from './Viewport'
import type { LayerManager } from './LayerManager'
import { parsePoints, hexToNumber, newDrawingId, throttle } from './utils'

// ---------------------------------------------------------------------------
// Pure utility helpers (exported for tests)
// ---------------------------------------------------------------------------

const DRAWING_TOOLS = new Set<ToolName>([
  'freehand',
  'line',
  'rectangle',
  'circle',
  'polygon',
  'eraser',
])

const AOE_TOOLS = new Set<ToolName>([
  'aoe_cone',
  'aoe_cube',
  'aoe_sphere',
  'aoe_line',
])

export function isDrawingTool(tool: string): boolean {
  return DRAWING_TOOLS.has(tool as ToolName)
}

export function isAoeTool(tool: string): boolean {
  return AOE_TOOLS.has(tool as ToolName)
}

/**
 * Eraser hit test — checks whether world point (wx, wy) is close enough to a
 * drawing to count as a hit.  Uses a simple bounding-shape approach; no PixiJS
 * needed so this is unit-testable.
 */
export function hitTestDrawing(
  drawing: Drawing,
  wx: number,
  wy: number,
): boolean {
  const pts = parsePoints(drawing.points)
  if (pts.length === 0) return false

  const type: DrawingType = drawing.drawing_type
  const halfStroke = drawing.stroke_width / 2

  switch (type) {
    case 'rectangle': {
      if (pts.length < 2) return false
      const x0 = Math.min(pts[0].x, pts[1].x)
      const y0 = Math.min(pts[0].y, pts[1].y)
      const x1 = Math.max(pts[0].x, pts[1].x)
      const y1 = Math.max(pts[0].y, pts[1].y)
      return (
        wx >= x0 - halfStroke &&
        wx <= x1 + halfStroke &&
        wy >= y0 - halfStroke &&
        wy <= y1 + halfStroke
      )
    }

    case 'circle': {
      if (pts.length < 2) return false
      const cx = pts[0].x
      const cy = pts[0].y
      const radius =
        Math.sqrt(
          (pts[1].x - cx) * (pts[1].x - cx) + (pts[1].y - cy) * (pts[1].y - cy),
        )
      const dist = Math.sqrt((wx - cx) * (wx - cx) + (wy - cy) * (wy - cy))
      return dist <= radius + halfStroke
    }

    case 'line': {
      if (pts.length < 2) return false
      return distToSegment(wx, wy, pts[0].x, pts[0].y, pts[1].x, pts[1].y) <=
        halfStroke + 4
    }

    case 'freehand':
    case 'polygon': {
      // Hit if within halfStroke+4 of any segment
      for (let i = 0; i < pts.length - 1; i++) {
        if (
          distToSegment(wx, wy, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y) <=
          halfStroke + 4
        ) {
          return true
        }
      }
      return false
    }

    default:
      return false
  }
}

function distToSegment(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number,
): number {
  const dx = bx - ax
  const dy = by - ay
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) {
    return Math.sqrt((px - ax) * (px - ax) + (py - ay) * (py - ay))
  }
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq))
  const projX = ax + t * dx
  const projY = ay + t * dy
  return Math.sqrt((px - projX) * (px - projX) + (py - projY) * (py - projY))
}

// ---------------------------------------------------------------------------
// DrawingTools class — event-driven tool state machine
// ---------------------------------------------------------------------------

type Point = { x: number; y: number }

/** A PixiJS Graphics overlay for previewing in-progress strokes. */
export class DrawingTools {
  private app: Application
  private viewport: Viewport

  /** Preview graphics object drawn on the top-level stage (not in a layer). */
  private preview: Graphics | null = null

  // Freehand state
  private freehandPoints: Point[] = []

  // Line / rect / circle state
  private shapeStart: Point | null = null

  // Polygon state
  private polyPoints: Point[] = []
  private polyLastClickTime = 0

  // Bound handler refs for removal
  private readonly onMouseDown: (e: MouseEvent) => void
  private readonly onMouseMove: (e: MouseEvent) => void
  private readonly onMouseUp: (e: MouseEvent) => void
  private readonly onDblClick: (e: MouseEvent) => void

  // Throttled freehand point collector — ~30 Hz
  private readonly throttledFreehandMove: (world: Point) => void

  constructor(app: Application, viewport: Viewport, _layerManager: LayerManager) {
    this.app = app
    this.viewport = viewport

    this.throttledFreehandMove = throttle((world: Point) => {
      this.freehandPoints.push(world)
      this.renderFreehandPreview()
    }, 33) // ~30 Hz

    this.onMouseDown = this.handleMouseDown.bind(this)
    this.onMouseMove = this.handleMouseMove.bind(this)
    this.onMouseUp = this.handleMouseUp.bind(this)
    this.onDblClick = this.handleDblClick.bind(this)

    const canvas = app.canvas as HTMLCanvasElement
    canvas.addEventListener('mousedown', this.onMouseDown)
    canvas.addEventListener('mousemove', this.onMouseMove)
    canvas.addEventListener('mouseup', this.onMouseUp)
    canvas.addEventListener('dblclick', this.onDblClick)
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private getActiveTool(): ToolName {
    return useToolStore.getState().activeTool
  }

  private getOrCreatePreview(): Graphics {
    if (!this.preview) {
      this.preview = new Graphics()
      this.app.stage.addChild(this.preview)
    }
    return this.preview
  }

  private clearPreview(): void {
    if (this.preview) {
      this.preview.clear()
    }
  }

  private worldToScreen(wx: number, wy: number): Point {
    return this.viewport.worldToScreen(wx, wy)
  }

  private strokeStyle() {
    const s = useToolStore.getState().drawSettings
    return {
      color: hexToNumber(s.strokeColor),
      alpha: s.strokeOpacity,
      width: s.strokeWidth,
    }
  }

  private fillStyle() {
    const s = useToolStore.getState().drawSettings
    if (!s.fillColor) return null
    return { color: hexToNumber(s.fillColor), alpha: s.fillOpacity }
  }

  private activeLayerId(): string | null {
    return useMapStore.getState().activeLayerId
  }

  private addDrawing(
    drawingType: DrawingType,
    points: Point[],
  ): void {
    const layerId = this.activeLayerId()
    if (!layerId) return
    const s = useToolStore.getState().drawSettings
    const drawing: Drawing = {
      id: newDrawingId(),
      layer_id: layerId,
      drawing_type: drawingType,
      points: points as Drawing['points'],
      stroke_color: s.strokeColor,
      stroke_width: s.strokeWidth,
      stroke_opacity: s.strokeOpacity,
      fill_color: s.fillColor,
      fill_opacity: s.fillOpacity,
      created_at: new Date().toISOString(),
    }
    useDrawingStore.getState().addDrawing(drawing)
  }

  // -------------------------------------------------------------------------
  // Event handlers
  // -------------------------------------------------------------------------

  private handleMouseDown(e: MouseEvent): void {
    if (e.button !== 0 || e.altKey) return
    const tool = this.getActiveTool()
    const world = this.viewport.screenToWorldFromEvent(e)

    if (tool === 'freehand') {
      this.freehandPoints = [world]
    } else if (tool === 'line' || tool === 'rectangle' || tool === 'circle') {
      this.shapeStart = world
    } else if (tool === 'polygon') {
      const now = Date.now()
      if (now - this.polyLastClickTime < 400 && this.polyPoints.length >= 2) {
        // Double-click detected via timing — close polygon
        this.closePolygon()
        return
      }
      this.polyLastClickTime = now
      this.polyPoints.push(world)
    } else if (tool === 'eraser') {
      this.eraseAt(world)
    }
  }

  private handleMouseMove(e: MouseEvent): void {
    const tool = this.getActiveTool()
    const world = this.viewport.screenToWorldFromEvent(e)

    if (tool === 'freehand' && this.freehandPoints.length > 0) {
      this.throttledFreehandMove(world)
    } else if (
      (tool === 'line' || tool === 'rectangle' || tool === 'circle') &&
      this.shapeStart
    ) {
      this.renderShapePreview(tool, this.shapeStart, world)
    } else if (tool === 'polygon' && this.polyPoints.length > 0) {
      this.renderPolygonPreview(world)
    }
  }

  private handleMouseUp(e: MouseEvent): void {
    if (e.button !== 0) return
    const tool = this.getActiveTool()
    const world = this.viewport.screenToWorldFromEvent(e)

    if (tool === 'freehand' && this.freehandPoints.length >= 2) {
      const simplified = simplifyPoints(this.freehandPoints, 2)
      this.addDrawing('freehand', simplified)
      this.freehandPoints = []
      this.clearPreview()
    } else if (
      (tool === 'line' || tool === 'rectangle' || tool === 'circle') &&
      this.shapeStart
    ) {
      this.addDrawing(
        tool as DrawingType,
        [this.shapeStart, world],
      )
      this.shapeStart = null
      this.clearPreview()
    }
  }

  private handleDblClick(e: MouseEvent): void {
    const tool = this.getActiveTool()
    if (tool === 'polygon' && this.polyPoints.length >= 2) {
      e.preventDefault()
      this.closePolygon()
    }
  }

  private closePolygon(): void {
    if (this.polyPoints.length >= 2) {
      this.addDrawing('polygon', [...this.polyPoints])
    }
    this.polyPoints = []
    this.clearPreview()
  }

  private eraseAt(world: Point): void {
    const drawings = useDrawingStore.getState().drawings
    for (const drawing of drawings) {
      if (hitTestDrawing(drawing, world.x, world.y)) {
        useDrawingStore.getState().removeDrawing(drawing.id)
        break
      }
    }
  }

  // -------------------------------------------------------------------------
  // Preview rendering helpers (screen-space)
  // -------------------------------------------------------------------------

  private renderFreehandPreview(): void {
    const g = this.getOrCreatePreview()
    g.clear()
    if (this.freehandPoints.length < 2) return

    const stroke = this.strokeStyle()
    const scale = (this.viewport as unknown as { container: { scale: { x: number } } }).container.scale.x

    const screenPts = this.freehandPoints.map((p) => this.worldToScreen(p.x, p.y))
    g.moveTo(screenPts[0].x, screenPts[0].y)
    for (let i = 1; i < screenPts.length; i++) {
      g.lineTo(screenPts[i].x, screenPts[i].y)
    }
    g.stroke({ color: stroke.color, alpha: stroke.alpha, width: stroke.width * scale })
  }

  private renderShapePreview(
    tool: 'line' | 'rectangle' | 'circle',
    start: Point,
    end: Point,
  ): void {
    const g = this.getOrCreatePreview()
    g.clear()
    const stroke = this.strokeStyle()
    const fill = this.fillStyle()
    const scale = (this.viewport as unknown as { container: { scale: { x: number } } }).container.scale.x
    const strokeOpt = { color: stroke.color, alpha: stroke.alpha, width: stroke.width * scale }

    const s = this.worldToScreen(start.x, start.y)
    const e2 = this.worldToScreen(end.x, end.y)

    if (tool === 'line') {
      g.moveTo(s.x, s.y)
      g.lineTo(e2.x, e2.y)
      g.stroke(strokeOpt)
    } else if (tool === 'rectangle') {
      const x = Math.min(s.x, e2.x)
      const y = Math.min(s.y, e2.y)
      const w = Math.abs(e2.x - s.x)
      const h = Math.abs(e2.y - s.y)
      g.rect(x, y, w, h)
      if (fill) g.fill({ color: fill.color, alpha: fill.alpha })
      g.stroke(strokeOpt)
    } else if (tool === 'circle') {
      const cx = s.x
      const cy = s.y
      const radius = Math.sqrt((e2.x - s.x) ** 2 + (e2.y - s.y) ** 2)
      g.circle(cx, cy, radius)
      if (fill) g.fill({ color: fill.color, alpha: fill.alpha })
      g.stroke(strokeOpt)
    }
  }

  private renderPolygonPreview(cursor: Point): void {
    const g = this.getOrCreatePreview()
    g.clear()
    if (this.polyPoints.length === 0) return

    const stroke = this.strokeStyle()
    const scale = (this.viewport as unknown as { container: { scale: { x: number } } }).container.scale.x
    const strokeOpt = { color: stroke.color, alpha: stroke.alpha, width: stroke.width * scale }

    const screenPts = this.polyPoints.map((p) => this.worldToScreen(p.x, p.y))
    const cursorScreen = this.worldToScreen(cursor.x, cursor.y)

    g.moveTo(screenPts[0].x, screenPts[0].y)
    for (let i = 1; i < screenPts.length; i++) {
      g.lineTo(screenPts[i].x, screenPts[i].y)
    }
    g.lineTo(cursorScreen.x, cursorScreen.y)
    g.stroke(strokeOpt)
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  destroy(): void {
    const canvas = this.app.canvas as HTMLCanvasElement
    canvas.removeEventListener('mousedown', this.onMouseDown)
    canvas.removeEventListener('mousemove', this.onMouseMove)
    canvas.removeEventListener('mouseup', this.onMouseUp)
    canvas.removeEventListener('dblclick', this.onDblClick)

    if (this.preview) {
      this.preview.parent?.removeChild(this.preview)
      this.preview.destroy()
      this.preview = null
    }

    this.freehandPoints = []
    this.shapeStart = null
    this.polyPoints = []
  }
}
