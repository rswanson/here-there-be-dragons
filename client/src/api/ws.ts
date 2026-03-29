import type { ClientMessage } from '../types/ClientMessage'
import type { ServerMessage } from '../types/ServerMessage'
import { usePresenceStore } from '../state/presence'

type MessageHandler = (message: ServerMessage) => void

export class WsClient {
  private ws: WebSocket | null = null
  private handlers: Set<MessageHandler> = new Set()
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private intentionalClose = false
  private campaignId: string | null = null
  private onReconnect: (() => void) | undefined = undefined
  private hasConnectedOnce = false

  connect(campaignId: string, onReconnect?: () => void) {
    this.intentionalClose = false
    this.campaignId = campaignId
    this.onReconnect = onReconnect

    const isReconnect = this.hasConnectedOnce

    usePresenceStore.getState().setConnectionState('connecting')

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const url = `${protocol}//${window.location.host}/api/ws/${campaignId}`

    this.ws = new WebSocket(url)

    this.ws.onopen = () => {
      this.hasConnectedOnce = true
      usePresenceStore.getState().setConnectionState('connected')
      if (isReconnect && this.onReconnect) {
        this.onReconnect()
      }
    }

    this.ws.onmessage = (event) => {
      try {
        const message: ServerMessage = JSON.parse(event.data)
        this.handlers.forEach((handler) => handler(message))
      } catch (e) {
        console.error('Failed to parse WebSocket message:', e)
      }
    }

    this.ws.onclose = () => {
      usePresenceStore.getState().setConnectionState('disconnected')
      if (!this.intentionalClose && this.campaignId) {
        this.reconnectTimer = setTimeout(
          () => this.connect(this.campaignId!, this.onReconnect),
          3000,
        )
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
    this.hasConnectedOnce = false
    this.campaignId = null
    this.onReconnect = undefined
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.ws?.close()
    this.ws = null
    usePresenceStore.getState().setConnectionState('disconnected')
  }
}

export const wsClient = new WsClient()
