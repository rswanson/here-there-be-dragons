import { Container } from 'pixi.js'
import { useMapStore } from '../state/map'
import type { Viewport } from './Viewport'

export class LayerManager {
  private viewport: Viewport
  private containers = new Map<string, Container>()
  private unsubscribe: (() => void) | null = null

  constructor(viewport: Viewport) {
    this.viewport = viewport
    this.unsubscribe = useMapStore.subscribe(() => this.sync())
    this.sync()
  }

  private sync(): void {
    const layers = useMapStore.getState().layers

    // Remove containers for layers that no longer exist
    for (const [id, container] of this.containers) {
      if (!layers.find((l) => l.id === id)) {
        this.viewport.container.removeChild(container)
        container.destroy()
        this.containers.delete(id)
      }
    }

    // Create containers for new layers, update existing
    for (const layer of layers) {
      let container = this.containers.get(layer.id)
      if (!container) {
        container = new Container()
        container.label = layer.id
        this.containers.set(layer.id, container)
      }
      container.alpha = layer.opacity ?? 1
      container.visible = layer.visible ?? true
    }

    // Reorder: remove all layer containers then re-add in sort_order
    const sorted = [...layers].sort((a, b) => a.sort_order - b.sort_order)
    for (const layer of sorted) {
      const container = this.containers.get(layer.id)
      if (container) {
        // Remove from parent if currently added
        if (container.parent) {
          container.parent.removeChild(container)
        }
        this.viewport.container.addChild(container)
      }
    }
  }

  getContainer(layerId: string): Container | undefined {
    return this.containers.get(layerId)
  }

  destroy(): void {
    this.unsubscribe?.()
    for (const [, container] of this.containers) {
      if (container.parent) {
        container.parent.removeChild(container)
      }
      container.destroy()
    }
    this.containers.clear()
  }
}
