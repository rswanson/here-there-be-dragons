import type { ClientMessage } from '../types/ClientMessage'
import type { ServerMessage } from '../types/ServerMessage'

type MessageHandler = (message: ServerMessage) => void

export class WsClient {
  private ws: WebSocket | null = null
  private handlers: Set<MessageHandler> = new Set()
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private intentionalClose = false

  connect(sessionId: string) {
    this.intentionalClose = false
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const url = `${protocol}//${window.location.host}/api/ws?session=${sessionId}`

    this.ws = new WebSocket(url)

    this.ws.onmessage = (event) => {
      try {
        const message: ServerMessage = JSON.parse(event.data)
        this.handlers.forEach((handler) => handler(message))
      } catch (e) {
        console.error('Failed to parse WebSocket message:', e)
      }
    }

    this.ws.onclose = () => {
      if (!this.intentionalClose) {
        this.reconnectTimer = setTimeout(() => this.connect(sessionId), 3000)
      }
    }

    this.ws.onerror = (e) => {
      console.error('WebSocket error:', e)
    }
  }

  send(message: ClientMessage) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message))
    }
  }

  subscribe(handler: MessageHandler) {
    this.handlers.add(handler)
    return () => this.handlers.delete(handler)
  }

  disconnect() {
    this.intentionalClose = true
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.ws?.close()
    this.ws = null
  }
}

export const wsClient = new WsClient()
