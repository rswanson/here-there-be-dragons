import * as Tabs from '@radix-ui/react-tabs'
import type { SheetSection as SheetSectionType } from '../../types/SheetSection'
import type { BonusEntry } from '../../types/BonusEntry'
import type { BonusTypeDef } from '../../types/BonusTypeDef'
import { FieldWidget } from './FieldWidget'

interface SheetSectionProps {
  section: SheetSectionType
  fields: Record<string, unknown>
  bonuses: Record<string, BonusEntry[]>
  bonusTypes: BonusTypeDef[]
  onChange: (fieldId: string, value: unknown) => void
  onAddBonus: (fieldId: string, source: string, bonusType: string, value: number) => void
  onRemoveBonus: (bonusId: string) => void
  onUpdateBonus: (
    bonusId: string,
    updates: { source?: string; bonus_type?: string; value?: number },
  ) => void
}

export function SheetSection({
  section,
  fields,
  bonuses,
  bonusTypes,
  onChange,
  onAddBonus,
  onRemoveBonus,
  onUpdateBonus,
}: SheetSectionProps) {
  const visibleFields = section.fields.filter((f) => f.visible !== false)
  const { layout } = section

  const renderField = (field: (typeof visibleFields)[number]) => (
    <FieldWidget
      key={field.id}
      field={field}
      value={fields[field.id]}
      bonuses={bonuses[field.id]}
      bonusTypes={bonusTypes}
      onChange={(val) => onChange(field.id, val)}
      onAddBonus={onAddBonus}
      onRemoveBonus={onRemoveBonus}
      onUpdateBonus={onUpdateBonus}
    />
  )

  let content: React.ReactNode

  switch (layout.type) {
    case 'Grid':
      content = (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${layout.config.columns}, 1fr)`,
            gap: 8,
          }}
        >
          {visibleFields.map(renderField)}
        </div>
      )
      break

    case 'List':
      content = (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {visibleFields.map(renderField)}
        </div>
      )
      break

    case 'Table':
      content = (
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: 11,
          }}
        >
          <thead>
            <tr>
              {layout.config.columns.map((col) => (
                <th
                  key={col}
                  style={{
                    textAlign: 'left',
                    color: 'var(--color-text-secondary)',
                    fontWeight: 500,
                    fontSize: 10,
                    padding: '2px 4px',
                    borderBottom: '1px solid var(--color-border, #444)',
                  }}
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleFields.map((field) => (
              <tr key={field.id}>
                <td style={{ padding: '2px 4px' }} colSpan={layout.config.columns.length}>
                  {renderField(field)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )
      break

    case 'Tabs': {
      // Group fields by their `group` property
      const groups = new Map<string, typeof visibleFields>()
      const tabNames = layout.config.tabs

      for (const tab of tabNames) {
        groups.set(tab, [])
      }
      for (const field of visibleFields) {
        const group = field.group ?? tabNames[0] ?? 'Other'
        const arr = groups.get(group) ?? []
        arr.push(field)
        groups.set(group, arr)
      }

      content = (
        <Tabs.Root defaultValue={tabNames[0]}>
          <Tabs.List
            style={{
              display: 'flex',
              gap: 0,
              borderBottom: '1px solid var(--color-border, #444)',
              marginBottom: 6,
            }}
          >
            {tabNames.map((tab) => (
              <Tabs.Trigger
                key={tab}
                value={tab}
                style={{
                  background: 'transparent',
                  border: 'none',
                  borderBottom: '2px solid transparent',
                  color: 'var(--color-text-secondary)',
                  cursor: 'pointer',
                  fontSize: 11,
                  padding: '4px 8px',
                }}
              >
                {tab}
              </Tabs.Trigger>
            ))}
          </Tabs.List>
          {tabNames.map((tab) => (
            <Tabs.Content key={tab} value={tab}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {(groups.get(tab) ?? []).map(renderField)}
              </div>
            </Tabs.Content>
          ))}
        </Tabs.Root>
      )
      break
    }
  }

  return (
    <div style={{ marginBottom: 12 }}>
      <h4
        style={{
          margin: '0 0 6px 0',
          fontSize: 12,
          fontWeight: 600,
          color: 'var(--color-text, #e0e0e0)',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}
      >
        {section.name}
      </h4>
      {content}
    </div>
  )
}
