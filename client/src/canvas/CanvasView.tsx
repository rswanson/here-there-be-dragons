import { useEffect, useRef, useState } from 'react'
import type { Application, Sprite } from 'pixi.js'
import { useUiStore } from '../state/ui'
import type { Viewport } from './Viewport'
import type { GridRenderer } from './GridRenderer'
import type { LayerManager } from './LayerManager'
import type { TokenRenderer } from './TokenRenderer'
import type { TokenInteraction } from './TokenInteraction'
import type { DrawingRenderer } from './DrawingRenderer'
import type { DrawingTools } from './DrawingTools'
import type { AoeTemplates } from './AoeTemplates'
import type { MeasurementOverlay } from './MeasurementOverlay'
import type { WallRenderer } from './WallRenderer'
import type { WallInteraction } from './WallInteraction'
import type { FogRenderer } from './FogRenderer'
import type { LightRenderer } from './LightRenderer'
import type { TextureManager } from './TextureManager'
import type { MapImageRenderer } from './MapImageRenderer'
import type { AccessibilityDOM } from './AccessibilityDOM'

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
  const mapImageRendererRef = useRef<MapImageRenderer | null>(null)
  const tokenRendererRef = useRef<TokenRenderer | null>(null)
  const tokenInteractionRef = useRef<TokenInteraction | null>(null)
  const drawingRendererRef = useRef<DrawingRenderer | null>(null)
  const drawingToolsRef = useRef<DrawingTools | null>(null)
  const aoeTemplatesRef = useRef<AoeTemplates | null>(null)
  const measurementRef = useRef<MeasurementOverlay | null>(null)
  const wallRendererRef = useRef<WallRenderer | null>(null)
  const wallInteractionRef = useRef<WallInteraction | null>(null)
  const fogRendererRef = useRef<FogRenderer | null>(null)
  const lightRendererRef = useRef<LightRenderer | null>(null)
  const textureManagerRef = useRef<TextureManager | null>(null)
  const accessibilityRef = useRef<AccessibilityDOM | null>(null)
  const mapAssetUrl = useUiStore((s) => s.mapAssetUrl)

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    let mounted = true
    const subsystems: Array<{ destroy: () => void }> = []

    const destroySubsystems = (app: PixiApp) => {
      for (let i = subsystems.length - 1; i >= 0; i--) subsystems[i].destroy()
      app.destroy()
    }

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

        const { TextureManager: TM } = await import('./TextureManager')
        if (!mounted) { destroySubsystems(app); return }
        textureManagerRef.current = new TM(app)
        subsystems.push({ destroy: () => { textureManagerRef.current?.destroy(); textureManagerRef.current = null } })

        // Create the viewport after the app is ready so canvas events work
        const { Viewport } = await import('./Viewport')
        if (!mounted) { destroySubsystems(app); return }
        viewportRef.current = new Viewport(app)
        subsystems.push({ destroy: () => { viewportRef.current?.destroy(); viewportRef.current = null } })

        const { GridRenderer } = await import('./GridRenderer')
        if (!mounted) { destroySubsystems(app); return }
        gridRef.current = new GridRenderer(app, viewportRef.current)
        subsystems.push({ destroy: () => { gridRef.current?.destroy(); gridRef.current = null } })

        const { LayerManager } = await import('./LayerManager')
        if (!mounted) { destroySubsystems(app); return }
        layerManagerRef.current = new LayerManager(viewportRef.current)
        subsystems.push({ destroy: () => { layerManagerRef.current?.destroy(); layerManagerRef.current = null } })

        const { MapImageRenderer } = await import('./MapImageRenderer')
        if (!mounted) { destroySubsystems(app); return }
        mapImageRendererRef.current = new MapImageRenderer(layerManagerRef.current, textureManagerRef.current!)
        subsystems.push({ destroy: () => { mapImageRendererRef.current?.destroy(); mapImageRendererRef.current = null } })

        const { TokenRenderer } = await import('./TokenRenderer')
        if (!mounted) { destroySubsystems(app); return }
        tokenRendererRef.current = new TokenRenderer(layerManagerRef.current, textureManagerRef.current!)
        subsystems.push({ destroy: () => { tokenRendererRef.current?.destroy(); tokenRendererRef.current = null } })

        const { TokenInteraction } = await import('./TokenInteraction')
        if (!mounted) { destroySubsystems(app); return }
        tokenInteractionRef.current = new TokenInteraction(app, viewportRef.current, layerManagerRef.current)
        subsystems.push({ destroy: () => { tokenInteractionRef.current?.destroy(); tokenInteractionRef.current = null } })

        const { DrawingRenderer } = await import('./DrawingRenderer')
        if (!mounted) { destroySubsystems(app); return }
        drawingRendererRef.current = new DrawingRenderer(layerManagerRef.current)
        subsystems.push({ destroy: () => { drawingRendererRef.current?.destroy(); drawingRendererRef.current = null } })

        const { DrawingTools } = await import('./DrawingTools')
        if (!mounted) { destroySubsystems(app); return }
        drawingToolsRef.current = new DrawingTools(app, viewportRef.current, layerManagerRef.current)
        subsystems.push({ destroy: () => { drawingToolsRef.current?.destroy(); drawingToolsRef.current = null } })

        const { AoeTemplates } = await import('./AoeTemplates')
        if (!mounted) { destroySubsystems(app); return }
        aoeTemplatesRef.current = new AoeTemplates(app, viewportRef.current)
        subsystems.push({ destroy: () => { aoeTemplatesRef.current?.destroy(); aoeTemplatesRef.current = null } })

        const { MeasurementOverlay } = await import('./MeasurementOverlay')
        if (!mounted) { destroySubsystems(app); return }
        measurementRef.current = new MeasurementOverlay(app, viewportRef.current)
        subsystems.push({ destroy: () => { measurementRef.current?.destroy(); measurementRef.current = null } })

        const { WallRenderer } = await import('./WallRenderer')
        if (!mounted) { destroySubsystems(app); return }
        wallRendererRef.current = new WallRenderer(viewportRef.current)
        subsystems.push({ destroy: () => { wallRendererRef.current?.destroy(); wallRendererRef.current = null } })

        const { WallInteraction } = await import('./WallInteraction')
        if (!mounted) { destroySubsystems(app); return }
        wallInteractionRef.current = new WallInteraction(app, viewportRef.current)
        subsystems.push({ destroy: () => { wallInteractionRef.current?.destroy(); wallInteractionRef.current = null } })

        const { FogRenderer } = await import('./FogRenderer')
        if (!mounted) { destroySubsystems(app); return }
        fogRendererRef.current = new FogRenderer(viewportRef.current)
        subsystems.push({ destroy: () => { fogRendererRef.current?.destroy(); fogRendererRef.current = null } })

        const { LightRenderer } = await import('./LightRenderer')
        if (!mounted) { destroySubsystems(app); return }
        lightRendererRef.current = new LightRenderer(viewportRef.current)
        subsystems.push({ destroy: () => { lightRendererRef.current?.destroy(); lightRendererRef.current = null } })

        const { AccessibilityDOM } = await import('./AccessibilityDOM')
        if (!mounted) { destroySubsystems(app); return }
        accessibilityRef.current = new AccessibilityDOM(container)
        subsystems.push({ destroy: () => { accessibilityRef.current?.destroy(); accessibilityRef.current = null } })

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
        for (let i = subsystems.length - 1; i >= 0; i--) subsystems[i].destroy()
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
        // Add map sprite at index 0 so it renders BEHIND grid, layers, walls, fog
        viewportRef.current.container.addChildAt(sprite, 0)
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
        aria-live="polite"
      >
        <p>{mapAssetUrl ? 'Map loaded on canvas.' : 'Empty canvas. Grid and tokens will appear here when a map is loaded.'}</p>
      </div>
    </div>
  )
}
