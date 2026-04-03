import { useEffect } from 'react'
import { useHandoutStore } from '../state/handouts'
import { useSessionStore } from '../state/session'
import { usePresenceStore } from '../state/presence'
import { handoutsApi } from '../api/handouts'
import type { HandoutVisibility } from '../types/HandoutVisibility'
import { HandoutEditor } from './HandoutEditor'
import type { UpdateHandoutRequest } from '../types/UpdateHandoutRequest'

interface DocsTabProps {
  campaignId: string
}

const visibilityBadgeColors: Record<HandoutVisibility, string> = {
  everyone: '#22c55e',
  dm_only: '#f59e0b',
  specific_players: '#3b82f6',
}

const visibilityLabels: Record<HandoutVisibility, string> = {
  everyone: 'Everyone',
  dm_only: 'DM Only',
  specific_players: 'Players',
}

export function DocsTab({ campaignId }: DocsTabProps) {
  const handouts = useHandoutStore((s) => s.handouts)
  const activeHandout = useHandoutStore((s) => s.activeHandout)
  const setActiveHandout = useHandoutStore((s) => s.setActiveHandout)
  const loadHandouts = useHandoutStore((s) => s.loadHandouts)
  const handleHandoutCreated = useHandoutStore((s) => s.handleHandoutCreated)
  const handleHandoutDeleted = useHandoutStore((s) => s.handleHandoutDeleted)
  const handleHandoutUpdated = useHandoutStore((s) => s.handleHandoutUpdated)

  const currentUser = useSessionStore((s) => s.user)
  const connectedUsers = usePresenceStore((s) => s.connectedUsers)

  // Determine if current user is DM from presence data
  const isDm = currentUser
    ? connectedUsers.some((u) => u.user_id === currentUser.id && u.role === 'dm')
    : false

  useEffect(() => {
    handoutsApi.list(campaignId).then((fullHandouts) => {
      // API returns Handout[] — extract summaries for the store
      loadHandouts(
        fullHandouts.map(({ id, title, visibility, player_ids, updated_at }) => ({
          id,
          title,
          visibility,
          player_ids,
          updated_at,
        })),
      )
    })
  }, [campaignId, loadHandouts])

  const handleClickHandout = async (id: string) => {
    const handout = await handoutsApi.get(id)
    setActiveHandout(handout)
  }

  const handleNewHandout = async () => {
    const handout = await handoutsApi.create(campaignId, {
      title: 'Untitled',
      content: '',
      visibility: 'dm_only',
      player_ids: [],
    })
    handleHandoutCreated({
      id: handout.id,
      title: handout.title,
      visibility: handout.visibility,
      player_ids: handout.player_ids,
      updated_at: handout.updated_at,
    })
    setActiveHandout(handout)
  }

  const handleSave = async (updates: UpdateHandoutRequest) => {
    if (!activeHandout) return
    const updated = await handoutsApi.update(activeHandout.id, updates)
    handleHandoutUpdated({
      id: updated.id,
      title: updated.title,
      visibility: updated.visibility,
      player_ids: updated.player_ids,
      updated_at: updated.updated_at,
    })
    setActiveHandout(updated)
  }

  const handleDelete = async () => {
    if (!activeHandout) return
    await handoutsApi.delete(activeHandout.id)
    handleHandoutDeleted(activeHandout.id)
    setActiveHandout(null)
  }

  const handleBack = () => {
    setActiveHandout(null)
  }

  // Detail view
  if (activeHandout) {
    if (isDm) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <HandoutEditor handout={activeHandout} onSave={handleSave} onBack={handleBack} />
          <div style={{ padding: '0 12px 12px', flexShrink: 0 }}>
            <button
              onClick={handleDelete}
              style={{
                background: 'transparent',
                border: '1px solid var(--color-danger, #ef4444)',
                borderRadius: 4,
                color: 'var(--color-danger, #ef4444)',
                cursor: 'pointer',
                fontSize: 11,
                padding: '4px 12px',
                width: '100%',
              }}
            >
              Delete Handout
            </button>
          </div>
        </div>
      )
    }

    // Player view: read-only rendered markdown
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexShrink: 0 }}>
          <button
            onClick={handleBack}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--color-text-secondary)',
              cursor: 'pointer',
              fontSize: 'var(--font-size-sm)',
              padding: 0,
            }}
          >
            &larr; Back
          </button>
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--color-text)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {activeHandout.title}
          </span>
        </div>
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            color: 'var(--color-text)',
            fontSize: 12,
            lineHeight: 1.6,
          }}
          dangerouslySetInnerHTML={{ __html: renderPreview(activeHandout.content) }}
        />
      </div>
    )
  }

  // List view
  return (
    <div style={{ display: 'flex', flexDirection: 'column', padding: 12, gap: 8 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontSize: 'var(--font-size-sm)',
            color: 'var(--color-text-secondary)',
            fontWeight: 600,
          }}
        >
          Handouts
        </span>
        {isDm && (
          <button
            onClick={handleNewHandout}
            style={{
              background: 'transparent',
              border: '1px solid var(--color-border, #444)',
              borderRadius: 4,
              color: 'var(--color-text)',
              cursor: 'pointer',
              fontSize: 11,
              padding: '2px 8px',
            }}
          >
            + New
          </button>
        )}
      </div>

      {handouts.length === 0 ? (
        <p
          style={{
            fontSize: 11,
            color: 'var(--color-text-secondary)',
            margin: 0,
            padding: '4px 0',
          }}
        >
          No handouts yet.
        </p>
      ) : (
        handouts.map((handout) => (
          <div
            key={handout.id}
            onClick={() => handleClickHandout(handout.id)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                void handleClickHandout(handout.id)
              }
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '6px 8px',
              borderRadius: 4,
              cursor: 'pointer',
              background: 'var(--color-bg-surface, transparent)',
              border: '1px solid var(--color-border, #444)',
              color: 'var(--color-text, #e0e0e0)',
            }}
          >
            <span
              style={{
                fontSize: 12,
                fontWeight: 500,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                flex: 1,
              }}
            >
              {handout.title}
            </span>
            <span
              style={{
                fontSize: 10,
                color: '#000',
                background: visibilityBadgeColors[handout.visibility],
                borderRadius: 3,
                padding: '1px 5px',
                marginLeft: 6,
                flexShrink: 0,
                fontWeight: 600,
              }}
            >
              {visibilityLabels[handout.visibility]}
            </span>
          </div>
        ))
      )}
    </div>
  )
}

// Simple inline markdown renderer for read-only player view (same logic as HandoutEditor)
function renderPreview(md: string): string {
  const blocks = md.split(/\n\n+/)
  return blocks
    .map((block) => {
      const fullHeadingMatch = block.match(/^(#{1,6})\s+(.+)$/)
      if (fullHeadingMatch) {
        const level = fullHeadingMatch[1].length
        return `<h${level}>${applyInline(fullHeadingMatch[2])}</h${level}>`
      }

      const lines = block.split('\n')
      if (lines.every((l) => l.match(/^-\s/))) {
        const items = lines.map((l) => `<li>${applyInline(l.replace(/^-\s/, ''))}</li>`).join('')
        return `<ul>${items}</ul>`
      }

      return `<p>${lines.map((l) => applyInline(l)).join('<br />')}</p>`
    })
    .join('\n')
}

function applyInline(text: string): string {
  return text
    .replace(/!\[([^\]]*)\]\(asset:([^)]+)\)/g, '<img src="/api/assets/$2" alt="$1" style="max-width:100%" />')
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" style="max-width:100%" />')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
}
