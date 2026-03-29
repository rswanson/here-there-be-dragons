import { usePresenceStore } from '../state/presence'

export function PlayersOnline() {
  const isConnected = usePresenceStore((s) => s.isConnected)
  const connectedUsers = usePresenceStore((s) => s.connectedUsers)

  if (!isConnected) return null

  return (
    <div
      style={{
        background: 'var(--color-surface, #2a2a3e)',
        borderRadius: 6,
        padding: '10px 12px',
        fontSize: 12,
      }}
    >
      <p
        style={{
          margin: '0 0 8px',
          fontWeight: 600,
          color: 'var(--color-text-secondary)',
          fontSize: 12,
        }}
      >
        Players Online ({connectedUsers.length})
      </p>
      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {connectedUsers.map((user) => (
          <li key={user.user_id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: '#22c55e',
                flexShrink: 0,
              }}
            />
            <span style={{ flex: 1, color: 'var(--color-text)', fontSize: 12 }}>{user.display_name}</span>
            {user.role === 'dm' && (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: 'var(--color-text-secondary)',
                  background: 'var(--color-bg-secondary)',
                  borderRadius: 3,
                  padding: '1px 5px',
                }}
              >
                DM
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
