import { useCharacterStore } from '../state/characters'

interface CharacterListProps {
  campaignId: string
  onCreateClick: () => void
}

export function CharacterList({ campaignId: _campaignId, onCreateClick }: CharacterListProps) {
  const characters = useCharacterStore((s) => s.characters)
  const activeCharacterId = useCharacterStore((s) => s.activeCharacterId)
  const setActiveCharacter = useCharacterStore((s) => s.setActiveCharacter)

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 4,
        }}
      >
        <span
          style={{
            fontSize: 'var(--font-size-sm)',
            color: 'var(--color-text-secondary)',
            fontWeight: 600,
          }}
        >
          Characters
        </span>
        <button
          onClick={onCreateClick}
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
      </div>

      {characters.length === 0 ? (
        <p
          style={{
            fontSize: 11,
            color: 'var(--color-text-secondary)',
            margin: 0,
            padding: '4px 0',
          }}
        >
          No characters yet.
        </p>
      ) : (
        characters.map((character) => {
          const isActive = character.id === activeCharacterId
          return (
            <div
              key={character.id}
              onClick={() => setActiveCharacter(isActive ? null : character.id)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                padding: '6px 8px',
                borderRadius: 4,
                cursor: 'pointer',
                background: isActive
                  ? 'var(--color-primary, #6366f1)'
                  : 'var(--color-bg-surface, transparent)',
                border: isActive
                  ? '1px solid transparent'
                  : '1px solid var(--color-border, #444)',
                color: isActive ? '#fff' : 'var(--color-text, #e0e0e0)',
              }}
              role="button"
              tabIndex={0}
              aria-pressed={isActive}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  setActiveCharacter(isActive ? null : character.id)
                }
              }}
            >
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 500,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {character.name}
              </span>
              <span
                style={{
                  fontSize: 10,
                  color: isActive ? 'rgba(255,255,255,0.7)' : 'var(--color-text-secondary, #888)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {character.game_system_id}
              </span>
            </div>
          )
        })
      )}
    </div>
  )
}
