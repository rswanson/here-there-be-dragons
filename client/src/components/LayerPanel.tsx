import { useState } from 'react'
import { useMapStore } from '../state/map'
import { mapsApi } from '../api/maps'
import type { LayerType } from '../types/LayerType'

const LAYER_TYPES: { value: LayerType; label: string }[] = [
  { value: 'map_image', label: 'Map Image' },
  { value: 'token', label: 'Token' },
  { value: 'drawing', label: 'Drawing' },
]

export function LayerPanel() {
  const layers = useMapStore((s) => s.layers)
  const activeLayerId = useMapStore((s) => s.activeLayerId)
  const currentMap = useMapStore((s) => s.currentMap)
  const setActiveLayer = useMapStore((s) => s.setActiveLayer)
  const updateLayer = useMapStore((s) => s.updateLayer)
  const addLayer = useMapStore((s) => s.addLayer)
  const removeLayer = useMapStore((s) => s.removeLayer)

  const [newLayerName, setNewLayerName] = useState('')
  const [newLayerType, setNewLayerType] = useState<LayerType>('drawing')
  const [newLayerDmOnly, setNewLayerDmOnly] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [adding, setAdding] = useState(false)

  const sorted = [...layers].sort((a, b) => a.sort_order - b.sort_order)

  const handleAddLayer = async () => {
    if (!currentMap || !newLayerName.trim()) return
    setAdding(true)
    try {
      const layer = await mapsApi.createLayer(currentMap.id, {
        name: newLayerName.trim(),
        layer_type: newLayerType,
        dm_only: newLayerDmOnly,
      })
      addLayer(layer)
      setNewLayerName('')
      setNewLayerType('drawing')
      setNewLayerDmOnly(false)
      setShowAddForm(false)
    } finally {
      setAdding(false)
    }
  }

  return (
    <div
      style={{
        position: 'absolute',
        right: 8,
        top: 8,
        width: 220,
        background: 'var(--color-surface, #2a2a3e)',
        borderRadius: 8,
        padding: 8,
        zIndex: 10,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}
    >
      <h3
        style={{
          margin: 0,
          fontSize: 13,
          color: 'var(--color-text, #e0e0e0)',
          paddingBottom: 4,
          borderBottom: '1px solid var(--color-border, #444)',
        }}
      >
        Layers
      </h3>

      {sorted.map((layer) => (
        <div
          key={layer.id}
          onClick={() => setActiveLayer(layer.id)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '4px 6px',
            borderRadius: 4,
            cursor: 'pointer',
            background:
              activeLayerId === layer.id
                ? 'var(--color-primary, #6366f1)'
                : 'transparent',
            color:
              activeLayerId === layer.id
                ? '#fff'
                : 'var(--color-text, #e0e0e0)',
          }}
        >
          <span style={{ flex: 1, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {layer.name}
          </span>

          {layer.dm_only && (
            <span
              style={{
                fontSize: 10,
                padding: '1px 3px',
                borderRadius: 3,
                background: 'rgba(239,68,68,0.3)',
                color: '#fca5a5',
              }}
            >
              DM
            </span>
          )}

          <button
            onClick={(e) => {
              e.stopPropagation()
              updateLayer(layer.id, { visible: !layer.visible })
            }}
            title={layer.visible ? 'Hide layer' : 'Show layer'}
            style={{
              padding: '2px 4px',
              border: 'none',
              borderRadius: 3,
              cursor: 'pointer',
              fontSize: 11,
              background: 'transparent',
              color: layer.visible ? 'var(--color-text, #e0e0e0)' : 'var(--color-text-secondary, #888)',
            }}
          >
            {layer.visible ? 'V' : 'H'}
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation()
              updateLayer(layer.id, { locked: !layer.locked })
            }}
            title={layer.locked ? 'Unlock layer' : 'Lock layer'}
            style={{
              padding: '2px 4px',
              border: 'none',
              borderRadius: 3,
              cursor: 'pointer',
              fontSize: 11,
              background: 'transparent',
              color: layer.locked ? '#fbbf24' : 'var(--color-text, #e0e0e0)',
            }}
          >
            {layer.locked ? 'L' : 'U'}
          </button>

          <input
            type="range"
            min={0}
            max={1}
            step={0.1}
            value={layer.opacity ?? 1}
            title={`Opacity: ${Math.round((layer.opacity ?? 1) * 100)}%`}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) =>
              updateLayer(layer.id, { opacity: Number(e.target.value) })
            }
            style={{ width: 48 }}
          />

          <button
            onClick={(e) => {
              e.stopPropagation()
              if (window.confirm(`Delete layer "${layer.name}"?`)) {
                removeLayer(layer.id)
              }
            }}
            title="Delete layer"
            style={{
              padding: '2px 4px',
              border: 'none',
              borderRadius: 3,
              cursor: 'pointer',
              fontSize: 11,
              background: 'transparent',
              color: '#f87171',
            }}
          >
            X
          </button>
        </div>
      ))}

      {showAddForm ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            paddingTop: 4,
            borderTop: '1px solid var(--color-border, #444)',
          }}
        >
          <input
            type="text"
            placeholder="Layer name"
            value={newLayerName}
            onChange={(e) => setNewLayerName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleAddLayer()
              if (e.key === 'Escape') setShowAddForm(false)
            }}
            style={{
              padding: '4px 6px',
              borderRadius: 4,
              border: '1px solid var(--color-border, #444)',
              background: 'var(--color-bg, #1a1a2e)',
              color: 'var(--color-text, #e0e0e0)',
              fontSize: 12,
            }}
            autoFocus
          />
          <select
            value={newLayerType}
            onChange={(e) => setNewLayerType(e.target.value as LayerType)}
            style={{
              padding: '4px 6px',
              borderRadius: 4,
              border: '1px solid var(--color-border, #444)',
              background: 'var(--color-bg, #1a1a2e)',
              color: 'var(--color-text, #e0e0e0)',
              fontSize: 12,
            }}
          >
            {LAYER_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 11,
              color: 'var(--color-text-secondary, #888)',
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={newLayerDmOnly}
              onChange={(e) => setNewLayerDmOnly(e.target.checked)}
            />
            DM only
          </label>
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              onClick={() => void handleAddLayer()}
              disabled={adding || !newLayerName.trim() || !currentMap}
              style={{
                flex: 1,
                padding: '4px 8px',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
                fontSize: 12,
                background: 'var(--color-primary, #6366f1)',
                color: '#fff',
                opacity: adding || !newLayerName.trim() || !currentMap ? 0.5 : 1,
              }}
            >
              {adding ? 'Adding…' : 'Add'}
            </button>
            <button
              onClick={() => setShowAddForm(false)}
              style={{
                padding: '4px 8px',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
                fontSize: 12,
                background: 'transparent',
                color: 'var(--color-text-secondary, #888)',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowAddForm(true)}
          style={{
            marginTop: 4,
            padding: '4px 8px',
            border: '1px dashed var(--color-border, #444)',
            borderRadius: 4,
            cursor: 'pointer',
            fontSize: 12,
            background: 'transparent',
            color: 'var(--color-text-secondary, #888)',
          }}
        >
          + Add Layer
        </button>
      )}
    </div>
  )
}
