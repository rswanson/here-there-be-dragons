import { useEffect, useRef, useCallback } from 'react'
import { useCharacterStore } from '../state/characters'
import { gameSystemsApi } from '../api/game-systems'
import { wsClient } from '../api/ws'
import { SheetSection } from './CharacterSheet/SheetSection'

export function CharacterSheet() {
  const activeCharacterId = useCharacterStore((s) => s.activeCharacterId)
  const characters = useCharacterStore((s) => s.characters)
  const schemas = useCharacterStore((s) => s.schemas)
  const cacheSchema = useCharacterStore((s) => s.cacheSchema)
  const setActiveCharacter = useCharacterStore((s) => s.setActiveCharacter)

  const character = characters.find((c) => c.id === activeCharacterId) ?? null
  const schema = character ? schemas[character.game_system_id] : null

  // Fetch schema if not cached
  useEffect(() => {
    if (!character) return
    if (schemas[character.game_system_id]) return

    let cancelled = false
    gameSystemsApi.getSchema(character.game_system_id).then((s) => {
      if (!cancelled) cacheSchema(character.game_system_id, s)
    })
    return () => {
      cancelled = true
    }
  }, [character, schemas, cacheSchema])

  // Debounced field update
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingFields = useRef<Record<string, unknown>>({})

  const flushFields = useCallback(() => {
    if (!character) return
    const fields = pendingFields.current
    pendingFields.current = {}
    if (Object.keys(fields).length > 0) {
      wsClient.send({
        type: 'UpdateCharacterFields',
        payload: { character_id: character.id, fields },
      })
    }
  }, [character])

  const handleFieldChange = useCallback(
    (fieldId: string, value: unknown) => {
      pendingFields.current[fieldId] = value
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(flushFields, 300)
    },
    [flushFields],
  )

  // Flush on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
        flushFields()
      }
    }
  }, [flushFields])

  const handleAddBonus = useCallback(
    (fieldId: string, source: string, bonusType: string, value: number) => {
      if (!character) return
      wsClient.send({
        type: 'AddCharacterBonus',
        payload: {
          character_id: character.id,
          field_id: fieldId,
          source,
          bonus_type: bonusType,
          value: BigInt(value),
        },
      })
    },
    [character],
  )

  const handleRemoveBonus = useCallback(
    (bonusId: string) => {
      if (!character) return
      wsClient.send({
        type: 'RemoveCharacterBonus',
        payload: { character_id: character.id, bonus_id: bonusId },
      })
    },
    [character],
  )

  const handleUpdateBonus = useCallback(
    (bonusId: string, updates: { source?: string; bonus_type?: string; value?: number }) => {
      if (!character) return
      wsClient.send({
        type: 'UpdateCharacterBonus',
        payload: {
          character_id: character.id,
          bonus_id: bonusId,
          source: updates.source ?? null,
          bonus_type: updates.bonus_type ?? null,
          value: updates.value != null ? BigInt(updates.value) : null,
        },
      })
    },
    [character],
  )

  if (!character) return null

  return (
    <div
      style={{
        position: 'absolute',
        right: 0,
        top: 0,
        width: 360,
        maxHeight: '100vh',
        overflowY: 'auto',
        zIndex: 20,
        background: 'var(--color-surface, #2a2a3e)',
        borderLeft: '1px solid var(--color-border, #444)',
        padding: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        color: 'var(--color-text, #e0e0e0)',
        fontSize: 12,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <input
            type="text"
            value={character.name}
            onChange={(e) => handleFieldChange('__name__', e.target.value)}
            style={{
              background: 'transparent',
              border: 'none',
              borderBottom: '1px dashed #475569',
              color: 'var(--color-text, #e0e0e0)',
              fontSize: 16,
              fontWeight: 600,
              padding: '2px 0',
              width: '100%',
              outline: 'none',
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderBottom = '1px solid var(--color-primary, #6366f1)'
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderBottom = '1px dashed #475569'
            }}
          />
          <div
            style={{
              color: 'var(--color-text-secondary)',
              fontSize: 10,
              marginTop: 2,
            }}
          >
            {character.game_system_id}
          </div>
        </div>
        <button
          onClick={() => setActiveCharacter(null)}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--color-text-secondary)',
            cursor: 'pointer',
            fontSize: 18,
            padding: '0 4px',
            lineHeight: 1,
          }}
          aria-label="Close character sheet"
        >
          &times;
        </button>
      </div>

      {/* Sections */}
      {schema ? (
        schema.sections.map((section) => (
          <SheetSection
            key={section.id}
            section={section}
            fields={character.fields as Record<string, unknown>}
            bonuses={character.bonuses as Record<string, Array<import('../types/BonusEntry').BonusEntry>>}
            bonusTypes={schema.bonus_types}
            onChange={handleFieldChange}
            onAddBonus={handleAddBonus}
            onRemoveBonus={handleRemoveBonus}
            onUpdateBonus={handleUpdateBonus}
          />
        ))
      ) : (
        <div style={{ color: 'var(--color-text-secondary)', fontSize: 11, textAlign: 'center', padding: 20 }}>
          Loading schema...
        </div>
      )}
    </div>
  )
}
