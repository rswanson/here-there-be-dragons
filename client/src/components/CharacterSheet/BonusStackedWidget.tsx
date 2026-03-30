import { useState } from 'react'
import type { FieldDef } from '../../types/FieldDef'
import type { BonusEntry } from '../../types/BonusEntry'
import type { BonusTypeDef } from '../../types/BonusTypeDef'
import { AddBonusPopover } from './AddBonusPopover'

interface BonusStackedWidgetProps {
  field: FieldDef
  value: unknown
  bonuses: BonusEntry[]
  bonusTypes: BonusTypeDef[]
  onAddBonus: (fieldId: string, source: string, bonusType: string, value: number) => void
  onRemoveBonus: (bonusId: string) => void
  onUpdateBonus: (
    bonusId: string,
    updates: { source?: string; bonus_type?: string; value?: number },
  ) => void
}

/** Determine which bonus entries are suppressed (non-stacking, lower value) */
function getSuppressedIds(bonuses: BonusEntry[], bonusTypes: BonusTypeDef[]): Set<string> {
  const suppressed = new Set<string>()
  const typeMap = new Map(bonusTypes.map((bt) => [bt.id, bt]))

  // Group by bonus_type
  const groups = new Map<string, BonusEntry[]>()
  for (const b of bonuses) {
    const arr = groups.get(b.bonus_type) ?? []
    arr.push(b)
    groups.set(b.bonus_type, arr)
  }

  for (const [typeId, entries] of groups) {
    const def = typeMap.get(typeId)
    if (def && !def.stacks && entries.length > 1) {
      // Only the highest value is active; the rest are suppressed
      const sorted = [...entries].sort((a, b) => Number(b.value) - Number(a.value))
      for (let i = 1; i < sorted.length; i++) {
        suppressed.add(sorted[i].id)
      }
    }
  }

  return suppressed
}

const BONUS_COLORS: Record<string, string> = {
  enhancement: '#22c55e',
  deflection: '#3b82f6',
  natural_armor: '#a3e635',
  shield: '#60a5fa',
  armor: '#94a3b8',
  luck: '#facc15',
  morale: '#f97316',
  proficiency: '#a78bfa',
  sacred: '#fbbf24',
  insight: '#2dd4bf',
  competence: '#818cf8',
  circumstance: '#e879f9',
  untyped: '#9ca3af',
}

function bonusColor(typeId: string): string {
  return BONUS_COLORS[typeId] ?? '#9ca3af'
}

export function BonusStackedWidget({
  field,
  value,
  bonuses,
  bonusTypes,
  onAddBonus,
  onRemoveBonus,
  onUpdateBonus,
}: BonusStackedWidgetProps) {
  const [expanded, setExpanded] = useState(false)
  const [showAdd, setShowAdd] = useState(false)

  const suppressed = getSuppressedIds(bonuses, bonusTypes)
  const total = typeof value === 'number' ? value : Number(value) || 0

  const allowedBonusTypes =
    field.field_type.type === 'BonusStacked' ? field.field_type.config.allowed_bonus_types : []

  const typeNameMap = new Map(bonusTypes.map((bt) => [bt.id, bt.name]))

  return (
    <div>
      {/* Collapsed header */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        <span style={{ fontSize: 10, width: 12, textAlign: 'center' }}>
          {expanded ? '\u25BC' : '\u25B6'}
        </span>
        <span
          style={{
            flex: 1,
            color: 'var(--color-text-secondary)',
            fontSize: 11,
          }}
        >
          {field.name}
        </span>
        <span
          style={{
            fontWeight: 600,
            fontSize: 13,
            color: 'var(--color-text, #e0e0e0)',
            minWidth: 28,
            textAlign: 'right',
          }}
        >
          {total}
        </span>
      </div>

      {/* Expanded list */}
      {expanded && (
        <div style={{ marginTop: 4, marginLeft: 18, display: 'flex', flexDirection: 'column', gap: 3 }}>
          {bonuses.map((bonus) => {
            const isSuppressed = suppressed.has(bonus.id)
            return (
              <div
                key={bonus.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  opacity: isSuppressed ? 0.45 : 1,
                  textDecoration: isSuppressed ? 'line-through' : 'none',
                }}
              >
                {/* Source (editable) */}
                <input
                  type="text"
                  value={bonus.source}
                  onChange={(e) => onUpdateBonus(bonus.id, { source: e.target.value })}
                  style={{
                    flex: 1,
                    background: 'transparent',
                    border: 'none',
                    borderBottom: '1px dashed #475569',
                    color: 'var(--color-text, #e0e0e0)',
                    fontSize: 11,
                    padding: '1px 2px',
                    minWidth: 0,
                  }}
                />

                {/* Bonus type tag */}
                <span
                  style={{
                    background: bonusColor(bonus.bonus_type),
                    color: '#000',
                    fontSize: 9,
                    fontWeight: 600,
                    borderRadius: 3,
                    padding: '1px 4px',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {typeNameMap.get(bonus.bonus_type) ?? bonus.bonus_type}
                </span>

                {/* Value (editable) */}
                <input
                  type="number"
                  value={Number(bonus.value)}
                  onChange={(e) => onUpdateBonus(bonus.id, { value: Number(e.target.value) })}
                  style={{
                    width: 36,
                    background: 'transparent',
                    border: 'none',
                    borderBottom: '1px dashed #475569',
                    color: 'var(--color-text, #e0e0e0)',
                    fontSize: 11,
                    padding: '1px 2px',
                    textAlign: 'right',
                  }}
                />

                {/* Remove */}
                <button
                  onClick={() => onRemoveBonus(bonus.id)}
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
                  &times;
                </button>
              </div>
            )
          })}

          {/* Add bonus */}
          {!showAdd ? (
            <button
              onClick={() => setShowAdd(true)}
              style={{
                background: 'transparent',
                border: '1px dashed var(--color-border, #444)',
                borderRadius: 3,
                color: 'var(--color-primary, #6366f1)',
                cursor: 'pointer',
                fontSize: 10,
                padding: '3px 6px',
                alignSelf: 'flex-start',
                marginTop: 2,
              }}
            >
              + Add Bonus
            </button>
          ) : (
            <AddBonusPopover
              fieldId={field.id}
              bonusTypes={bonusTypes}
              allowedBonusTypes={allowedBonusTypes}
              onAdd={(fid, source, bt, val) => {
                onAddBonus(fid, source, bt, val)
                setShowAdd(false)
              }}
              onCancel={() => setShowAdd(false)}
            />
          )}
        </div>
      )}
    </div>
  )
}
