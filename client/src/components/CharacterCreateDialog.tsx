import { useState, useEffect } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { charactersApi } from '../api/characters'
import { gameSystemsApi } from '../api/game-systems'
import { useCharacterStore } from '../state/characters'
import type { GameSystemInfo } from '../types/GameSystemInfo'

interface CharacterCreateDialogProps {
  campaignId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CharacterCreateDialog({ campaignId, open, onOpenChange }: CharacterCreateDialogProps) {
  const [name, setName] = useState('')
  const [gameSystemId, setGameSystemId] = useState('')
  const [gameSystems, setGameSystems] = useState<GameSystemInfo[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [nameError, setNameError] = useState(false)

  useEffect(() => {
    if (!open) return
    gameSystemsApi.list().then((systems) => {
      setGameSystems(systems)
      if (systems.length > 0 && !gameSystemId) {
        setGameSystemId(systems[0].id)
      }
    })
  }, [open, gameSystemId])

  const handleSubmit = async () => {
    if (!name.trim()) {
      setNameError(true)
      return
    }
    if (!gameSystemId) return
    setSubmitting(true)
    try {
      const character = await charactersApi.create(campaignId, {
        game_system_id: gameSystemId,
        name: name.trim(),
        portrait_asset_id: null,
      })
      useCharacterStore.getState().addCharacter(character)
      useCharacterStore.getState().setActiveCharacter(character.id)
      setName('')
      setNameError(false)
      onOpenChange(false)
    } finally {
      setSubmitting(false)
    }
  }

  const inputStyle = {
    width: '100%',
    padding: '6px 8px',
    background: 'var(--color-bg, #1a1a2e)',
    border: '1px solid var(--color-border, #444)',
    borderRadius: 4,
    color: 'var(--color-text, #e0e0e0)',
    fontSize: 'var(--font-size-sm)',
    boxSizing: 'border-box' as const,
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
          }}
        />
        <Dialog.Content
          aria-describedby={undefined}
          style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'var(--color-bg-elevated)',
            borderRadius: 'var(--radius-lg)',
            padding: 'var(--space-lg)',
            width: 400,
            maxWidth: '90vw',
          }}
        >
          <Dialog.Title
            style={{ fontSize: 'var(--font-size-xl)', marginBottom: 'var(--space-md)', margin: '0 0 16px' }}
          >
            New Character
          </Dialog.Title>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Game System */}
            <div>
              <label
                htmlFor="char-game-system"
                style={{
                  display: 'block',
                  fontSize: 'var(--font-size-sm)',
                  color: 'var(--color-text-secondary)',
                  marginBottom: 4,
                }}
              >
                Game System
              </label>
              <select
                id="char-game-system"
                value={gameSystemId}
                onChange={(e) => setGameSystemId(e.target.value)}
                style={inputStyle}
              >
                {gameSystems.length === 0 && (
                  <option value="">Loading...</option>
                )}
                {gameSystems.map((gs) => (
                  <option key={gs.id} value={gs.id}>
                    {gs.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Character Name */}
            <div>
              <label
                htmlFor="char-name"
                style={{
                  display: 'block',
                  fontSize: 'var(--font-size-sm)',
                  color: 'var(--color-text-secondary)',
                  marginBottom: 4,
                }}
              >
                Name <span style={{ color: 'var(--color-error, #f87171)' }}>*</span>
              </label>
              <input
                id="char-name"
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value)
                  if (e.target.value.trim()) setNameError(false)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleSubmit()
                }}
                placeholder="Character name"
                style={{
                  ...inputStyle,
                  border: nameError
                    ? '1px solid var(--color-error, #f87171)'
                    : '1px solid var(--color-border, #444)',
                }}
                autoFocus
              />
              {nameError && (
                <p style={{ color: 'var(--color-error, #f87171)', fontSize: 11, margin: '4px 0 0' }}>
                  Name is required.
                </p>
              )}
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
              <Dialog.Close asChild>
                <button
                  style={{
                    padding: '6px 16px',
                    border: '1px solid var(--color-border, #444)',
                    borderRadius: 4,
                    cursor: 'pointer',
                    fontSize: 'var(--font-size-sm)',
                    background: 'transparent',
                    color: 'var(--color-text-secondary)',
                  }}
                >
                  Cancel
                </button>
              </Dialog.Close>
              <button
                onClick={() => void handleSubmit()}
                disabled={submitting || !gameSystemId}
                style={{
                  padding: '6px 16px',
                  border: 'none',
                  borderRadius: 4,
                  cursor: submitting || !gameSystemId ? 'not-allowed' : 'pointer',
                  fontSize: 'var(--font-size-sm)',
                  background: 'var(--color-primary, #6366f1)',
                  color: '#fff',
                  opacity: submitting || !gameSystemId ? 0.5 : 1,
                }}
              >
                {submitting ? 'Creating…' : 'Create'}
              </button>
            </div>
          </div>

          <Dialog.Close asChild>
            <button
              aria-label="Close"
              style={{
                position: 'absolute',
                top: 'var(--space-sm)',
                right: 'var(--space-sm)',
                background: 'none',
                border: 'none',
                color: 'var(--color-text-primary)',
                fontSize: 'var(--font-size-lg)',
                cursor: 'pointer',
              }}
            >
              &times;
            </button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
