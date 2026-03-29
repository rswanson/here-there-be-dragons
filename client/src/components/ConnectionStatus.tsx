import { usePresenceStore } from '../state/presence'

const DOT_COLORS = {
  connected: '#22c55e',
  connecting: '#eab308',
  disconnected: '#ef4444',
} as const

export function ConnectionStatus() {
  const connectionState = usePresenceStore((s) => s.connectionState)

  if (connectionState === 'disconnected') return null

  const label = connectionState === 'connected' ? 'Connected' : 'Reconnecting...'

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        color: 'var(--color-text-secondary)',
        fontSize: 12,
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: DOT_COLORS[connectionState],
          flexShrink: 0,
        }}
      />
      {label}
    </div>
  )
}
