import type { FieldDef } from '../../types/FieldDef'
import type { BonusEntry } from '../../types/BonusEntry'
import type { BonusTypeDef } from '../../types/BonusTypeDef'
import { BonusStackedWidget } from './BonusStackedWidget'

interface FieldWidgetProps {
  field: FieldDef
  value: unknown
  bonuses?: BonusEntry[]
  bonusTypes?: BonusTypeDef[]
  onChange: (value: unknown) => void
  onAddBonus?: (fieldId: string, source: string, bonusType: string, value: number) => void
  onRemoveBonus?: (bonusId: string) => void
  onUpdateBonus?: (
    bonusId: string,
    updates: { source?: string; bonus_type?: string; value?: number },
  ) => void
}

const labelStyle: React.CSSProperties = {
  color: 'var(--color-text-secondary)',
  fontSize: 10,
  marginBottom: 2,
}

const editableInputBase: React.CSSProperties = {
  background: 'var(--color-bg, #1a1a2e)',
  border: 'none',
  borderBottom: '1px dashed #475569',
  color: 'var(--color-text, #e0e0e0)',
  fontSize: 12,
  padding: '3px 4px',
  width: '100%',
  outline: 'none',
}

const derivedBg: React.CSSProperties = {
  background: 'rgba(139, 92, 246, 0.1)',
  borderRadius: 3,
  padding: '3px 6px',
  fontSize: 12,
  color: 'var(--color-text, #e0e0e0)',
}

function handleFocus(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
  e.currentTarget.style.borderBottom = '1px solid var(--color-primary, #6366f1)'
}

function handleBlur(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
  e.currentTarget.style.borderBottom = '1px dashed #475569'
}

export function FieldWidget({
  field,
  value,
  bonuses,
  bonusTypes,
  onChange,
  onAddBonus,
  onRemoveBonus,
  onUpdateBonus,
}: FieldWidgetProps) {
  const { field_type } = field
  const isDerived = field.derived && field_type.type !== 'BonusStacked'

  // BonusStacked delegates entirely
  if (field_type.type === 'BonusStacked') {
    return (
      <BonusStackedWidget
        field={field}
        value={value}
        bonuses={bonuses ?? []}
        bonusTypes={bonusTypes ?? []}
        onAddBonus={onAddBonus ?? (() => {})}
        onRemoveBonus={onRemoveBonus ?? (() => {})}
        onUpdateBonus={onUpdateBonus ?? (() => {})}
      />
    )
  }

  // For derived fields (not BonusStacked): read-only with purple tint
  if (isDerived) {
    return (
      <div>
        <div style={labelStyle}>{field.name}</div>
        <div style={derivedBg}>{String(value ?? '')}</div>
      </div>
    )
  }

  switch (field_type.type) {
    case 'Integer': {
      const min = field_type.config.min != null ? Number(field_type.config.min) : undefined
      const max = field_type.config.max != null ? Number(field_type.config.max) : undefined
      return (
        <div>
          <div style={labelStyle}>{field.name}</div>
          <input
            type="number"
            value={Number(value) || 0}
            min={min}
            max={max}
            onChange={(e) => onChange(Number(e.target.value))}
            onFocus={handleFocus}
            onBlur={handleBlur}
            style={editableInputBase}
          />
        </div>
      )
    }

    case 'Text': {
      const maxLength = field_type.config.max_length ?? undefined
      return (
        <div>
          <div style={labelStyle}>{field.name}</div>
          <input
            type="text"
            value={String(value ?? '')}
            maxLength={maxLength}
            onChange={(e) => onChange(e.target.value)}
            onFocus={handleFocus}
            onBlur={handleBlur}
            style={editableInputBase}
          />
        </div>
      )
    }

    case 'LongText':
      return (
        <div>
          <div style={labelStyle}>{field.name}</div>
          <textarea
            value={String(value ?? '')}
            onChange={(e) => onChange(e.target.value)}
            onFocus={handleFocus}
            onBlur={handleBlur}
            rows={3}
            style={{
              ...editableInputBase,
              resize: 'vertical',
              fontFamily: 'inherit',
            }}
          />
        </div>
      )

    case 'Boolean':
      return (
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            cursor: 'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => onChange(e.target.checked)}
            style={{ accentColor: 'var(--color-primary, #6366f1)' }}
          />
          <span style={{ fontSize: 12, color: 'var(--color-text, #e0e0e0)' }}>{field.name}</span>
        </label>
      )

    case 'Choice':
      return (
        <div>
          <div style={labelStyle}>{field.name}</div>
          <select
            value={String(value ?? '')}
            onChange={(e) => onChange(e.target.value)}
            onFocus={handleFocus}
            onBlur={handleBlur}
            style={{
              ...editableInputBase,
              background: 'var(--color-bg, #1a1a2e)',
            }}
          >
            <option value="">-- Select --</option>
            {field_type.config.options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      )

    case 'AbilityScore': {
      const score = Number(value) || 10
      const modifier = Math.floor((score - 10) / 2)
      const modStr = modifier >= 0 ? `+${modifier}` : String(modifier)
      return (
        <div style={{ textAlign: 'center' }}>
          <div style={labelStyle}>{field.name}</div>
          <input
            type="number"
            value={score}
            onChange={(e) => onChange(Number(e.target.value))}
            onFocus={handleFocus}
            onBlur={handleBlur}
            style={{
              ...editableInputBase,
              textAlign: 'center',
              fontSize: 16,
              fontWeight: 600,
              width: 48,
              margin: '0 auto',
              display: 'block',
            }}
          />
          <div
            style={{
              ...derivedBg,
              fontSize: 11,
              marginTop: 2,
              display: 'inline-block',
            }}
          >
            {modStr}
          </div>
        </div>
      )
    }

    case 'ResourcePool': {
      const current = typeof value === 'number' ? value : Number(value) || 0
      // max is a separate field referenced by max_field; for now display current only
      // The parent can provide max via a computed lookup if desired
      const maxVal = 0 // placeholder, schema may specify max_field
      const pct = maxVal > 0 ? Math.min(100, (current / maxVal) * 100) : 0
      return (
        <div>
          <div style={labelStyle}>{field.name}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <input
              type="number"
              value={current}
              onChange={(e) => onChange(Number(e.target.value))}
              onFocus={handleFocus}
              onBlur={handleBlur}
              style={{ ...editableInputBase, width: 48, textAlign: 'center' }}
            />
            {maxVal > 0 && (
              <>
                <span style={{ color: 'var(--color-text-secondary)', fontSize: 11 }}>/</span>
                <span style={{ ...derivedBg, fontSize: 11 }}>{maxVal}</span>
              </>
            )}
          </div>
          {maxVal > 0 && (
            <div
              style={{
                height: 4,
                borderRadius: 2,
                background: 'var(--color-border, #444)',
                marginTop: 3,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${pct}%`,
                  background: '#22c55e',
                  borderRadius: 2,
                  transition: 'width 0.2s ease',
                }}
              />
            </div>
          )}
        </div>
      )
    }

    case 'StatBlock':
      // Render as read-only labeled value
      return (
        <div>
          <div style={labelStyle}>{field.name}</div>
          <div style={derivedBg}>{String(value ?? '')}</div>
        </div>
      )

    default:
      return (
        <div>
          <div style={labelStyle}>{field.name}</div>
          <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>
            Unsupported field type
          </div>
        </div>
      )
  }
}
