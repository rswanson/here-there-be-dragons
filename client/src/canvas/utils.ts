import type { Drawing } from '../types/Drawing'
import { useMapStore } from '../state/map'

type Point = { x: number; y: number }

/** Parse the points JSON stored on a Drawing into an array of {x,y} objects. */
export function parsePoints(raw: Drawing['points']): Point[] {
  if (!Array.isArray(raw)) return []
  return (raw as Point[]).filter(
    (p) => typeof p?.x === 'number' && typeof p?.y === 'number',
  )
}

/** Convert a CSS hex colour string to a numeric colour value. */
export function hexToNumber(hex: string): number {
  return parseInt(hex.replace('#', ''), 16)
}

/** Generate a unique drawing ID. */
export function newDrawingId(): string {
  return `drawing-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

/**
 * Throttle utility — calls `fn` at most once per `ms` milliseconds.
 * A trailing call is always scheduled so the final invocation is captured.
 */
export function throttle<T extends (...args: Parameters<T>) => void>(fn: T, ms: number): T {
  let lastCall = 0
  let timer: ReturnType<typeof setTimeout> | null = null
  return ((...args: Parameters<T>) => {
    const now = Date.now()
    if (now - lastCall >= ms) {
      lastCall = now
      fn(...args)
    } else if (!timer) {
      timer = setTimeout(() => {
        lastCall = Date.now()
        timer = null
        fn(...args)
      }, ms - (now - lastCall))
    }
  }) as T
}

/** Get the current map's cell/grid size in pixels, defaulting to 70. */
export function getCellSize(): number {
  return useMapStore.getState().currentMap?.grid_size_px ?? 70
}
