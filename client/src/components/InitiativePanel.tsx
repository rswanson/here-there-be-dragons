import { useState } from 'react'
import { useInitiativeStore } from '../state/initiative'
import { useCharacterStore } from '../state/characters'
import { useSessionStore } from '../state/session'
import { usePresenceStore } from '../state/presence'
import { wsClient } from '../api/ws'

const inputStyle: React.CSSProperties = {
  padding: '3px 5px',
  borderRadius: 4,
  border: '1px solid var(--color-border, #444)',
  background: 'var(--color-bg, #1a1a2e)',
  color: 'var(--color-text, #e0e0e0)',
  fontSize: 11,
  width: '100%',
  boxSizing: 'border-box',
}

const btnStyle: React.CSSProperties = {
  padding: '3px 7px',
  border: 'none',
  borderRadius: 4,
  cursor: 'pointer',
  fontSize: 11,
  background: 'var(--color-primary, #6366f1)',
  color: '#fff',
}

const ghostBtnStyle: React.CSSProperties = {
  padding: '3px 7px',
  border: '1px solid var(--color-border, #444)',
  borderRadius: 4,
  cursor: 'pointer',
  fontSize: 11,
  background: 'transparent',
  color: 'var(--color-text-secondary, #888)',
}

const dangerBtnStyle: React.CSSProperties = {
  padding: '3px 7px',
  border: 'none',
  borderRadius: 4,
  cursor: 'pointer',
  fontSize: 11,
  background: 'transparent',
  color: '#f87171',
}

export function InitiativePanel() {
  const encounter = useInitiativeStore((s) => s.encounter)
  const characters = useCharacterStore((s) => s.characters)
  const user = useSessionStore((s) => s.user)
  const connectedUsers = usePresenceStore((s) => s.connectedUsers)

  const [showAddForm, setShowAddForm] = useState(false)
  const [addName, setAddName] = useState('')
  const [addValue, setAddValue] = useState('')
  const [addCharId, setAddCharId] = useState<string>('')
  const [editValues, setEditValues] = useState<Record<string, string>>({})

  if (!encounter) return null

  // Determine if current user is DM
  const myRole =
    user
      ? connectedUsers.find((u) => u.user_id === user.id)?.role
      : undefined
  const isDm = myRole === 'dm'

  const sorted = [...encounter.combatants].sort(
    (a, b) => a.sort_order - b.sort_order,
  )

  const handleNextTurn = () => {
    wsClient.send({ type: 'NextTurn', payload: { encounter_id: encounter.id } })
  }

  const handlePrevTurn = () => {
    wsClient.send({
      type: 'PreviousTurn',
      payload: { encounter_id: encounter.id },
    })
  }

  const handleRollAll = () => {
    wsClient.send({
      type: 'RollAllInitiative',
      payload: { encounter_id: encounter.id },
    })
  }

  const handleEndEncounter = () => {
    if (!window.confirm('End this encounter?')) return
    wsClient.send({
      type: 'EndEncounter',
      payload: { encounter_id: encounter.id },
    })
  }

  const handleRemoveCombatant = (combatantId: string) => {
    wsClient.send({
      type: 'RemoveCombatant',
      payload: { combatant_id: combatantId },
    })
  }

  const handleUpdateInitiative = (combatantId: string) => {
    const raw = editValues[combatantId]
    if (raw === undefined || raw === '') return
    const value = parseInt(raw, 10)
    if (isNaN(value)) return
    wsClient.send({
      type: 'UpdateCombatantInitiative',
      payload: { combatant_id: combatantId, initiative_value: value },
    })
    setEditValues((prev) => {
      const next = { ...prev }
      delete next[combatantId]
      return next
    })
  }

  const handleAddCombatant = () => {
    const nameVal = addCharId
      ? (characters.find((c) => c.id === addCharId)?.name ?? addName.trim())
      : addName.trim()
    const initVal = parseInt(addValue, 10)
    if (!nameVal || isNaN(initVal)) return
    wsClient.send({
      type: 'AddCombatant',
      payload: {
        encounter_id: encounter.id,
        character_id: addCharId || null,
        name: nameVal,
        initiative_value: initVal,
      },
    })
    setAddName('')
    setAddValue('')
    setAddCharId('')
    setShowAddForm(false)
  }

  return (
    <div
      style={{
        position: 'absolute',
        left: 8,
        top: 48,
        width: 200,
        background: 'var(--color-surface, #2a2a3e)',
        borderRadius: 8,
        padding: 8,
        zIndex: 10,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        maxHeight: 'calc(100% - 60px)',
        overflowY: 'auto',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingBottom: 4,
          borderBottom: '1px solid var(--color-border, #444)',
          flexShrink: 0,
        }}
      >
        <h3
          style={{
            margin: 0,
            fontSize: 12,
            color: 'var(--color-text, #e0e0e0)',
          }}
        >
          Initiative — Round {encounter.round_number}
        </h3>
        {isDm && (
          <button
            onClick={handleEndEncounter}
            title="End encounter"
            style={{
              ...dangerBtnStyle,
              padding: '2px 5px',
              fontSize: 10,
            }}
          >
            End
          </button>
        )}
      </div>

      {/* Combatant list */}
      {sorted.map((combatant, index) => {
        const isCurrentTurn = index === encounter.current_turn_index
        const editVal = editValues[combatant.id]

        return (
          <div
            key={combatant.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '4px 6px',
              borderRadius: 4,
              background: isCurrentTurn
                ? 'var(--color-primary, #6366f1)'
                : 'transparent',
              color: isCurrentTurn
                ? '#fff'
                : 'var(--color-text, #e0e0e0)',
            }}
          >
            <span
              style={{
                flex: 1,
                fontSize: 12,
                fontWeight: isCurrentTurn ? 700 : 400,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {combatant.name}
            </span>

            {isDm ? (
              <>
                <input
                  type="number"
                  value={editVal !== undefined ? editVal : combatant.initiative_value}
                  onChange={(e) =>
                    setEditValues((prev) => ({
                      ...prev,
                      [combatant.id]: e.target.value,
                    }))
                  }
                  onBlur={() => handleUpdateInitiative(combatant.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleUpdateInitiative(combatant.id)
                  }}
                  style={{
                    ...inputStyle,
                    width: 36,
                    textAlign: 'center',
                    padding: '2px 3px',
                  }}
                />
                <button
                  onClick={() => handleRemoveCombatant(combatant.id)}
                  title="Remove combatant"
                  style={{
                    ...dangerBtnStyle,
                    padding: '2px 4px',
                    fontSize: 11,
                    color: isCurrentTurn ? '#fca5a5' : '#f87171',
                  }}
                >
                  ×
                </button>
              </>
            ) : (
              <span
                style={{
                  fontSize: 12,
                  color: isCurrentTurn
                    ? 'rgba(255,255,255,0.8)'
                    : 'var(--color-text-secondary, #888)',
                  minWidth: 20,
                  textAlign: 'right',
                }}
              >
                {combatant.initiative_value}
              </span>
            )}
          </div>
        )
      })}

      {/* Footer — DM only */}
      {isDm && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            paddingTop: 4,
            borderTop: '1px solid var(--color-border, #444)',
            flexShrink: 0,
          }}
        >
          {/* Navigation + actions */}
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={handlePrevTurn} style={ghostBtnStyle} title="Previous turn">
              Prev
            </button>
            <button onClick={handleNextTurn} style={{ ...btnStyle, flex: 1 }} title="Next turn">
              Next
            </button>
          </div>

          <div style={{ display: 'flex', gap: 4 }}>
            <button
              onClick={handleRollAll}
              style={{ ...ghostBtnStyle, flex: 1 }}
              title="Roll all initiative"
            >
              Roll All
            </button>
            {!showAddForm && (
              <button
                onClick={() => setShowAddForm(true)}
                style={{ ...ghostBtnStyle, flex: 1 }}
                title="Add combatant"
              >
                + Add
              </button>
            )}
          </div>

          {/* Inline add form */}
          {showAddForm && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {characters.length > 0 && (
                <select
                  value={addCharId}
                  onChange={(e) => {
                    setAddCharId(e.target.value)
                    if (e.target.value) {
                      const char = characters.find((c) => c.id === e.target.value)
                      if (char) setAddName(char.name)
                    }
                  }}
                  style={{ ...inputStyle }}
                >
                  <option value="">— manual entry —</option>
                  {characters.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
              {!addCharId && (
                <input
                  type="text"
                  placeholder="Name"
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                  style={inputStyle}
                  autoFocus
                />
              )}
              <input
                type="number"
                placeholder="Initiative"
                value={addValue}
                onChange={(e) => setAddValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddCombatant()
                  if (e.key === 'Escape') setShowAddForm(false)
                }}
                style={inputStyle}
              />
              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  onClick={handleAddCombatant}
                  disabled={(!addCharId && !addName.trim()) || !addValue}
                  style={{
                    ...btnStyle,
                    flex: 1,
                    opacity: (!addCharId && !addName.trim()) || !addValue ? 0.5 : 1,
                  }}
                >
                  Add
                </button>
                <button
                  onClick={() => {
                    setShowAddForm(false)
                    setAddName('')
                    setAddValue('')
                    setAddCharId('')
                  }}
                  style={ghostBtnStyle}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
