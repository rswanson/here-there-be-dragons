import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { WsClient } from '../ws'

// Mock the presence store so ws.ts can call setConnectionState
vi.mock('../../state/presence', () => ({
  usePresenceStore: {
    getState: () => ({
      setConnectionState: vi.fn(),
    }),
  },
}))

const TEST_CAMPAIGN_ID = 'campaign-123'

describe('WsClient', () => {
  let client: WsClient
  let mockInstances: Array<{
    send: ReturnType<typeof vi.fn>
    close: ReturnType<typeof vi.fn>
    readyState: number
    onopen: (() => void) | null
    onmessage: ((event: { data: string }) => void) | null
    onclose: (() => void) | null
    onerror: ((e: unknown) => void) | null
  }>

  function latestWs() {
    return mockInstances[mockInstances.length - 1]
  }

  beforeEach(() => {
    vi.useFakeTimers()
    client = new WsClient()
    mockInstances = []

    // Use a real function (not arrow) so `new` works
    const MockWS = vi.fn(function (this: Record<string, unknown>) {
      const instance = {
        send: vi.fn(),
        close: vi.fn(),
        readyState: 1,
        onopen: null as (() => void) | null,
        onmessage: null as ((event: { data: string }) => void) | null,
        onclose: null as (() => void) | null,
        onerror: null as ((e: unknown) => void) | null,
      }
      mockInstances.push(instance)
      return instance
    })
    Object.defineProperty(MockWS, 'OPEN', { value: 1 })
    vi.stubGlobal('WebSocket', MockWS)
  })

  afterEach(() => {
    client.disconnect()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('creates WebSocket with campaign-scoped URL', () => {
    client.connect(TEST_CAMPAIGN_ID)
    expect(WebSocket).toHaveBeenCalledWith(
      expect.stringContaining(`/api/ws/${TEST_CAMPAIGN_ID}`),
    )
  })

  it('sends JSON-serialized messages when open', () => {
    client.connect(TEST_CAMPAIGN_ID)
    client.send({ type: 'Ping' })
    expect(latestWs().send).toHaveBeenCalledWith('{"type":"Ping"}')
  })

  it('does not send when socket is not open', () => {
    client.connect(TEST_CAMPAIGN_ID)
    latestWs().readyState = 3 // CLOSED
    client.send({ type: 'Ping' })
    expect(latestWs().send).not.toHaveBeenCalled()
  })

  it('dispatches parsed messages to subscribers', () => {
    client.connect(TEST_CAMPAIGN_ID)
    const handler = vi.fn()
    client.subscribe(handler)

    latestWs().onmessage?.({ data: '{"type":"Pong"}' })
    expect(handler).toHaveBeenCalledWith({ type: 'Pong' })
  })

  it('unsubscribe removes handler', () => {
    client.connect(TEST_CAMPAIGN_ID)
    const handler = vi.fn()
    const unsub = client.subscribe(handler)
    unsub()

    latestWs().onmessage?.({ data: '{"type":"Pong"}' })
    expect(handler).not.toHaveBeenCalled()
  })

  it('reconnects after close', () => {
    client.connect(TEST_CAMPAIGN_ID)
    latestWs().onclose?.()
    vi.advanceTimersByTime(3000)
    expect(mockInstances).toHaveLength(2)
  })

  it('disconnect closes the socket', () => {
    client.connect(TEST_CAMPAIGN_ID)
    const ws = latestWs()
    client.disconnect()
    expect(ws.close).toHaveBeenCalled()
  })

  it('disconnect prevents reconnect', () => {
    client.connect(TEST_CAMPAIGN_ID)
    const ws = latestWs()
    client.disconnect()
    // Simulate the onclose that ws.close() triggers
    ws.onclose?.()
    vi.advanceTimersByTime(3000)
    // Should still only have 1 instance — no reconnect
    expect(mockInstances).toHaveLength(1)
  })

  it('calls onReconnect callback on reconnection', () => {
    const onReconnect = vi.fn()
    client.connect(TEST_CAMPAIGN_ID, onReconnect)

    // First connection open — should NOT call onReconnect
    latestWs().onopen?.()
    expect(onReconnect).not.toHaveBeenCalled()

    // Simulate disconnect + reconnect
    latestWs().onclose?.()
    vi.advanceTimersByTime(3000)

    // Second connection open — should call onReconnect
    latestWs().onopen?.()
    expect(onReconnect).toHaveBeenCalledTimes(1)
  })
})
