import { useState, useEffect } from 'react'
import { useTokenStore } from '../state/tokens'
import { tokensApi } from '../api/tokens'
import type { Token } from '../types/Token'
import type { TokenBar } from '../types/TokenBar'
import type { BarVisibility } from '../types/BarVisibility'

const STATUS_CONDITIONS = [
  'blinded',
  'charmed',
  'deafened',
  'exhaustion',
  'frightened',
  'grappled',
  'incapacitated',
  'invisible',
  'paralyzed',
  'petrified',
  'poisoned',
  'prone',
  'restrained',
  'stunned',
  'unconscious',
]

const BAR_VISIBILITY_OPTIONS: { value: BarVisibility; label: string }[] = [
  { value: 'everyone', label: 'Everyone' },
  { value: 'owner_and_dm', label: 'Owner & DM' },
  { value: 'dm_only', label: 'DM Only' },
]

interface LocalBar extends TokenBar {
  currentStr: string
  maxStr: string
}

function tokenBarToLocal(bar: TokenBar): LocalBar {
  return { ...bar, currentStr: String(bar.current), maxStr: String(bar.max) }
}

function localBarToTokenBar(bar: LocalBar): TokenBar {
  return {
    label: bar.label,
    current: Number(bar.currentStr) || 0,
    max: Number(bar.maxStr) || 0,
    color: bar.color,
    visibility: bar.visibility,
  }
}

interface TokenInspectorFormProps {
  token: Token
}

function TokenInspectorForm({ token }: TokenInspectorFormProps) {
  const updateToken = useTokenStore((s) => s.updateToken)
  const removeToken = useTokenStore((s) => s.removeToken)

  const [name, setName] = useState(token.name)
  const [size, setSize] = useState(token.size)
  const [bars, setBars] = useState<LocalBar[]>(token.bars.map(tokenBarToLocal))
  const [statusMarkers, setStatusMarkers] = useState<string[]>(token.status_markers)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setName(token.name)
    setSize(token.size)
    setBars(token.bars.map(tokenBarToLocal))
    setStatusMarkers(token.status_markers)
    setError(null)
  }, [token.id, token.name, token.size, token.bars, token.status_markers])

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      const updated = await tokensApi.update(token.id, {
        name,
        asset_id: token.asset_id,
        owner_id: token.owner_id,
        x: token.x,
        y: token.y,
        size,
        rotation: token.rotation,
        bars: bars.map(localBarToTokenBar),
        status_markers: statusMarkers,
      })
      updateToken(token.id, updated)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    try {
      await tokensApi.delete(token.id)
      removeToken(token.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed')
    }
  }

  const addBar = () => {
    setBars((prev) => [
      ...prev,
      { label: 'HP', current: 10, max: 10, color: '#22c55e', visibility: 'everyone', currentStr: '10', maxStr: '10' },
    ])
  }

  const removeBar = (index: number) => {
    setBars((prev) => prev.filter((_, i) => i !== index))
  }

  const updateBar = (index: number, patch: Partial<LocalBar>) => {
    setBars((prev) => prev.map((bar, i) => (i === index ? { ...bar, ...patch } : bar)))
  }

  const toggleStatus = (condition: string) => {
    setStatusMarkers((prev) =>
      prev.includes(condition) ? prev.filter((s) => s !== condition) : [...prev, condition],
    )
  }

  return (
    <div
      style={{
        position: 'absolute',
        right: 8,
        top: '50%',
        transform: 'translateY(-50%)',
        width: 240,
        maxHeight: '80vh',
        overflowY: 'auto',
        background: 'var(--color-surface, #2a2a3e)',
        borderRadius: 8,
        padding: 12,
        zIndex: 10,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        color: 'var(--color-text, #e0e0e0)',
        fontSize: 12,
      }}
    >
      <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Token</h3>

      {/* Name */}
      <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span style={{ color: 'var(--color-text-secondary)', fontSize: 11 }}>Name</span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{
            background: 'var(--color-bg, #1a1a2e)',
            border: '1px solid var(--color-border, #444)',
            borderRadius: 4,
            color: 'var(--color-text, #e0e0e0)',
            padding: '4px 6px',
            fontSize: 12,
          }}
        />
      </label>

      {/* Position (read-only) */}
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <span style={{ color: 'var(--color-text-secondary)', fontSize: 11 }}>X</span>
          <div
            style={{
              background: 'var(--color-bg, #1a1a2e)',
              border: '1px solid var(--color-border, #444)',
              borderRadius: 4,
              padding: '4px 6px',
              marginTop: 3,
            }}
          >
            {token.x}
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <span style={{ color: 'var(--color-text-secondary)', fontSize: 11 }}>Y</span>
          <div
            style={{
              background: 'var(--color-bg, #1a1a2e)',
              border: '1px solid var(--color-border, #444)',
              borderRadius: 4,
              padding: '4px 6px',
              marginTop: 3,
            }}
          >
            {token.y}
          </div>
        </div>
      </div>

      {/* Size */}
      <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span style={{ color: 'var(--color-text-secondary)', fontSize: 11 }}>Size</span>
        <select
          value={size}
          onChange={(e) => setSize(Number(e.target.value))}
          style={{
            background: 'var(--color-bg, #1a1a2e)',
            border: '1px solid var(--color-border, #444)',
            borderRadius: 4,
            color: 'var(--color-text, #e0e0e0)',
            padding: '4px 6px',
            fontSize: 12,
          }}
        >
          <option value={1}>1×1 (Tiny/Small/Medium)</option>
          <option value={2}>2×2 (Large)</option>
          <option value={3}>3×3 (Huge)</option>
          <option value={4}>4×4 (Gargantuan)</option>
        </select>
      </label>

      {/* Bars */}
      <div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 4,
          }}
        >
          <span style={{ color: 'var(--color-text-secondary)', fontSize: 11 }}>Bars</span>
          <button
            onClick={addBar}
            style={{
              background: 'transparent',
              border: '1px solid var(--color-border, #444)',
              borderRadius: 3,
              color: 'var(--color-text, #e0e0e0)',
              cursor: 'pointer',
              fontSize: 11,
              padding: '2px 6px',
            }}
          >
            + Add
          </button>
        </div>
        {bars.map((bar, i) => (
          <div
            key={i}
            style={{
              background: 'var(--color-bg, #1a1a2e)',
              border: '1px solid var(--color-border, #444)',
              borderRadius: 4,
              padding: 6,
              marginBottom: 4,
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <input
                type="text"
                value={bar.label}
                onChange={(e) => updateBar(i, { label: e.target.value })}
                placeholder="Label"
                style={{
                  flex: 1,
                  background: 'transparent',
                  border: '1px solid var(--color-border, #444)',
                  borderRadius: 3,
                  color: 'var(--color-text, #e0e0e0)',
                  padding: '2px 4px',
                  fontSize: 11,
                }}
              />
              <input
                type="color"
                value={bar.color}
                onChange={(e) => updateBar(i, { color: e.target.value })}
                style={{ width: 22, height: 22, border: 'none', cursor: 'pointer', padding: 0 }}
              />
              <button
                onClick={() => removeBar(i)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--color-text-secondary)',
                  cursor: 'pointer',
                  fontSize: 13,
                  padding: '0 2px',
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <input
                type="number"
                value={bar.currentStr}
                onChange={(e) => updateBar(i, { currentStr: e.target.value })}
                placeholder="Current"
                style={{
                  flex: 1,
                  background: 'transparent',
                  border: '1px solid var(--color-border, #444)',
                  borderRadius: 3,
                  color: 'var(--color-text, #e0e0e0)',
                  padding: '2px 4px',
                  fontSize: 11,
                }}
              />
              <span style={{ color: 'var(--color-text-secondary)' }}>/</span>
              <input
                type="number"
                value={bar.maxStr}
                onChange={(e) => updateBar(i, { maxStr: e.target.value })}
                placeholder="Max"
                style={{
                  flex: 1,
                  background: 'transparent',
                  border: '1px solid var(--color-border, #444)',
                  borderRadius: 3,
                  color: 'var(--color-text, #e0e0e0)',
                  padding: '2px 4px',
                  fontSize: 11,
                }}
              />
            </div>
            <select
              value={bar.visibility}
              onChange={(e) => updateBar(i, { visibility: e.target.value as BarVisibility })}
              style={{
                background: 'var(--color-bg, #1a1a2e)',
                border: '1px solid var(--color-border, #444)',
                borderRadius: 3,
                color: 'var(--color-text, #e0e0e0)',
                padding: '2px 4px',
                fontSize: 11,
              }}
            >
              {BAR_VISIBILITY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>

      {/* Status Markers */}
      <div>
        <span style={{ color: 'var(--color-text-secondary)', fontSize: 11, display: 'block', marginBottom: 4 }}>
          Conditions
        </span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
          {STATUS_CONDITIONS.map((condition) => {
            const active = statusMarkers.includes(condition)
            return (
              <button
                key={condition}
                onClick={() => toggleStatus(condition)}
                style={{
                  background: active ? 'var(--color-primary, #6366f1)' : 'transparent',
                  border: '1px solid var(--color-border, #444)',
                  borderRadius: 3,
                  color: active ? '#fff' : 'var(--color-text, #e0e0e0)',
                  cursor: 'pointer',
                  fontSize: 10,
                  padding: '2px 5px',
                  textTransform: 'capitalize',
                }}
              >
                {condition}
              </button>
            )
          })}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{ color: '#f87171', fontSize: 11 }}>{error}</div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            flex: 1,
            background: 'var(--color-primary, #6366f1)',
            border: 'none',
            borderRadius: 4,
            color: '#fff',
            cursor: saving ? 'not-allowed' : 'pointer',
            fontSize: 12,
            padding: '6px 0',
            opacity: saving ? 0.7 : 1,
          }}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          onClick={handleDelete}
          style={{
            background: 'transparent',
            border: '1px solid #f87171',
            borderRadius: 4,
            color: '#f87171',
            cursor: 'pointer',
            fontSize: 12,
            padding: '6px 10px',
          }}
        >
          Delete
        </button>
      </div>
    </div>
  )
}

export function TokenInspector() {
  const tokens = useTokenStore((s) => s.tokens)
  const selectedIds = useTokenStore((s) => s.selectedIds)

  const selectedToken: Token | null =
    selectedIds.length === 1 ? (tokens.find((t) => t.id === selectedIds[0]) ?? null) : null

  if (!selectedToken) return null

  return <TokenInspectorForm key={selectedToken.id} token={selectedToken} />
}
