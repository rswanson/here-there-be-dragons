import { Container, Graphics } from 'pixi.js'
import { useTokenStore } from '../state/tokens'
import { useMapStore } from '../state/map'
import type { Token } from '../types/Token'
import type { Viewport } from './Viewport'
import { getCellSize } from './utils'

// Bright radius indicator: yellow, 40% alpha
const COLOR_BRIGHT = 0xffee44
const ALPHA_BRIGHT = 0.4

// Dim radius indicator: gray-blue, 30% alpha
const COLOR_DIM = 0x7799bb
const ALPHA_DIM = 0.3

const LINE_WIDTH = 2

// Dashed circle parameters
const DASH_ANGLE = 0.18  // radians per dash segment
const GAP_ANGLE = 0.08   // radians per gap segment
const CIRCLE_STEPS = 128 // resolution for circle approximation

/**
 * Draw a dashed circle using short line segments around the circumference.
 */
function drawDashedCircle(
  g: Graphics,
  cx: number,
  cy: number,
  radius: number,
  color: number,
  alpha: number,
): void {
  if (radius <= 0) return

  const arcPerStep = (2 * Math.PI) / CIRCLE_STEPS
  // Convert dash/gap angles to steps
  const dashSteps = Math.max(1, Math.round(DASH_ANGLE / arcPerStep))
  const gapSteps = Math.max(1, Math.round(GAP_ANGLE / arcPerStep))

  let step = 0
  let drawing = true
  let segStart = 0

  while (step < CIRCLE_STEPS) {
    const segLen = drawing ? dashSteps : gapSteps
    const segEnd = Math.min(step + segLen, CIRCLE_STEPS)

    if (drawing) {
      const startAngle = (segStart / CIRCLE_STEPS) * 2 * Math.PI

      g.moveTo(cx + Math.cos(startAngle) * radius, cy + Math.sin(startAngle) * radius)
      for (let s = segStart + 1; s <= segEnd; s++) {
        const a = (s / CIRCLE_STEPS) * 2 * Math.PI
        g.lineTo(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius)
      }
      g.stroke({ color, alpha, width: LINE_WIDTH })
    }

    step = segEnd
    segStart = segEnd
    drawing = !drawing
  }

}

export class LightRenderer {
  private viewport: Viewport
  private container: Container
  private graphics: Graphics
  private visible_ = true

  private prevTokens: Token[] = []
  private prevGridSize = 0

  private unsubTokens: (() => void) | null = null
  private unsubMap: (() => void) | null = null

  constructor(viewport: Viewport) {
    this.viewport = viewport

    this.container = new Container()
    this.graphics = new Graphics()
    this.container.addChild(this.graphics)

    this.viewport.container.addChild(this.container)

    this.unsubTokens = useTokenStore.subscribe(() => {
      const { tokens } = useTokenStore.getState()
      if (tokens !== this.prevTokens) {
        this.prevTokens = tokens
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

  /** Show or hide the DM light radius indicators. */
  setVisible(v: boolean): void {
    this.visible_ = v
    this.container.visible = v
  }

  private sync(): void {
    if (!this.visible_) return

    const tokens = useTokenStore.getState().tokens
    const gridSize = getCellSize()

    this.graphics.clear()

    for (const token of tokens) {
      const hasBright = token.light_bright > 0
      const hasDim = token.light_dim > 0

      if (!hasBright && !hasDim) continue

      // Token center in pixel coords
      const cx = (token.x + token.size / 2) * gridSize
      const cy = (token.y + token.size / 2) * gridSize

      if (hasBright) {
        const brightPx = token.light_bright * gridSize
        drawDashedCircle(this.graphics, cx, cy, brightPx, COLOR_BRIGHT, ALPHA_BRIGHT)
      }

      if (hasBright || hasDim) {
        const dimPx = (token.light_bright + token.light_dim) * gridSize
        drawDashedCircle(this.graphics, cx, cy, dimPx, COLOR_DIM, ALPHA_DIM)
      }
    }
  }

  destroy(): void {
    this.unsubTokens?.()
    this.unsubMap?.()
    this.container.parent?.removeChild(this.container)
    this.container.destroy({ children: true })
  }
}
