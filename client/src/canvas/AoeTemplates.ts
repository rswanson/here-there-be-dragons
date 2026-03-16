import type { Application } from 'pixi.js'
import { Graphics } from 'pixi.js'
import { useToolStore } from '../state/tools'
import { useMapStore } from '../state/map'
import { useDrawingStore } from '../state/drawings'
import type { Drawing } from '../types/Drawing'
import type { DrawingType } from '../types/DrawingType'
import {
  sphereAffectedSquares,
  cubeAffectedSquares,
  coneAffectedSquares,
  lineAffectedSquares,
} from './math/aoe'
import { gridToPixel, pixelToGrid } from './math/grid'
import { isAoeTool } from './DrawingTools'
import type { Viewport } from './Viewport'

const AOE_FILL_COLOR = 0xff4400
const AOE_FILL_ALPHA = 0.35
const AOE_STROKE_COLOR = 0xff6600
const AOE_STROKE_ALPHA = 0.8
const AOE_STROKE_WIDTH = 2

/** Default AoE dimensions in grid squares */
const AOE_DEFAULTS: Record<string, { radius?: number; size?: number; length?: number; width?: number; angle?: number }> = {
  aoe_sphere: { radius: 3 },
  aoe_cube: { size: 3 },
  aoe_cone: { length: 4, angle: 90 },
  aoe_line: { length: 6, width: 1 },
}

function newDrawingId(): string {
  return `drawing-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function squaresToPoints(
  squares: Array<{ col: number; row: number }>,
  cellSize: number,
): Array<{ x: number; y: number }> {
  if (squares.length === 0) return []
  // Build a closed outline polygon for a rectangular bounding box of all cells,
  // then add per-cell outlines as a flat list.  For storage simplicity we store
  // the four corners of each cell and then the store/renderer treats them as poly.
  // We actually store the per-cell boundary as a merged polygon:
  // For now store a simple flat list of [x,y] pairs representing all 4 corners
  // of the bounding rect (good enough for highlight purposes).

  // More accurate: store per-cell polygons by listing corner points for each cell.
  const pts: Array<{ x: number; y: number }> = []
  for (const sq of squares) {
    const p = gridToPixel(sq.col, sq.row, cellSize)
    pts.push(
      { x: p.x, y: p.y },
      { x: p.x + cellSize, y: p.y },
      { x: p.x + cellSize, y: p.y + cellSize },
      { x: p.x, y: p.y + cellSize },
    )
  }
  return pts
}

export class AoeTemplates {
  private app: Application
  private viewport: Viewport
  private overlay: Graphics

  // Direction in degrees (computed from mouse movement or default 0)
  private direction = 0
  private lastCursor: { x: number; y: number } | null = null

  private readonly onMouseMove: (e: MouseEvent) => void
  private readonly onMouseDown: (e: MouseEvent) => void

  constructor(app: Application, viewport: Viewport) {
    this.app = app
    this.viewport = viewport

    this.overlay = new Graphics()
    // Add to top-level stage so it renders above everything
    app.stage.addChild(this.overlay)

    this.onMouseMove = this.handleMouseMove.bind(this)
    this.onMouseDown = this.handleMouseDown.bind(this)

    const canvas = app.canvas as HTMLCanvasElement
    canvas.addEventListener('mousemove', this.onMouseMove)
    canvas.addEventListener('mousedown', this.onMouseDown)
  }

  private screenToWorld(e: MouseEvent): { x: number; y: number } {
    const canvas = this.app.canvas as HTMLCanvasElement
    const rect = canvas.getBoundingClientRect()
    return this.viewport.screenToWorld(e.clientX - rect.left, e.clientY - rect.top)
  }

  private handleMouseMove(e: MouseEvent): void {
    const tool = useToolStore.getState().activeTool
    if (!isAoeTool(tool)) {
      if (this.overlay.visible) {
        this.overlay.clear()
        this.overlay.visible = false
      }
      return
    }

    const world = this.screenToWorld(e)

    // Compute direction from last cursor position
    if (this.lastCursor) {
      const dx = world.x - this.lastCursor.x
      const dy = world.y - this.lastCursor.y
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
        this.direction = Math.atan2(dy, dx) * (180 / Math.PI)
      }
    }
    this.lastCursor = world

    this.overlay.visible = true
    this.renderOverlay(tool as DrawingType, world)
  }

  private handleMouseDown(e: MouseEvent): void {
    if (e.button !== 0 || e.altKey) return
    const tool = useToolStore.getState().activeTool
    if (!isAoeTool(tool)) return

    const world = this.screenToWorld(e)
    this.placeAoe(tool as DrawingType, world)
  }

  private getAffectedSquares(
    tool: DrawingType,
    worldX: number,
    worldY: number,
  ): Array<{ col: number; row: number }> {
    const cellSize = useMapStore.getState().currentMap?.grid_size_px ?? 70
    const { col, row } = pixelToGrid(worldX, worldY, cellSize)
    const defaults = AOE_DEFAULTS[tool] ?? {}

    switch (tool) {
      case 'aoe_sphere':
        return sphereAffectedSquares(col, row, defaults.radius ?? 3)
      case 'aoe_cube':
        return cubeAffectedSquares(col, row, defaults.size ?? 3)
      case 'aoe_cone':
        return coneAffectedSquares(col, row, defaults.length ?? 4, this.direction, defaults.angle ?? 90)
      case 'aoe_line':
        return lineAffectedSquares(col, row, defaults.length ?? 6, this.direction, defaults.width ?? 1)
      default:
        return []
    }
  }

  private renderOverlay(tool: DrawingType, world: { x: number; y: number }): void {
    this.overlay.clear()
    const cellSize = useMapStore.getState().currentMap?.grid_size_px ?? 70
    const squares = this.getAffectedSquares(tool, world.x, world.y)
    const scale = (this.viewport as unknown as { container: { scale: { x: number }; position: { x: number; y: number } } }).container.scale.x
    const vx = (this.viewport as unknown as { container: { scale: { x: number }; position: { x: number; y: number } } }).container.position.x
    const vy = (this.viewport as unknown as { container: { scale: { x: number }; position: { x: number; y: number } } }).container.position.y

    for (const sq of squares) {
      const p = gridToPixel(sq.col, sq.row, cellSize)
      const sx = p.x * scale + vx
      const sy = p.y * scale + vy
      const sw = cellSize * scale
      const sh = cellSize * scale
      this.overlay.rect(sx, sy, sw, sh)
      this.overlay.fill({ color: AOE_FILL_COLOR, alpha: AOE_FILL_ALPHA })
      this.overlay.stroke({ color: AOE_STROKE_COLOR, alpha: AOE_STROKE_ALPHA, width: AOE_STROKE_WIDTH })
    }
  }

  private placeAoe(tool: DrawingType, world: { x: number; y: number }): void {
    const layerId = useMapStore.getState().activeLayerId
    if (!layerId) return

    const cellSize = useMapStore.getState().currentMap?.grid_size_px ?? 70
    const squares = this.getAffectedSquares(tool, world.x, world.y)
    if (squares.length === 0) return

    const points = squaresToPoints(squares, cellSize)
    const drawSettings = useToolStore.getState().drawSettings

    const drawing: Drawing = {
      id: newDrawingId(),
      layer_id: layerId,
      drawing_type: tool,
      points: points as Drawing['points'],
      stroke_color: drawSettings.strokeColor,
      stroke_width: drawSettings.strokeWidth,
      stroke_opacity: drawSettings.strokeOpacity,
      fill_color: drawSettings.fillColor,
      fill_opacity: drawSettings.fillOpacity,
      created_at: new Date().toISOString(),
    }

    useDrawingStore.getState().addDrawing(drawing)
  }

  destroy(): void {
    const canvas = this.app.canvas as HTMLCanvasElement
    canvas.removeEventListener('mousemove', this.onMouseMove)
    canvas.removeEventListener('mousedown', this.onMouseDown)

    this.overlay.parent?.removeChild(this.overlay)
    this.overlay.destroy()
  }
}
