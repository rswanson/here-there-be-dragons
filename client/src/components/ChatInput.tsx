import { useState } from 'react'
import { useCharacterStore } from '../state/characters'
import { usePresenceStore } from '../state/presence'
import { wsClient } from '../api/ws'
import type { ChatMessageType } from '../types/ChatMessageType'

interface ChatInputProps {
  campaignId: string
}

export function ChatInput({ campaignId: _campaignId }: ChatInputProps) {
  const characters = useCharacterStore((s) => s.characters)
  const connectedUsers = usePresenceStore((s) => s.connectedUsers)

  const [selectedCharacterId, setSelectedCharacterId] = useState<string | 'ooc'>('ooc')
  const [text, setText] = useState('')

  function handleSubmit() {
    const trimmed = text.trim()
    if (!trimmed) return

    let messageType: ChatMessageType
    let content: string
    let characterId: string | null = null
    const whisperTargetIds: string[] = []

    if (trimmed.startsWith('/w ')) {
      // /w targetName rest of message
      const rest = trimmed.slice(3)
      const spaceIdx = rest.indexOf(' ')
      if (spaceIdx === -1) {
        // no message body — abort
        return
      }
      const targetName = rest.slice(0, spaceIdx)
      content = rest.slice(spaceIdx + 1).trim()
      messageType = 'whisper'
      // Resolve target name to user ID
      const targetUser = connectedUsers.find(
        (u) => u.display_name.toLowerCase() === targetName.toLowerCase(),
      )
      if (targetUser) {
        whisperTargetIds.push(targetUser.user_id)
      }
    } else if (trimmed.startsWith('/me ')) {
      messageType = 'emote'
      content = trimmed.slice(4)
      if (selectedCharacterId !== 'ooc') {
        characterId = selectedCharacterId
      }
    } else if (trimmed.startsWith('/session ')) {
      messageType = 'system'
      const sub = trimmed.slice(9).trim()
      content = sub === 'end' ? 'session_end' : 'session_start'
    } else {
      content = trimmed
      if (selectedCharacterId !== 'ooc') {
        messageType = 'character'
        characterId = selectedCharacterId
      } else {
        messageType = 'ooc'
      }
    }

    wsClient.send({
      type: 'SendChatMessage',
      payload: {
        character_id: characterId,
        message_type: messageType,
        content,
        whisper_target_ids: whisperTargetIds,
      },
    })

    setText('')
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        padding: '8px',
        borderTop: '1px solid var(--color-border, #333)',
        flexShrink: 0,
      }}
    >
      <div style={{ display: 'flex', gap: 6 }}>
        {/* Character selector */}
        <select
          value={selectedCharacterId}
          onChange={(e) => setSelectedCharacterId(e.target.value)}
          style={{
            background: 'var(--color-surface, #1e1e2e)',
            border: '1px solid var(--color-border, #444)',
            borderRadius: 4,
            color: 'var(--color-text)',
            fontSize: 11,
            padding: '4px 6px',
            cursor: 'pointer',
            flexShrink: 0,
            maxWidth: 100,
          }}
        >
          <option value="ooc">OOC</option>
          {characters.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        {/* Text input */}
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Say something… /me /w /session"
          style={{
            flex: 1,
            background: 'var(--color-surface, #1e1e2e)',
            border: '1px solid var(--color-border, #444)',
            borderRadius: 4,
            color: 'var(--color-text)',
            fontSize: 12,
            padding: '4px 8px',
            outline: 'none',
            minWidth: 0,
          }}
        />

        {/* Send button */}
        <button
          onClick={handleSubmit}
          style={{
            background: 'var(--color-primary, #6366f1)',
            border: 'none',
            borderRadius: 4,
            color: '#fff',
            cursor: 'pointer',
            fontSize: 12,
            padding: '4px 10px',
            flexShrink: 0,
          }}
        >
          Send
        </button>
      </div>
    </div>
  )
}
