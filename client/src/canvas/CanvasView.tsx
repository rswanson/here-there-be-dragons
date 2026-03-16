import { useEffect, useRef, useState } from 'react'
import type { Application, Sprite } from 'pixi.js'
import { useUiStore } from '../state/ui'
import type { Viewport } from './Viewport'
import type { GridRenderer } from './GridRenderer'
import type { LayerManager } from './LayerManager'
import type { TokenRenderer } from './TokenRenderer'
import type { TokenInteraction } from './TokenInteraction'

type CanvasStatus = 'loading' | 'ready' | 'error'

type PixiApp = Application & { _resizeObserver?: ResizeObserver }

export function CanvasView() {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [status, setStatus] = useState<CanvasStatus>('loading')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const appRef = useRef<PixiApp | null>(null)
  const spriteRef = useRef<Sprite | null>(null)
  const pixiRef = useRef<typeof import('pixi.js') | null>(null)
  const viewportRef = useRef<Viewport | null>(null)
  const gridRef = useRef<GridRenderer | null>(null)
  const layerManagerRef = useRef<LayerManager | null>(null)
  const tokenRendererRef = useRef<TokenRenderer | null>(null)
  const tokenInteractionRef = useRef<TokenInteraction | null>(null)
  const mapAssetUrl = useUiStore((s) => s.mapAssetUrl)

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    let mounted = true

    const initPixi = async () => {
      try {
        const PIXI = await import('pixi.js')
        pixiRef.current = PIXI
        if (!mounted) return

        const app = new PIXI.Application()

        await app.init({
          canvas,
          width: container.clientWidth || 800,
          height: container.clientHeight || 600,
          background: '#1a1a2e',
          antialias: true,
          autoDensity: true,
          resolution: window.devicePixelRatio || 1,
          preference: 'webgl',
        })

        if (!mounted) {
          app.destroy()
          return
        }

        appRef.current = app

        // Create the viewport after the app is ready so canvas events work
        const { Viewport } = await import('./Viewport')
        if (!mounted) {
          app.destroy()
          return
        }
        viewportRef.current = new Viewport(app)

        const { GridRenderer } = await import('./GridRenderer')
        if (!mounted) {
          viewportRef.current.destroy()
          viewportRef.current = null
          app.destroy()
          return
        }
        gridRef.current = new GridRenderer(app, viewportRef.current)

        const { LayerManager } = await import('./LayerManager')
        if (!mounted) {
          gridRef.current.destroy()
          gridRef.current = null
          viewportRef.current.destroy()
          viewportRef.current = null
          app.destroy()
          return
        }
        layerManagerRef.current = new LayerManager(viewportRef.current)

        const { TokenRenderer } = await import('./TokenRenderer')
        if (!mounted) {
          layerManagerRef.current.destroy()
          layerManagerRef.current = null
          gridRef.current.destroy()
          gridRef.current = null
          viewportRef.current.destroy()
          viewportRef.current = null
          app.destroy()
          return
        }
        tokenRendererRef.current = new TokenRenderer(layerManagerRef.current)

        const { TokenInteraction } = await import('./TokenInteraction')
        if (!mounted) {
          tokenRendererRef.current.destroy()
          tokenRendererRef.current = null
          layerManagerRef.current.destroy()
          layerManagerRef.current = null
          gridRef.current.destroy()
          gridRef.current = null
          viewportRef.current.destroy()
          viewportRef.current = null
          app.destroy()
          return
        }
        tokenInteractionRef.current = new TokenInteraction(app, viewportRef.current, layerManagerRef.current)

        setStatus('ready')

        const observer = new ResizeObserver((entries) => {
          for (const entry of entries) {
            const { width, height } = entry.contentRect
            if (width > 0 && height > 0) {
              app.renderer.resize(width, height)
            }
          }
        })
        observer.observe(container)
        ;(app as PixiApp)._resizeObserver = observer
      } catch (err) {
        console.error('PixiJS init failed:', err)
        if (mounted) {
          setStatus('error')
          setErrorMsg(err instanceof Error ? err.message : String(err))
        }
      }
    }

    // Defer init to next frame so container has layout dimensions
    requestAnimationFrame(() => {
      if (mounted) initPixi()
    })

    return () => {
      mounted = false
      const app = appRef.current
      if (app) {
        app._resizeObserver?.disconnect()
        tokenInteractionRef.current?.destroy()
        tokenInteractionRef.current = null
        tokenRendererRef.current?.destroy()
        tokenRendererRef.current = null
        layerManagerRef.current?.destroy()
        layerManagerRef.current = null
        gridRef.current?.destroy()
        gridRef.current = null
        viewportRef.current?.destroy()
        viewportRef.current = null
        app.destroy()
      }
      appRef.current = null
      spriteRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!mapAssetUrl || !appRef.current || status !== 'ready') return

    const PIXI = pixiRef.current
    if (!PIXI) return

    let cancelled = false

    const loadMap = async () => {
      const app = appRef.current
      const viewport = viewportRef.current
      if (!app || !viewport || cancelled) return

      if (spriteRef.current) {
        viewport.container.removeChild(spriteRef.current)
        spriteRef.current.destroy()
        spriteRef.current = null
      }

      try {
        // Load image via native Image element because the asset API URL
        // has no file extension, and PIXI.Assets.load() relies on
        // extensions to pick the right parser. The browser's Image
        // element uses the Content-Type header from the server instead.
        const img = new window.Image()
        img.crossOrigin = 'anonymous'
        img.src = mapAssetUrl
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve()
          img.onerror = () => reject(new Error(`Failed to load image: ${mapAssetUrl}`))
        })
        if (cancelled || !appRef.current || !viewportRef.current) return
        const texture = PIXI.Texture.from(img)
        const sprite = new PIXI.Sprite(texture)
        // Fit the map to the screen and use fitToRect for a proper viewport fit
        viewportRef.current.fitToRect(sprite.width, sprite.height)
        viewportRef.current.container.addChild(sprite)
        spriteRef.current = sprite
      } catch (err) {
        console.error('Failed to load map asset:', err)
      }
    }

    loadMap()

    return () => { cancelled = true }
  }, [mapAssetUrl, status])

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', overflow: 'hidden', position: 'relative' }}>
      <canvas
        ref={canvasRef}
        style={{ display: 'block', width: '100%', height: '100%' }}
      />
      {status === 'loading' && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--color-text-secondary)',
        }}>
          Initializing canvas...
        </div>
      )}
      {status === 'error' && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexDirection: 'column', gap: 8,
          color: 'var(--color-error, #ff6b6b)',
        }}>
          <p>Canvas failed to initialize</p>
          {errorMsg && <p style={{ fontSize: 'var(--font-size-sm)', opacity: 0.7 }}>{errorMsg}</p>}
        </div>
      )}
      <div
        role="application"
        aria-label="Battle map canvas"
        aria-roledescription="virtual tabletop"
        className="sr-only"
        tabIndex={0}
      >
        <p>{mapAssetUrl ? 'Map loaded on canvas.' : 'Empty canvas. Grid and tokens will appear here when a map is loaded.'}</p>
      </div>
    </div>
  )
}
