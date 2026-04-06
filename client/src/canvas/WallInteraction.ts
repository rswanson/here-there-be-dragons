import type { Application } from 'pixi.js'
import { Graphics } from 'pixi.js'
import type { ToolName } from '../state/tools'
import { useToolStore } from '../state/tools'
import { useWallStore } from '../state/walls'
import { useMapStore } from '../state/map'
import { useFogStore } from '../state/fog'
import { useVisionStore } from '../state/vision'
import { usePresenceStore } from '../state/presence'
import { wsClient } from '../api/ws'
import type { Viewport } from './Viewport'
import { getCellSize } from './utils'
import type { Wall } from '../types/Wall'
import type { CreateWallRequest } from '../types/CreateWallRequest'

type Point = { x: number; y: number }

const FOG_TOOLS = new Set<ToolName>(['fog_reveal', 'fog_hide'])

/** Distance from a point to a line segment */
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

/** Snap world coords to nearest grid intersection (returns grid coords) */
function snapToGridIntersection(worldX: number, worldY: number, gridSize: number): Point {
  return {
    x: Math.round(worldX / gridSize),
    y: Math.round(worldY / gridSize),
  }
}

export class WallInteraction {
  private app: Application
  private viewport: Viewport
  private preview: Graphics | null = null

  // Polyline state
  private polyVertices: Point[] = []

  // Rectangle state
  private rectStart: Point | null = null

  // Fog painting state
  private isFogPainting = false
  private fogPaintedCells = new Set<string>()

  // Bound handlers
  private readonly onMouseDown: (e: MouseEvent) => void
  private readonly onMouseMove: (e: MouseEvent) => void
  private readonly onMouseUp: (e: MouseEvent) => void
  private readonly onDblClick: (e: MouseEvent) => void
  private readonly onKeyDown: (e: KeyboardEvent) => void

  constructor(app: Application, viewport: Viewport) {
    this.app = app
    this.viewport = viewport

    this.onMouseDown = this.handleMouseDown.bind(this)
    this.onMouseMove = this.handleMouseMove.bind(this)
    this.onMouseUp = this.handleMouseUp.bind(this)
    this.onDblClick = this.handleDblClick.bind(this)
    this.onKeyDown = this.handleKeyDown.bind(this)

    const canvas = app.canvas as HTMLCanvasElement
    canvas.addEventListener('mousedown', this.onMouseDown)
    canvas.addEventListener('mousemove', this.onMouseMove)
    canvas.addEventListener('mouseup', this.onMouseUp)
    canvas.addEventListener('dblclick', this.onDblClick)
    window.addEventListener('keydown', this.onKeyDown)
  }

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

  private worldToGrid(worldX: number, worldY: number): Point {
    const gridSize = getCellSize()
    return snapToGridIntersection(worldX, worldY, gridSize)
  }

  private gridToScreen(gx: number, gy: number): Point {
    const gridSize = getCellSize()
    return this.viewport.worldToScreen(gx * gridSize, gy * gridSize)
  }

  private getMapId(): string | null {
    return useMapStore.getState().currentMap?.id ?? null
  }

  private createWallRequests(segments: Array<{ x1: number; y1: number; x2: number; y2: number }>): void {
    const mapId = this.getMapId()
    if (!mapId) return

    const wallType = useToolStore.getState().wallPlacementType
    const doorState = wallType === 'door' ? 'closed' : 'closed'

    const walls: CreateWallRequest[] = segments.map((seg) => ({
      x1: seg.x1,
      y1: seg.y1,
      x2: seg.x2,
      y2: seg.y2,
      wall_type: wallType,
      door_state: doorState,
    }))

    wsClient.send({ type: 'CreateWalls', payload: { map_id: mapId, walls } })

    // Mark vision as dirty so polygons get recomputed
    useVisionStore.getState().setDirty()
  }

  // ---- Event Handlers ----

  private handleMouseDown(e: MouseEvent): void {
    if (e.button !== 0 || e.altKey) return
    const tool = this.getActiveTool()
    const world = this.viewport.screenToWorldFromEvent(e)

    if (tool === 'wall_polyline') {
      const grid = this.worldToGrid(world.x, world.y)
      this.polyVertices.push(grid)
      return
    }

    if (tool === 'wall_rect') {
      const grid = this.worldToGrid(world.x, world.y)
      this.rectStart = grid
      return
    }

    if (FOG_TOOLS.has(tool)) {
      this.isFogPainting = true
      this.fogPaintedCells.clear()
      this.paintFogAt(world)
      return
    }

    // Wall selection: when select tool is active
    if (tool === 'select') {
      this.trySelectWall(world)
    }
  }

  private handleMouseMove(e: MouseEvent): void {
    const tool = this.getActiveTool()
    const world = this.viewport.screenToWorldFromEvent(e)

    if (tool === 'wall_polyline' && this.polyVertices.length > 0) {
      this.renderPolylinePreview(world)
      return
    }

    if (tool === 'wall_rect' && this.rectStart) {
      this.renderRectPreview(world)
      return
    }

    if (FOG_TOOLS.has(tool) && this.isFogPainting) {
      this.paintFogAt(world)
    }
  }

  private handleMouseUp(e: MouseEvent): void {
    if (e.button !== 0) return
    const tool = this.getActiveTool()

    if (tool === 'wall_rect' && this.rectStart) {
      const world = this.viewport.screenToWorldFromEvent(e)
      const grid = this.worldToGrid(world.x, world.y)
      this.finishRect(grid)
      return
    }

    if (FOG_TOOLS.has(tool) && this.isFogPainting) {
      this.isFogPainting = false
      this.fogPaintedCells.clear()
    }
  }

  private handleDblClick(e: MouseEvent): void {
    const tool = this.getActiveTool()

    if (tool === 'wall_polyline' && this.polyVertices.length >= 2) {
      e.preventDefault()
      this.finishPolyline()
      return
    }

    // Door toggle on double-click
    if (tool === 'select') {
      const world = this.viewport.screenToWorldFromEvent(e)
      this.tryToggleDoor(world)
    }
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
    const tool = this.getActiveTool()

    if (tool === 'wall_polyline') {
      if (e.key === 'Enter' && this.polyVertices.length >= 2) {
        this.finishPolyline()
      } else if (e.key === 'Escape') {
        this.polyVertices = []
        this.clearPreview()
      }
    }

    if (tool === 'wall_rect' && e.key === 'Escape') {
      this.rectStart = null
      this.clearPreview()
    }

    // Delete selected walls
    if (e.key === 'Delete' || e.key === 'Backspace') {
      const { selectedIds } = useWallStore.getState()
      if (selectedIds.length > 0) {
        wsClient.send({ type: 'DeleteWalls', payload: { wall_ids: selectedIds } })
        useWallStore.getState().deselectAll()
        useVisionStore.getState().setDirty()
      }
    }

    // Cycle vision mode: dm → player1 → player2 → ... → dm
    if (e.key === 'v' || e.key === 'V') {
      const { visionMode, previewPlayerId } = useFogStore.getState()
      const { connectedUsers } = usePresenceStore.getState()
      const players = connectedUsers.filter((u) => u.role !== 'dm')

      if (visionMode === 'dm') {
        // Switch to first player if any, otherwise stay dm
        if (players.length > 0) {
          useFogStore.getState().setVisionMode('player', players[0].user_id)
        }
      } else {
        // Find the index of the current preview player and advance
        const currentIndex = players.findIndex((u) => u.user_id === previewPlayerId)
        const nextIndex = currentIndex + 1
        if (nextIndex < players.length) {
          useFogStore.getState().setVisionMode('player', players[nextIndex].user_id)
        } else {
          // Wrapped past all players — return to dm mode
          useFogStore.getState().setVisionMode('dm')
        }
      }
    }
  }

  // ---- Polyline ----

  private finishPolyline(): void {
    if (this.polyVertices.length < 2) return
    const segments: Array<{ x1: number; y1: number; x2: number; y2: number }> = []
    for (let i = 0; i < this.polyVertices.length - 1; i++) {
      segments.push({
        x1: this.polyVertices[i].x,
        y1: this.polyVertices[i].y,
        x2: this.polyVertices[i + 1].x,
        y2: this.polyVertices[i + 1].y,
      })
    }
    this.createWallRequests(segments)
    this.polyVertices = []
    this.clearPreview()
  }

  // ---- Rectangle ----

  private finishRect(end: Point): void {
    if (!this.rectStart) return
    const s = this.rectStart
    // Create 4 wall segments for the rectangle
    const segments = [
      { x1: s.x, y1: s.y, x2: end.x, y2: s.y },   // top
      { x1: end.x, y1: s.y, x2: end.x, y2: end.y }, // right
      { x1: end.x, y1: end.y, x2: s.x, y2: end.y }, // bottom
      { x1: s.x, y1: end.y, x2: s.x, y2: s.y },     // left
    ]
    this.createWallRequests(segments)
    this.rectStart = null
    this.clearPreview()
  }

  // ---- Wall Selection ----

  private trySelectWall(world: Point): void {
    const walls = useWallStore.getState().walls
    const gridSize = getCellSize()
    const threshold = 5 / (this.viewport.container.scale.x || 1) // 5px screen space

    let closestWall: Wall | null = null
    let closestDist = Infinity

    for (const wall of walls) {
      const dist = distToSegment(
        world.x, world.y,
        wall.x1 * gridSize, wall.y1 * gridSize,
        wall.x2 * gridSize, wall.y2 * gridSize,
      )
      if (dist < closestDist) {
        closestDist = dist
        closestWall = wall
      }
    }

    if (closestWall && closestDist <= threshold) {
      useWallStore.getState().selectWall(closestWall.id)
    } else {
      useWallStore.getState().deselectAll()
    }
  }

  // ---- Door Toggle ----

  private tryToggleDoor(world: Point): void {
    const walls = useWallStore.getState().walls
    const gridSize = getCellSize()
    const threshold = 5 / (this.viewport.container.scale.x || 1)

    for (const wall of walls) {
      if (wall.wall_type !== 'door') continue
      const dist = distToSegment(
        world.x, world.y,
        wall.x1 * gridSize, wall.y1 * gridSize,
        wall.x2 * gridSize, wall.y2 * gridSize,
      )
      if (dist <= threshold) {
        wsClient.send({ type: 'ToggleDoor', payload: { wall_id: wall.id } })
        useVisionStore.getState().setDirty()
        break
      }
    }
  }

  // ---- Fog Painting ----

  private paintFogAt(world: Point): void {
    const gridSize = getCellSize()
    const mapId = this.getMapId()
    if (!mapId) return

    const tool = this.getActiveTool()
    const brushSize = useToolStore.getState().fogBrushSize
    const revealed = tool === 'fog_reveal'

    // Convert to grid cell
    const cx = Math.floor(world.x / gridSize)
    const cy = Math.floor(world.y / gridSize)

    const half = Math.floor(brushSize / 2)
    const cells: Array<{ x: number; y: number }> = []

    for (let dx = -half; dx <= half; dx++) {
      for (let dy = -half; dy <= half; dy++) {
        const key = `${cx + dx},${cy + dy}`
        if (!this.fogPaintedCells.has(key)) {
          this.fogPaintedCells.add(key)
          cells.push({ x: cx + dx, y: cy + dy })
        }
      }
    }

    if (cells.length > 0) {
      wsClient.send({ type: 'RevealFog', payload: { map_id: mapId, cells, revealed } })

      // Update local fog store immediately for responsiveness
      if (revealed) {
        useFogStore.getState().revealCells(cells)
      } else {
        useFogStore.getState().hideCells(cells)
      }
    }
  }

  // ---- Preview Rendering ----

  private renderPolylinePreview(cursor: Point): void {
    const g = this.getOrCreatePreview()
    g.clear()
    if (this.polyVertices.length === 0) return

    const cursorGrid = this.worldToGrid(cursor.x, cursor.y)
    const allPts = [...this.polyVertices, cursorGrid]

    // Draw existing vertices and segments
    for (let i = 0; i < allPts.length; i++) {
      const screen = this.gridToScreen(allPts[i].x, allPts[i].y)
      if (i === 0) {
        g.moveTo(screen.x, screen.y)
      } else {
        g.lineTo(screen.x, screen.y)
      }
    }
    g.stroke({ color: 0x4ecdc4, alpha: 0.8, width: 2 })

    // Draw vertex dots
    for (const pt of this.polyVertices) {
      const screen = this.gridToScreen(pt.x, pt.y)
      g.circle(screen.x, screen.y, 4)
      g.fill({ color: 0x4ecdc4, alpha: 0.9 })
    }

    // Draw cursor dot
    const cursorScreen = this.gridToScreen(cursorGrid.x, cursorGrid.y)
    g.circle(cursorScreen.x, cursorScreen.y, 4)
    g.fill({ color: 0x4ecdc4, alpha: 0.5 })
  }

  private renderRectPreview(cursor: Point): void {
    if (!this.rectStart) return
    const g = this.getOrCreatePreview()
    g.clear()

    const cursorGrid = this.worldToGrid(cursor.x, cursor.y)
    const s = this.gridToScreen(this.rectStart.x, this.rectStart.y)
    const e = this.gridToScreen(cursorGrid.x, cursorGrid.y)

    const x = Math.min(s.x, e.x)
    const y = Math.min(s.y, e.y)
    const w = Math.abs(e.x - s.x)
    const h = Math.abs(e.y - s.y)

    g.rect(x, y, w, h)
    g.stroke({ color: 0x4ecdc4, alpha: 0.8, width: 2 })

    // Corner dots
    const corners = [
      this.gridToScreen(this.rectStart.x, this.rectStart.y),
      this.gridToScreen(cursorGrid.x, this.rectStart.y),
      this.gridToScreen(cursorGrid.x, cursorGrid.y),
      this.gridToScreen(this.rectStart.x, cursorGrid.y),
    ]
    for (const c of corners) {
      g.circle(c.x, c.y, 4)
      g.fill({ color: 0x4ecdc4, alpha: 0.9 })
    }
  }

  // ---- Lifecycle ----

  destroy(): void {
    const canvas = this.app.canvas as HTMLCanvasElement
    canvas.removeEventListener('mousedown', this.onMouseDown)
    canvas.removeEventListener('mousemove', this.onMouseMove)
    canvas.removeEventListener('mouseup', this.onMouseUp)
    canvas.removeEventListener('dblclick', this.onDblClick)
    window.removeEventListener('keydown', this.onKeyDown)

    if (this.preview) {
      this.preview.parent?.removeChild(this.preview)
      this.preview.destroy()
      this.preview = null
    }

    this.polyVertices = []
    this.rectStart = null
  }
}
