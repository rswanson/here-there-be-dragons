import { Sprite, type Texture } from 'pixi.js'
import { useMapImageStore } from '../state/mapImages'
import { useMapStore } from '../state/map'
import type { LayerManager } from './LayerManager'
import type { TextureManager } from './TextureManager'
import type { MapImage } from '../types/MapImage'
import { getCellSize } from './utils'

export class MapImageRenderer {
  private layerManager: LayerManager
  private textureManager: TextureManager | null
  private sprites = new Map<string, Sprite>()
  private imageTextures = new Map<string, Texture | null>()
  private unsubImages: (() => void) | null = null
  private unsubMap: (() => void) | null = null

  private prevImages: MapImage[] = []
  private prevGridSize = 0

  constructor(layerManager: LayerManager, textureManager?: TextureManager) {
    this.layerManager = layerManager
    this.textureManager = textureManager ?? null

    this.unsubImages = useMapImageStore.subscribe(() => {
      const { images } = useMapImageStore.getState()
      if (images !== this.prevImages) {
        this.prevImages = images
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
    const images = useMapImageStore.getState().images
    const gridSize = getCellSize()

    // Remove sprites for images that no longer exist
    const currentIds = new Set(images.map((img) => img.id))
    for (const [id, sprite] of this.sprites) {
      if (!currentIds.has(id)) {
        sprite.parent?.removeChild(sprite)
        sprite.destroy()
        this.sprites.delete(id)
        // Release texture reference
        const img = this.prevImages.find((i) => i.id === id)
        if (img && this.textureManager) {
          this.textureManager.release(`/api/assets/${img.asset_id}/download`)
        }
        this.imageTextures.delete(id)
      }
    }

    // Create / update each image sprite
    for (const image of images) {
      const pixelX = image.x * gridSize
      const pixelY = image.y * gridSize
      const pixelW = image.width * gridSize
      const pixelH = image.height * gridSize

      const assetUrl = `/api/assets/${image.asset_id}/download`

      // Start async texture load if not already loading/loaded
      if (!this.imageTextures.has(image.id) && this.textureManager) {
        this.imageTextures.set(image.id, null) // mark as loading
        this.textureManager.acquire(assetUrl).then((tex) => {
          this.imageTextures.set(image.id, tex)
          this.sync()
        }).catch(() => {
          this.imageTextures.delete(image.id)
        })
      }

      const texture = this.imageTextures.get(image.id) ?? null
      if (!texture) {
        // Not loaded yet — skip rendering until texture arrives
        continue
      }

      let sprite = this.sprites.get(image.id)
      if (!sprite) {
        sprite = new Sprite(texture)
        this.sprites.set(image.id, sprite)
      } else {
        sprite.texture = texture
      }

      sprite.position.set(pixelX, pixelY)
      sprite.width = pixelW
      sprite.height = pixelH
      sprite.rotation = (image.rotation ?? 0) * (Math.PI / 180)
      sprite.alpha = image.opacity ?? 1

      // Attach to the correct layer container
      const layerContainer = this.layerManager.getContainer(image.layer_id)
      if (layerContainer && sprite.parent !== layerContainer) {
        sprite.parent?.removeChild(sprite)
        // Add at index 0 so images are behind tokens in the same layer
        layerContainer.addChildAt(sprite, 0)
      }
    }
  }

  destroy(): void {
    this.unsubImages?.()
    this.unsubMap?.()

    if (this.textureManager) {
      for (const [imageId] of this.imageTextures) {
        const img = this.prevImages.find((i) => i.id === imageId)
        if (img) {
          this.textureManager.release(`/api/assets/${img.asset_id}/download`)
        }
      }
    }

    for (const [, sprite] of this.sprites) {
      sprite.parent?.removeChild(sprite)
      sprite.destroy()
    }
    this.sprites.clear()
    this.imageTextures.clear()
  }
}
