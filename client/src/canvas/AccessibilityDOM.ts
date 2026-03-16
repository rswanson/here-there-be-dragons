import { useTokenStore } from '../state/tokens'
import { useToolStore } from '../state/tools'

export class AccessibilityDOM {
  private container: HTMLDivElement
  private liveRegion: HTMLDivElement
  private tokenList: HTMLUListElement
  private unsubTokens: (() => void) | null = null
  private unsubTools: (() => void) | null = null

  constructor(parent: HTMLElement) {
    this.container = document.createElement('div')
    this.container.className = 'sr-only'
    this.container.setAttribute('aria-label', 'Canvas state')

    this.liveRegion = document.createElement('div')
    this.liveRegion.setAttribute('aria-live', 'polite')
    this.liveRegion.setAttribute('aria-atomic', 'true')
    this.container.appendChild(this.liveRegion)

    this.tokenList = document.createElement('ul')
    this.tokenList.setAttribute('aria-label', 'Tokens on map')
    this.container.appendChild(this.tokenList)

    parent.appendChild(this.container)

    this.unsubTokens = useTokenStore.subscribe(() => this.syncTokens())
    this.unsubTools = useToolStore.subscribe((state, prev) => {
      if (state.activeTool !== prev.activeTool) {
        this.announce(`Tool: ${state.activeTool} selected`)
      }
    })

    this.syncTokens()
  }

  private syncTokens(): void {
    const tokens = useTokenStore.getState().tokens
    this.tokenList.innerHTML = ''
    for (const token of tokens) {
      const li = document.createElement('li')
      const parts = [token.name]
      if (token.bars.length > 0) {
        const hpBar = token.bars[0]
        parts.push(`${hpBar.label}: ${hpBar.current}/${hpBar.max}`)
      }
      if (token.status_markers.length > 0) {
        parts.push(token.status_markers.join(', '))
      }
      parts.push(`at position ${token.x}, ${token.y}`)
      li.textContent = parts.join(', ')
      this.tokenList.appendChild(li)
    }
  }

  announce(message: string): void {
    this.liveRegion.textContent = ''
    // Force screen reader to re-read by clearing first, then setting after a tick
    requestAnimationFrame(() => {
      this.liveRegion.textContent = message
    })
  }

  destroy(): void {
    this.unsubTokens?.()
    this.unsubTools?.()
    this.container.remove()
  }
}
