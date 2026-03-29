import type { Application, Texture } from 'pixi.js'

interface CacheEntry {
  texture: Texture
  refCount: number
}

export class TextureManager {
  private cache = new Map<string, CacheEntry>()
  private loading = new Map<string, Promise<Texture>>()
  readonly maxTextureSize: number

  constructor(app: Application) {
    this.maxTextureSize = this.detectMaxTextureSize(app)
  }

  private detectMaxTextureSize(app: Application): number {
    try {
      const gl = (app.renderer as { gl?: WebGLRenderingContext }).gl
      if (gl) return gl.getParameter(gl.MAX_TEXTURE_SIZE) as number
    } catch {
      /* ignore */
    }
    return 4096 // safe default
  }

  async acquire(url: string): Promise<Texture> {
    const cached = this.cache.get(url)
    if (cached) {
      cached.refCount++
      return cached.texture
    }

    const existing = this.loading.get(url)
    if (existing) return existing

    const promise = this.loadTexture(url)
    this.loading.set(url, promise)
    const texture = await promise
    this.loading.delete(url)
    this.cache.set(url, { texture, refCount: 1 })
    return texture
  }

  release(url: string): void {
    const entry = this.cache.get(url)
    if (!entry) return
    entry.refCount--
    if (entry.refCount <= 0) {
      entry.texture.destroy(true)
      this.cache.delete(url)
    }
  }

  checkSize(width: number, height: number): boolean {
    if (width > this.maxTextureSize || height > this.maxTextureSize) {
      console.warn(
        `Image dimensions ${width}x${height} exceed GPU max texture size ${this.maxTextureSize}`,
      )
      return false
    }
    return true
  }

  destroy(): void {
    for (const [, entry] of this.cache) {
      entry.texture.destroy(true)
    }
    this.cache.clear()
    this.loading.clear()
  }

  private async loadTexture(url: string): Promise<Texture> {
    const { Texture } = await import('pixi.js')
    const img = new window.Image()
    img.crossOrigin = 'anonymous'
    img.src = url
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error(`Failed to load: ${url}`))
    })
    return Texture.from(img)
  }
}
