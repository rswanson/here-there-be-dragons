import { Application } from 'pixi.js'

export async function createCanvasApp(canvas: HTMLCanvasElement) {
  const app = new Application()

  await app.init({
    canvas,
    resizeTo: canvas.parentElement ?? undefined,
    background: '#1a1a2e',
    antialias: true,
    autoDensity: true,
    resolution: window.devicePixelRatio || 1,
  })

  return app
}
