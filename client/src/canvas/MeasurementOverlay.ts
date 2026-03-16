import { Container, Graphics, Text } from 'pixi.js'
import type { Application } from 'pixi.js'
import { useToolStore } from '../state/tools'
import { useMapStore } from '../state/map'
import {
  gridDistance,
  waypointDistance,
  snapToCenter,
  pixelToGrid,
} from './math/grid'
import type { Viewport } from './Viewport'
import { getCellSize } from './utils'

const LINE_COLOR = 0x00d4ff
const LINE_ALPHA = 0.9
const LINE_WIDTH = 2
const WAYPOINT_COLOR = 0xffcc00
const WAYPOINT_RADIUS = 5
const TEXT_STYLE = {
  fontSize: 14,
  fill: 0xffffff,
  stroke: { color: 0x000000, width: 3 },
  fontFamily: 'monospace',
}

export class MeasurementOverlay {
  private app: Application
  private viewport: Viewport
  private container: Container
  private graphics: Graphics
  private labels: Text[] = []
  private isActive = false
  private startWorld: { x: number; y: number } | null = null
  private waypoints: { x: number; y: number }[] = []
  private cursorWorld: { x: number; y: number } | null = null
  private unsubTool: (() => void) | null = null

  private readonly onMouseDown: (e: MouseEvent) => void
  private readonly onMouseMove: (e: MouseEvent) => void
  private readonly onContextMenu: (e: MouseEvent) => void
  private readonly onKeyDown: (e: KeyboardEvent) => void

  constructor(app: Application, viewport: Viewport) {
    this.app = app
    this.viewport = viewport

    this.container = new Container()
    this.graphics = new Graphics()
    this.container.addChild(this.graphics)

    // Add to app.stage (not viewport) so it's always on top
    app.stage.addChild(this.container)

    this.onMouseDown = this.handleMouseDown.bind(this)
    this.onMouseMove = this.handleMouseMove.bind(this)
    this.onContextMenu = this.handleContextMenu.bind(this)
    this.onKeyDown = this.handleKeyDown.bind(this)

    const canvas = app.canvas as HTMLCanvasElement
    canvas.addEventListener('mousedown', this.onMouseDown)
    canvas.addEventListener('mousemove', this.onMouseMove)
    canvas.addEventListener('contextmenu', this.onContextMenu)
    window.addEventListener('keydown', this.onKeyDown)

    // Subscribe to tool store changes
    this.unsubTool = useToolStore.subscribe((state) => {
      const tool = state.activeTool
      if (tool !== 'ruler' && tool !== 'waypoint') {
        this.clearOverlay()
        this.isActive = false
      }
    })
  }

  private worldToScreen(wx: number, wy: number): { x: number; y: number } {
    return this.viewport.worldToScreen(wx, wy)
  }

  private snapWorld(
    world: { x: number; y: number },
    altKey: boolean,
  ): { x: number; y: number } {
    if (altKey) return world
    const cellSize = getCellSize()
    return snapToCenter(world.x, world.y, cellSize)
  }

  private handleMouseDown(e: MouseEvent): void {
    if (e.button !== 0) return
    const tool = useToolStore.getState().activeTool

    if (tool === 'ruler') {
      if (!this.isActive) {
        // Start ruler
        const world = this.viewport.screenToWorldFromEvent(e)
        const snapped = this.snapWorld(world, e.altKey)
        this.startWorld = snapped
        this.isActive = true
      } else {
        // End ruler on second click
        this.clearOverlay()
        this.isActive = false
        this.startWorld = null
      }
      return
    }

    if (tool === 'waypoint') {
      const world = this.viewport.screenToWorldFromEvent(e)
      const snapped = this.snapWorld(world, e.altKey)
      this.waypoints.push(snapped)
      this.isActive = true
      this.redraw()
    }
  }

  private handleMouseMove(e: MouseEvent): void {
    const tool = useToolStore.getState().activeTool
    if (tool !== 'ruler' && tool !== 'waypoint') return

    const world = this.viewport.screenToWorldFromEvent(e)
    const snapped = this.snapWorld(world, e.altKey)
    this.cursorWorld = snapped

    if (tool === 'ruler' && this.isActive && this.startWorld) {
      this.redraw()
    } else if (tool === 'waypoint' && this.isActive && this.waypoints.length > 0) {
      this.redraw()
    }
  }

  private handleContextMenu(e: MouseEvent): void {
    const tool = useToolStore.getState().activeTool
    if (tool === 'waypoint' && this.isActive) {
      e.preventDefault()
      this.clearOverlay()
      this.isActive = false
      this.waypoints = []
    }
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      const tool = useToolStore.getState().activeTool
      if (tool === 'ruler' || tool === 'waypoint') {
        this.clearOverlay()
        this.isActive = false
        this.startWorld = null
        this.waypoints = []
      }
    }
  }

  private clearLabels(): void {
    for (const label of this.labels) {
      label.parent?.removeChild(label)
      label.destroy()
    }
    this.labels = []
  }

  private addLabel(text: string, sx: number, sy: number): void {
    const label = new Text({ text, style: TEXT_STYLE })
    label.position.set(sx + 6, sy - 10)
    this.container.addChild(label)
    this.labels.push(label)
  }

  private formatDist(dist: number): string {
    return `${Math.round(dist * 10) / 10} ft`
  }

  private redraw(): void {
    this.graphics.clear()
    this.clearLabels()

    const tool = useToolStore.getState().activeTool

    if (tool === 'ruler') {
      this.drawRuler()
    } else if (tool === 'waypoint') {
      this.drawWaypoint()
    }
  }

  private drawRuler(): void {
    if (!this.startWorld || !this.cursorWorld) return

    const cellSize = getCellSize()
    const gridScale = useMapStore.getState().currentMap?.grid_scale ?? 5
    const diagMode = useMapStore.getState().currentMap?.diagonal_mode ?? 'dnd_standard'

    const start = this.worldToScreen(this.startWorld.x, this.startWorld.y)
    const end = this.worldToScreen(this.cursorWorld.x, this.cursorWorld.y)

    // Draw line
    this.graphics
      .moveTo(start.x, start.y)
      .lineTo(end.x, end.y)
      .stroke({ color: LINE_COLOR, alpha: LINE_ALPHA, width: LINE_WIDTH })

    // Draw start dot
    this.graphics
      .circle(start.x, start.y, 4)
      .fill({ color: LINE_COLOR, alpha: LINE_ALPHA })

    // Draw end dot
    this.graphics
      .circle(end.x, end.y, 4)
      .fill({ color: LINE_COLOR, alpha: LINE_ALPHA })

    // Compute distance
    const g1 = pixelToGrid(this.startWorld.x, this.startWorld.y, cellSize)
    const g2 = pixelToGrid(this.cursorWorld.x, this.cursorWorld.y, cellSize)
    const dist = gridDistance(g1.col, g1.row, g2.col, g2.row, gridScale, diagMode)

    this.addLabel(this.formatDist(dist), end.x, end.y)
  }

  private drawWaypoint(): void {
    if (this.waypoints.length === 0) return

    const cellSize = getCellSize()
    const gridScale = useMapStore.getState().currentMap?.grid_scale ?? 5
    const diagMode = useMapStore.getState().currentMap?.diagonal_mode ?? 'dnd_standard'

    // Build all points including cursor position
    const allPoints = [...this.waypoints]
    if (this.cursorWorld) {
      allPoints.push(this.cursorWorld)
    }

    if (allPoints.length < 2) {
      // Just draw the single waypoint dot
      const s = this.worldToScreen(allPoints[0].x, allPoints[0].y)
      this.graphics
        .circle(s.x, s.y, WAYPOINT_RADIUS)
        .fill({ color: WAYPOINT_COLOR, alpha: LINE_ALPHA })
      return
    }

    // Convert to grid points for distance computation
    const gridPoints = allPoints.map((p) => pixelToGrid(p.x, p.y, cellSize))
    const { segments, total } = waypointDistance(gridPoints, gridScale, diagMode)

    // Draw line segments
    for (let i = 0; i < allPoints.length - 1; i++) {
      const s = this.worldToScreen(allPoints[i].x, allPoints[i].y)
      const e = this.worldToScreen(allPoints[i + 1].x, allPoints[i + 1].y)

      this.graphics
        .moveTo(s.x, s.y)
        .lineTo(e.x, e.y)
        .stroke({ color: LINE_COLOR, alpha: LINE_ALPHA, width: LINE_WIDTH })

      // Segment distance label at midpoint
      const mx = (s.x + e.x) / 2
      const my = (s.y + e.y) / 2
      this.addLabel(this.formatDist(segments[i] ?? 0), mx, my)
    }

    // Draw waypoint dots for committed waypoints
    for (let i = 0; i < this.waypoints.length; i++) {
      const s = this.worldToScreen(this.waypoints[i].x, this.waypoints[i].y)
      this.graphics
        .circle(s.x, s.y, WAYPOINT_RADIUS)
        .fill({ color: WAYPOINT_COLOR, alpha: LINE_ALPHA })
    }

    // Draw cursor end dot
    if (this.cursorWorld) {
      const e = this.worldToScreen(this.cursorWorld.x, this.cursorWorld.y)
      this.graphics
        .circle(e.x, e.y, 4)
        .fill({ color: LINE_COLOR, alpha: LINE_ALPHA })

      // Running total at cursor
      this.addLabel(`Total: ${this.formatDist(total)}`, e.x, e.y + 14)
    }
  }

  private clearOverlay(): void {
    this.graphics.clear()
    this.clearLabels()
    this.cursorWorld = null
    this.startWorld = null
  }

  destroy(): void {
    this.unsubTool?.()
    this.unsubTool = null

    const canvas = this.app.canvas as HTMLCanvasElement
    canvas.removeEventListener('mousedown', this.onMouseDown)
    canvas.removeEventListener('mousemove', this.onMouseMove)
    canvas.removeEventListener('contextmenu', this.onContextMenu)
    window.removeEventListener('keydown', this.onKeyDown)

    this.clearLabels()
    this.container.parent?.removeChild(this.container)
    this.container.destroy({ children: true })
  }
}
