import type { ChatMessage } from '../types/ChatMessage'

interface ChatMessageProps {
  message: ChatMessage
}

function formatTime(isoString: string): string {
  const date = new Date(isoString)
  const h = date.getHours().toString().padStart(2, '0')
  const m = date.getMinutes().toString().padStart(2, '0')
  return `${h}:${m}`
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

// Simple deterministic color from a string
function nameColor(name: string): string {
  const colors = [
    '#6366f1', '#ec4899', '#f59e0b', '#10b981',
    '#3b82f6', '#ef4444', '#8b5cf6', '#14b8a6',
  ]
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) & 0xffffffff
  }
  return colors[Math.abs(hash) % colors.length]
}

export function ChatMessageItem({ message }: ChatMessageProps) {
  const time = formatTime(message.created_at)

  switch (message.message_type) {
    case 'character': {
      const charName = message.character_name ?? message.sender_display_name
      const color = nameColor(charName)
      const initials = getInitials(charName)
      return (
        <div style={{ display: 'flex', gap: 8, padding: '4px 8px', alignItems: 'flex-start' }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              background: color,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 10,
              fontWeight: 700,
              color: '#fff',
              flexShrink: 0,
              marginTop: 2,
            }}
          >
            {initials}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span style={{ fontWeight: 700, color, fontSize: 12 }}>{charName}</span>
              <span style={{ fontSize: 10, color: 'var(--color-text-secondary)' }}>{time}</span>
            </div>
            <div style={{ fontSize: 13, color: 'var(--color-text)', wordBreak: 'break-word' }}>
              {message.content}
            </div>
          </div>
        </div>
      )
    }

    case 'ooc': {
      return (
        <div style={{ display: 'flex', gap: 6, padding: '4px 8px', alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>
                {message.sender_display_name}
              </span>
              <span style={{ fontSize: 10, color: 'var(--color-text-secondary)' }}>{time}</span>
            </div>
            <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', wordBreak: 'break-word' }}>
              [{message.content}]
            </div>
          </div>
        </div>
      )
    }

    case 'emote': {
      const emoteName = message.character_name ?? message.sender_display_name
      return (
        <div style={{ padding: '4px 8px' }}>
          <span
            style={{
              fontSize: 13,
              fontStyle: 'italic',
              color: 'var(--color-text-secondary)',
              wordBreak: 'break-word',
            }}
          >
            * {emoteName} {message.content} *
          </span>
          <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--color-text-secondary)' }}>
            {time}
          </span>
        </div>
      )
    }

    case 'whisper': {
      return (
        <div
          style={{
            padding: '4px 8px',
            background: 'rgba(239, 68, 68, 0.12)',
            borderLeft: '2px solid rgba(239, 68, 68, 0.5)',
            margin: '2px 0',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ fontSize: 10, color: 'rgba(239,68,68,0.8)', fontWeight: 600 }}>
              whisper
            </span>
            <span style={{ fontSize: 11, color: 'rgba(239,68,68,0.9)' }}>
              {message.sender_display_name}
            </span>
            <span style={{ fontSize: 10, color: 'var(--color-text-secondary)' }}>{time}</span>
          </div>
          <div style={{ fontSize: 13, color: 'rgba(255,180,180,0.9)', wordBreak: 'break-word' }}>
            {message.content}
          </div>
        </div>
      )
    }

    case 'system': {
      return (
        <div
          style={{
            textAlign: 'center',
            padding: '6px 8px',
            fontSize: 11,
            color: 'var(--color-text-secondary)',
            opacity: 0.7,
          }}
        >
          — {message.content} —
        </div>
      )
    }

    default:
      return null
  }
}
