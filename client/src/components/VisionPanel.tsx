import { usePresenceStore } from '../state/presence'
import { useFogStore } from '../state/fog'

export function VisionPanel() {
  const connectedUsers = usePresenceStore((s) => s.connectedUsers)
  const visionMode = useFogStore((s) => s.visionMode)
  const previewPlayerId = useFogStore((s) => s.previewPlayerId)

  const players = connectedUsers.filter((u) => u.role !== 'dm')

  const currentValue = visionMode === 'dm' ? 'dm' : (previewPlayerId ?? 'dm')

  const handleChange = (value: string) => {
    if (value === 'dm') {
      useFogStore.getState().setVisionMode('dm')
    } else {
      useFogStore.getState().setVisionMode('player', value)
    }
  }

  return (
    <div style={{
      position: 'absolute', right: 8, bottom: 8,
      background: 'var(--color-surface, #2a2a3e)', borderRadius: 8,
      padding: 8, zIndex: 10,
      display: 'flex', flexDirection: 'column', gap: 4,
      minWidth: 140,
    }}>
      <span style={{ fontSize: 10, color: 'var(--color-text-secondary)', fontWeight: 600 }}>
        Vision Mode
      </span>
      <select
        value={currentValue}
        onChange={(e) => handleChange(e.target.value)}
        style={{
          background: 'var(--color-bg, #1a1a2e)',
          border: '1px solid var(--color-border, #444)',
          borderRadius: 4,
          color: 'var(--color-text, #e0e0e0)',
          padding: '4px 6px',
          fontSize: 12,
        }}
      >
        <option value="dm">DM View</option>
        {players.map((u) => (
          <option key={u.user_id} value={u.user_id}>
            {u.display_name}
          </option>
        ))}
      </select>
    </div>
  )
}
