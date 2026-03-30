import { useState } from 'react'
import type { BonusTypeDef } from '../../types/BonusTypeDef'

interface AddBonusPopoverProps {
  fieldId: string
  bonusTypes: BonusTypeDef[]
  allowedBonusTypes: string[]
  onAdd: (fieldId: string, source: string, bonusType: string, value: number) => void
  onCancel: () => void
}

export function AddBonusPopover({
  fieldId,
  bonusTypes,
  allowedBonusTypes,
  onAdd,
  onCancel,
}: AddBonusPopoverProps) {
  const filtered = bonusTypes.filter((bt) => allowedBonusTypes.includes(bt.id))
  const [source, setSource] = useState('')
  const [bonusType, setBonusType] = useState(filtered[0]?.id ?? '')
  const [value, setValue] = useState(0)

  const handleSubmit = () => {
    if (!source.trim() || !bonusType) return
    onAdd(fieldId, source.trim(), bonusType, value)
  }

  return (
    <div
      style={{
        background: 'var(--color-bg, #1a1a2e)',
        border: '1px solid var(--color-border, #444)',
        borderRadius: 6,
        padding: 8,
        marginTop: 4,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ color: 'var(--color-text-secondary)', fontSize: 10 }}>Source</span>
        <input
          type="text"
          value={source}
          onChange={(e) => setSource(e.target.value)}
          placeholder="e.g. Ring of Protection"
          style={{
            background: 'transparent',
            border: '1px solid var(--color-border, #444)',
            borderRadius: 3,
            color: 'var(--color-text, #e0e0e0)',
            padding: '3px 5px',
            fontSize: 11,
          }}
        />
      </label>

      <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ color: 'var(--color-text-secondary)', fontSize: 10 }}>Type</span>
        <select
          value={bonusType}
          onChange={(e) => setBonusType(e.target.value)}
          style={{
            background: 'var(--color-bg, #1a1a2e)',
            border: '1px solid var(--color-border, #444)',
            borderRadius: 3,
            color: 'var(--color-text, #e0e0e0)',
            padding: '3px 5px',
            fontSize: 11,
          }}
        >
          {filtered.map((bt) => (
            <option key={bt.id} value={bt.id}>
              {bt.name}
            </option>
          ))}
        </select>
      </label>

      <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ color: 'var(--color-text-secondary)', fontSize: 10 }}>Value</span>
        <input
          type="number"
          value={value}
          onChange={(e) => setValue(Number(e.target.value))}
          style={{
            background: 'transparent',
            border: '1px solid var(--color-border, #444)',
            borderRadius: 3,
            color: 'var(--color-text, #e0e0e0)',
            padding: '3px 5px',
            fontSize: 11,
            width: 60,
          }}
        />
      </label>

      <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
        <button
          onClick={onCancel}
          style={{
            background: 'transparent',
            border: '1px solid var(--color-border, #444)',
            borderRadius: 3,
            color: 'var(--color-text, #e0e0e0)',
            cursor: 'pointer',
            fontSize: 11,
            padding: '3px 8px',
          }}
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={!source.trim() || !bonusType}
          style={{
            background: 'var(--color-primary, #6366f1)',
            border: 'none',
            borderRadius: 3,
            color: '#fff',
            cursor: !source.trim() || !bonusType ? 'not-allowed' : 'pointer',
            fontSize: 11,
            padding: '3px 8px',
            opacity: !source.trim() || !bonusType ? 0.5 : 1,
          }}
        >
          Add
        </button>
      </div>
    </div>
  )
}
