import { useEffect, useRef } from 'react'
import { Application } from 'pixi.js'
import { createCanvasApp } from './engine'

export function CanvasView() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const appRef = useRef<Application | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let mounted = true

    createCanvasApp(canvas).then((app) => {
      if (!mounted) {
        app.destroy()
        return
      }
      appRef.current = app
    })

    return () => {
      mounted = false
      appRef.current?.destroy()
      appRef.current = null
    }
  }, [])

  return (
    <>
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '100%', display: 'block' }}
      />
      <div
        role="application"
        aria-label="Battle map canvas"
        aria-roledescription="virtual tabletop"
        className="sr-only"
        tabIndex={0}
      >
        <p>Empty canvas. Grid and tokens will appear here when a map is loaded.</p>
      </div>
    </>
  )
}
