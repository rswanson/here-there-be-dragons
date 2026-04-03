import { Container, Graphics } from 'pixi.js'
import { useVisionStore } from '../state/vision'
import { useFogStore } from '../state/fog'
import { useMapStore } from '../state/map'
import type { Point } from './math/raycasting'
import type { Viewport } from './Viewport'
import { getCellSize } from './utils'

const FOG_COLOR = 0x000000
const FOG_ALPHA_UNEXPLORED = 0.95
const FOG_ALPHA_EXPLORED = 0.5

/**
 * FogRenderer draws the fog of war overlay on the viewport.
 *
 * Architecture (three layers, bottom to top):
 *   1. exploredLayer — 50% alpha black rects for explored-but-not-visible cells
 *   2. fogLayer      — 95% alpha black rect for unexplored areas; masked by
 *                      the union of all visibility polygons so visible areas
 *                      show through at full clarity
 *   3. The mask on fogLayer is a Graphics that fills visible polygons white
 *      (PixiJS mask: white = show the masked object, black = hide it)
 *      — but since we want to HIDE fog where visible, we invert: we fill
 *      the whole map white and then subtract (erase) visible areas.
 *      PixiJS doesn't support inverted masks natively, so instead we use
 *      a direct draw approach: redraw the fogLayer with holes.
 *
 * Simplified drawing strategy (single Graphics per frame):
 *   - Draw full-map black rect at FOG_ALPHA_UNEXPLORED into fogGraphics.
 *   - For explored cells, draw cells at FOG_ALPHA_EXPLORED (overwrites
 *     the full-opacity unexplored fog with lighter fog).
 *   - Clip visible areas: PixiJS Graphics supports `fill` with alpha=0 after
 *     an initial fill, but blending makes this tricky. Instead, we use
 *     two separate Graphics objects and an additive mask technique.
 *
 * Practical implementation:
 *   - unexploredGraphics: full-map black rect, alpha=0.95, with PixiJS mask
 *     applied so visible polygons punch holes in the fog.
 *   - exploredGraphics: explored cell rects, alpha=0.5, with the same mask
 *     so explored-but-visible cells don't double the fog effect.
 *   - The mask is a Graphics object that fills visible polygons in white
 *     (white = transparent area / hole in the fog). We INVERT this by
 *     filling the full map white first, then overpainting visible areas black.
 *     Effect: mask is white everywhere except where visible = fog is visible
 *     everywhere except where visibility polygon covers = fog disappears in
 *     the visible areas.
 */
export class FogRenderer {
  private viewport: Viewport
  private container: Container
  private unexploredGraphics: Graphics
  private exploredGraphics: Graphics
  private maskGraphics: Graphics
  private enabled_ = true

  private prevPolygons: Record<string, Point[]> = {}
  private prevRevealedCells: Set<string> = new Set()
  private prevExploredCells: Set<string> = new Set()
  private prevVisionMode = ''
  private prevGridSize = 0
  private prevMapId: string | null = null

  private unsubVision: (() => void) | null = null
  private unsubFog: (() => void) | null = null
  private unsubMap: (() => void) | null = null

  constructor(viewport: Viewport) {
    this.viewport = viewport

    this.container = new Container()

    // Bottom layer: explored cell overlay (lighter fog for explored areas)
    this.exploredGraphics = new Graphics()
    this.container.addChild(this.exploredGraphics)

    // Top layer: full unexplored fog with visibility-polygon mask
    this.unexploredGraphics = new Graphics()
    this.container.addChild(this.unexploredGraphics)

    // Mask for the unexplored fog: filled where fog should be visible,
    // empty (black) where visibility polygon punches through
    this.maskGraphics = new Graphics()
    this.unexploredGraphics.mask = this.maskGraphics
    // The mask needs to be in the scene graph for PixiJS to use it
    this.container.addChild(this.maskGraphics)

    this.viewport.container.addChild(this.container)

    this.unsubVision = useVisionStore.subscribe(() => {
      const { polygons } = useVisionStore.getState()
      if (polygons !== this.prevPolygons) {
        this.prevPolygons = polygons
        this.sync()
      }
    })

    this.unsubFog = useFogStore.subscribe(() => {
      const { revealedCells, exploredCells, visionMode } = useFogStore.getState()
      if (
        revealedCells !== this.prevRevealedCells ||
        exploredCells !== this.prevExploredCells ||
        visionMode !== this.prevVisionMode
      ) {
        this.prevRevealedCells = revealedCells
        this.prevExploredCells = exploredCells
        this.prevVisionMode = visionMode
        this.sync()
      }
    })

    this.unsubMap = useMapStore.subscribe(() => {
      const gridSize = getCellSize()
      const mapId = useMapStore.getState().currentMap?.id ?? null
      if (gridSize !== this.prevGridSize || mapId !== this.prevMapId) {
        this.prevGridSize = gridSize
        this.prevMapId = mapId
        this.sync()
      }
    })

    this.sync()
  }

  /** Enable or disable the fog overlay (DM sees map fully, players see fog). */
  setEnabled(enabled: boolean): void {
    this.enabled_ = enabled
    this.container.visible = enabled
  }

  private sync(): void {
    if (!this.enabled_) return

    const map = useMapStore.getState().currentMap
    if (!map) {
      this.unexploredGraphics.clear()
      this.exploredGraphics.clear()
      this.maskGraphics.clear()
      return
    }

    const gridSize = getCellSize()
    const mapWidthPx = (map.width_squares ?? 0) * gridSize
    const mapHeightPx = (map.height_squares ?? 0) * gridSize

    const { polygons } = useVisionStore.getState()
    const { exploredCells } = useFogStore.getState()

    // --- Explored layer (lighter fog for explored-but-not-visible cells) ---
    this.exploredGraphics.clear()
    for (const key of exploredCells) {
      const [xStr, yStr] = key.split(',')
      const cx = Number(xStr)
      const cy = Number(yStr)
      if (!Number.isFinite(cx) || !Number.isFinite(cy)) continue
      this.exploredGraphics.rect(cx * gridSize, cy * gridSize, gridSize, gridSize)
      this.exploredGraphics.fill({ color: FOG_COLOR, alpha: FOG_ALPHA_EXPLORED })
    }

    // --- Full fog layer ---
    this.unexploredGraphics.clear()
    if (mapWidthPx > 0 && mapHeightPx > 0) {
      this.unexploredGraphics.rect(0, 0, mapWidthPx, mapHeightPx)
      this.unexploredGraphics.fill({ color: FOG_COLOR, alpha: FOG_ALPHA_UNEXPLORED })
    } else {
      // Fallback: very large rect when map dimensions unknown
      this.unexploredGraphics.rect(-4000, -4000, 12000, 12000)
      this.unexploredGraphics.fill({ color: FOG_COLOR, alpha: FOG_ALPHA_UNEXPLORED })
    }

    // --- Mask: white = show fog, black = hide fog (punch through) ---
    // Strategy: fill whole map white, then draw visibility polygons black.
    // Where black, mask hides the fog layer → visible area shows map.
    this.maskGraphics.clear()

    // Fill entire mask white (fog is visible everywhere by default)
    if (mapWidthPx > 0 && mapHeightPx > 0) {
      this.maskGraphics.rect(0, 0, mapWidthPx, mapHeightPx)
      this.maskGraphics.fill({ color: 0xffffff, alpha: 1 })
    } else {
      this.maskGraphics.rect(-4000, -4000, 12000, 12000)
      this.maskGraphics.fill({ color: 0xffffff, alpha: 1 })
    }

    // For each token's visibility polygon, draw black to punch through
    for (const polygon of Object.values(polygons)) {
      if (polygon.length < 3) continue
      const flat = polygon.flatMap((p) => [p.x * gridSize, p.y * gridSize])
      this.maskGraphics.poly(flat, true)
      this.maskGraphics.fill({ color: 0x000000, alpha: 1 })
    }
  }

  destroy(): void {
    this.unsubVision?.()
    this.unsubFog?.()
    this.unsubMap?.()
    // Remove mask reference before destroying
    this.unexploredGraphics.mask = null
    this.container.parent?.removeChild(this.container)
    this.container.destroy({ children: true })
  }
}
