import { Application } from 'pixi.js'

export async function createCanvasApp(canvas: HTMLCanvasElement) {
  const parent = canvas.parentElement
  const width = parent?.clientWidth ?? 800
  const height = parent?.clientHeight ?? 600

  const app = new Application()

  await app.init({
    canvas,
    width,
    height,
    background: '#1a1a2e',
    antialias: true,
    autoDensity: true,
    resolution: window.devicePixelRatio || 1,
  })

  return app
}
