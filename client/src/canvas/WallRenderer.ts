import { Container, Graphics } from 'pixi.js'
import { useWallStore } from '../state/walls'
import { useMapStore } from '../state/map'
import type { Wall } from '../types/Wall'
import type { Viewport } from './Viewport'
import { getCellSize } from './utils'

// Colours
const COLOR_WALL = 0x4ecdc4
const COLOR_DOOR = 0xff9f43
const COLOR_SECRET = 0xa855f7
const COLOR_LOCK_INDICATOR = 0xff4444
const COLOR_SELECTED = 0xffdd44

const LINE_WIDTH = 3
const HANDLE_RADIUS = 5
const LOCK_RADIUS = 5

// Dash pattern for dashed lines (dash length, gap length)
const DASH_LEN = 10
const GAP_LEN = 6
const DOT_LEN = 3
const DOT_GAP = 4

function drawDashedLine(
  g: Graphics,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  dashLen: number,
  gapLen: number,
): void {
  const dx = x2 - x1
  const dy = y2 - y1
  const totalLen = Math.sqrt(dx * dx + dy * dy)
  if (totalLen === 0) return

  const ux = dx / totalLen
  const uy = dy / totalLen
  let pos = 0
  let drawing = true

  while (pos < totalLen) {
    const segLen = Math.min(drawing ? dashLen : gapLen, totalLen - pos)
    if (drawing) {
      const sx = x1 + ux * pos
      const sy = y1 + uy * pos
      const ex = x1 + ux * (pos + segLen)
      const ey = y1 + uy * (pos + segLen)
      g.moveTo(sx, sy)
      g.lineTo(ex, ey)
    }
    pos += segLen
    drawing = !drawing
  }
}

function drawWall(g: Graphics, wall: Wall, gridSize: number, selected: boolean): void {
  const x1 = wall.x1 * gridSize
  const y1 = wall.y1 * gridSize
  const x2 = wall.x2 * gridSize
  const y2 = wall.y2 * gridSize

  const strokeColor = selected ? COLOR_SELECTED : wall.wall_type === 'wall' ? COLOR_WALL : wall.wall_type === 'door' ? COLOR_DOOR : COLOR_SECRET
  const strokeAlpha = 1.0

  if (wall.wall_type === 'wall') {
    // Solid line
    g.moveTo(x1, y1)
    g.lineTo(x2, y2)
    g.stroke({ color: strokeColor, alpha: strokeAlpha, width: LINE_WIDTH })
  } else if (wall.wall_type === 'door') {
    if (wall.door_state === 'open') {
      // Dashed line for open door
      drawDashedLine(g, x1, y1, x2, y2, DASH_LEN, GAP_LEN)
      g.stroke({ color: strokeColor, alpha: strokeAlpha, width: LINE_WIDTH })
    } else {
      // Solid line for closed/locked door
      g.moveTo(x1, y1)
      g.lineTo(x2, y2)
      g.stroke({ color: strokeColor, alpha: strokeAlpha, width: LINE_WIDTH })

      if (wall.door_state === 'locked') {
        // Lock indicator: red circle at midpoint
        const mx = (x1 + x2) / 2
        const my = (y1 + y2) / 2
        g.circle(mx, my, LOCK_RADIUS)
        g.fill({ color: COLOR_LOCK_INDICATOR, alpha: 0.9 })
      }
    }
  } else if (wall.wall_type === 'secret_door') {
    // Dotted line for secret door
    drawDashedLine(g, x1, y1, x2, y2, DOT_LEN, DOT_GAP)
    g.stroke({ color: strokeColor, alpha: strokeAlpha, width: LINE_WIDTH })
  }

  // Selection handles: endpoint circles
  if (selected) {
    g.circle(x1, y1, HANDLE_RADIUS)
    g.fill({ color: COLOR_SELECTED, alpha: 0.9 })
    g.circle(x2, y2, HANDLE_RADIUS)
    g.fill({ color: COLOR_SELECTED, alpha: 0.9 })
  }
}

export class WallRenderer {
  private viewport: Viewport
  private container: Container
  private graphics: Graphics
  private visible_ = true

  private prevWalls: Wall[] = []
  private prevSelectedIds: string[] = []
  private prevGridSize = 0

  private unsubWalls: (() => void) | null = null
  private unsubMap: (() => void) | null = null

  constructor(viewport: Viewport) {
    this.viewport = viewport

    this.container = new Container()
    this.graphics = new Graphics()
    this.container.addChild(this.graphics)

    // Add on top of other viewport content
    this.viewport.container.addChild(this.container)

    this.unsubWalls = useWallStore.subscribe(() => {
      const { walls, selectedIds } = useWallStore.getState()
      if (walls !== this.prevWalls || selectedIds !== this.prevSelectedIds) {
        this.prevWalls = walls
        this.prevSelectedIds = selectedIds
        this.sync()
      }
    })

    this.unsubMap = useMapStore.subscribe(() => {
      const gridSize = getCellSize()
      if (gridSize !== this.prevGridSize) {
        this.prevGridSize = gridSize
        this.sync()
      }
    })

    this.sync()
  }

  /** Show or hide the DM wall overlay. */
  setVisible(v: boolean): void {
    this.visible_ = v
    this.container.visible = v
  }

  private sync(): void {
    if (!this.visible_) return

    const { walls, selectedIds } = useWallStore.getState()
    const gridSize = getCellSize()

    this.graphics.clear()

    for (const wall of walls) {
      const selected = selectedIds.includes(wall.id)
      drawWall(this.graphics, wall, gridSize, selected)
    }
  }

  destroy(): void {
    this.unsubWalls?.()
    this.unsubMap?.()
    this.container.parent?.removeChild(this.container)
    this.container.destroy({ children: true })
  }
}
