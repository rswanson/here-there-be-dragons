import { Container, Graphics, Sprite, Text, TextStyle, type Texture } from 'pixi.js'
import { useTokenStore } from '../state/tokens'
import { useMapStore } from '../state/map'
import { gridToPixel } from './math/grid'
import type { LayerManager } from './LayerManager'
import type { TextureManager } from './TextureManager'
import type { Token } from '../types/Token'
import { getCellSize } from './utils'
import type { TokenBar } from '../types/TokenBar'

// Deterministic colour from a string (used as placeholder circle colour).
function tokenColour(id: string): number {
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0
  }
  return 0x334455 | (hash & 0xaabbcc)
}

const SELECTION_COLOUR = 0xffdd44
const SELECTION_ALPHA = 0.9
const BAR_HEIGHT = 6
const BAR_GAP = 2

function drawToken(
  container: Container,
  token: Token,
  gridSize: number,
  selected: boolean,
  texture: Texture | null = null,
): void {
  container.removeChildren()

  const size = token.size * gridSize
  const radius = size / 2

  if (texture) {
    // ---- Asset image sprite (circular clip via mask) ----
    const sprite = new Sprite(texture)
    sprite.width = size
    sprite.height = size
    container.addChild(sprite)

    // Circular mask to clip the sprite into a token shape
    const mask = new Graphics()
    mask.circle(radius, radius, radius - 1)
    mask.fill({ color: 0xffffff })
    container.addChild(mask)
    sprite.mask = mask

    // ---- Selection ring ----
    if (selected) {
      const ring = new Graphics()
      ring.circle(radius, radius, radius - 1)
      ring.stroke({ color: SELECTION_COLOUR, alpha: SELECTION_ALPHA, width: 3 })
      container.addChild(ring)
    }
  } else {
    // ---- Fallback: Circle body ----
    const circle = new Graphics()
    const colour = tokenColour(token.id)
    circle.circle(radius, radius, radius - 1)
    circle.fill({ color: colour, alpha: 1 })

    // ---- Selection ring ----
    if (selected) {
      circle.circle(radius, radius, radius - 1)
      circle.stroke({ color: SELECTION_COLOUR, alpha: SELECTION_ALPHA, width: 3 })
    }

    container.addChild(circle)

    // ---- Initial label ----
    const initial = (token.name ?? '?').charAt(0).toUpperCase()
    const labelStyle = new TextStyle({
      fill: 0xffffff,
      fontSize: Math.max(12, Math.round(radius * 0.8)),
      fontWeight: 'bold',
      align: 'center',
    })
    const label = new Text({ text: initial, style: labelStyle })
    label.anchor.set(0.5, 0.5)
    label.position.set(radius, radius)
    container.addChild(label)
  }

  // ---- HP / resource bars ----
  if (token.bars && token.bars.length > 0) {
    const barY = size + BAR_GAP
    token.bars.forEach((bar: TokenBar, idx: number) => {
      if (bar.max <= 0) return
      const ratio = Math.max(0, Math.min(1, bar.current / bar.max))
      const barG = new Graphics()

      // Background track
      barG.rect(0, barY + idx * (BAR_HEIGHT + BAR_GAP), size, BAR_HEIGHT)
      barG.fill({ color: 0x222222, alpha: 0.7 })

      // Fill
      if (ratio > 0) {
        const fillColour = parseInt(bar.color.replace('#', ''), 16) || 0x44cc44
        barG.rect(0, barY + idx * (BAR_HEIGHT + BAR_GAP), size * ratio, BAR_HEIGHT)
        barG.fill({ color: fillColour, alpha: 1 })
      }

      container.addChild(barG)
    })
  }
}

export class TokenRenderer {
  private layerManager: LayerManager
  private textureManager: TextureManager | null
  private tokenContainers = new Map<string, Container>()
  private tokenTextures = new Map<string, Texture | null>()
  private unsubTokens: (() => void) | null = null
  private unsubMap: (() => void) | null = null

  // Change detection: track previous state to skip redundant syncs
  private prevTokens: Token[] = []
  private prevSelectedIds: string[] = []
  private prevGridSize = 0

  constructor(layerManager: LayerManager, textureManager?: TextureManager) {
    this.layerManager = layerManager
    this.textureManager = textureManager ?? null
    this.unsubTokens = useTokenStore.subscribe(() => {
      const { tokens, selectedIds } = useTokenStore.getState()
      if (tokens !== this.prevTokens || selectedIds !== this.prevSelectedIds) {
        this.prevTokens = tokens
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

  private sync(): void {
    const tokens = useTokenStore.getState().tokens
    const selectedIds = useTokenStore.getState().selectedIds
    const gridSize = getCellSize()

    // Remove containers for tokens that no longer exist
    const currentIds = new Set(tokens.map((t) => t.id))
    for (const [id, container] of this.tokenContainers) {
      if (!currentIds.has(id)) {
        container.parent?.removeChild(container)
        container.destroy({ children: true })
        this.tokenContainers.delete(id)
      }
    }

    // Create / update each token
    for (const token of tokens) {
      let container = this.tokenContainers.get(token.id)
      if (!container) {
        container = new Container()
        this.tokenContainers.set(token.id, container)
      }

      // Position in world space
      const pixel = gridToPixel(token.x, token.y, gridSize)
      container.position.set(pixel.x, pixel.y)
      container.rotation = (token.rotation ?? 0) * (Math.PI / 180)

      // Load asset texture if available (async, renders placeholder until loaded)
      const assetUrl = token.asset_id ? `/api/assets/${token.asset_id}` : null
      if (assetUrl && !this.tokenTextures.has(token.id) && this.textureManager) {
        // Mark as loading (null) so we don't kick off duplicate loads
        this.tokenTextures.set(token.id, null)
        this.textureManager.acquire(assetUrl).then((tex) => {
          this.tokenTextures.set(token.id, tex)
          this.sync() // re-render with loaded texture
        }).catch(() => {
          // Failed to load — keep fallback circle
          this.tokenTextures.delete(token.id)
        })
      }

      // Redraw visuals
      const isSelected = selectedIds.includes(token.id)
      const texture = this.tokenTextures.get(token.id) ?? null
      drawToken(container, token, gridSize, isSelected, texture)

      // Attach to the correct layer container
      const layerContainer = this.layerManager.getContainer(token.layer_id)
      if (layerContainer && container.parent !== layerContainer) {
        container.parent?.removeChild(container)
        layerContainer.addChild(container)
      }
    }
  }

  destroy(): void {
    this.unsubTokens?.()
    this.unsubMap?.()
    for (const [, container] of this.tokenContainers) {
      container.parent?.removeChild(container)
      container.destroy({ children: true })
    }
    this.tokenContainers.clear()
    // Release loaded textures
    if (this.textureManager) {
      for (const [tokenId] of this.tokenTextures) {
        const token = this.prevTokens.find((t) => t.id === tokenId)
        if (token?.asset_id) {
          this.textureManager.release(`/api/assets/${token.asset_id}`)
        }
      }
    }
    this.tokenTextures.clear()
  }
}
