import { useState } from 'react'
import { useMapStore } from '../state/map'
import { mapsApi } from '../api/maps'
import type { SnapMode } from '../types/SnapMode'
import type { DiagonalMode } from '../types/DiagonalMode'

const sectionStyle: React.CSSProperties = {
  borderTop: '1px solid var(--color-border, #444)',
  paddingTop: 10,
  marginTop: 10,
}

const labelStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  fontSize: 12,
  color: 'var(--color-text, #e0e0e0)',
  marginBottom: 6,
}

const inputStyle: React.CSSProperties = {
  background: 'var(--color-bg, #1a1a2e)',
  border: '1px solid var(--color-border, #444)',
  borderRadius: 4,
  color: 'var(--color-text, #e0e0e0)',
  fontSize: 12,
  padding: '2px 6px',
  width: 70,
}

const radioGroupStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  marginTop: 4,
}

const radioLabelStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  fontSize: 12,
  color: 'var(--color-text, #e0e0e0)',
  cursor: 'pointer',
}

const sectionHeadingStyle: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--color-text-secondary, #999)',
  marginBottom: 8,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.05em',
}

interface MapSettingsFormProps {
  mapId: string
  initialGridEnabled: boolean
  initialGridSizePx: number
  initialGridColor: string
  initialGridOpacity: number
  initialGridLineWidth: number
  initialGridScale: number
  initialGridScaleUnit: string
  initialSnapMode: SnapMode
  initialDiagonalMode: DiagonalMode
  initialWidthSquares: number
  initialHeightSquares: number
  updateMap: (patch: Record<string, unknown>) => void
}

function MapSettingsForm({
  mapId,
  initialGridEnabled,
  initialGridSizePx,
  initialGridColor,
  initialGridOpacity,
  initialGridLineWidth,
  initialGridScale,
  initialGridScaleUnit,
  initialSnapMode,
  initialDiagonalMode,
  initialWidthSquares,
  initialHeightSquares,
  updateMap,
}: MapSettingsFormProps) {
  const [gridEnabled, setGridEnabled] = useState(initialGridEnabled)
  const [gridSizePx, setGridSizePx] = useState(initialGridSizePx)
  const [gridColor, setGridColor] = useState(initialGridColor)
  const [gridOpacity, setGridOpacity] = useState(initialGridOpacity)
  const [gridLineWidth, setGridLineWidth] = useState(initialGridLineWidth)
  const [gridScale, setGridScale] = useState(initialGridScale)
  const [gridScaleUnit, setGridScaleUnit] = useState(initialGridScaleUnit)
  const [snapMode, setSnapMode] = useState<SnapMode>(initialSnapMode)
  const [diagonalMode, setDiagonalMode] = useState<DiagonalMode>(initialDiagonalMode)
  const [widthSquares, setWidthSquares] = useState(initialWidthSquares)
  const [heightSquares, setHeightSquares] = useState(initialHeightSquares)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = () => {
    setError(null)
    setSaving(true)
    const changes = {
      name: null,
      grid_enabled: gridEnabled,
      grid_size_px: gridSizePx,
      grid_color: gridColor,
      grid_opacity: gridOpacity,
      grid_line_width: gridLineWidth,
      grid_scale: gridScale,
      grid_scale_unit: gridScaleUnit,
      snap_mode: snapMode,
      diagonal_mode: diagonalMode,
      width_squares: widthSquares,
      height_squares: heightSquares,
    }
    mapsApi
      .update(mapId, changes)
      .then(() => {
        updateMap(changes)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Save failed')
      })
      .finally(() => {
        setSaving(false)
      })
  }

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 0 }}>
      <h3 style={{ margin: '0 0 12px', fontSize: 14, color: 'var(--color-text, #e0e0e0)' }}>
        Map Settings
      </h3>

      {/* Grid settings */}
      <div>
        <p style={sectionHeadingStyle}>Grid</p>
        <label style={labelStyle}>
          Enabled
          <input
            type="checkbox"
            checked={gridEnabled}
            onChange={(e) => setGridEnabled(e.target.checked)}
          />
        </label>
        <label style={labelStyle}>
          Cell size (px)
          <input
            type="number"
            min={10}
            max={200}
            value={gridSizePx}
            onChange={(e) => setGridSizePx(Number(e.target.value))}
            style={inputStyle}
          />
        </label>
        <label style={labelStyle}>
          Color
          <input
            type="color"
            value={gridColor}
            onChange={(e) => setGridColor(e.target.value)}
            style={{ width: 32, height: 24, border: 'none', cursor: 'pointer', borderRadius: 4 }}
          />
        </label>
        <label style={{ ...labelStyle, flexDirection: 'column', alignItems: 'stretch' }}>
          <span>Opacity ({Math.round(gridOpacity * 100)}%)</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={gridOpacity}
            onChange={(e) => setGridOpacity(Number(e.target.value))}
          />
        </label>
        <label style={labelStyle}>
          Line width
          <input
            type="number"
            min={1}
            max={10}
            value={gridLineWidth}
            onChange={(e) => setGridLineWidth(Number(e.target.value))}
            style={inputStyle}
          />
        </label>
      </div>

      {/* Scale settings */}
      <div style={sectionStyle}>
        <p style={sectionHeadingStyle}>Scale</p>
        <label style={labelStyle}>
          Scale value
          <input
            type="number"
            min={1}
            value={gridScale}
            onChange={(e) => setGridScale(Number(e.target.value))}
            style={inputStyle}
          />
        </label>
        <label style={labelStyle}>
          Unit
          <select
            value={gridScaleUnit}
            onChange={(e) => setGridScaleUnit(e.target.value)}
            style={{ ...inputStyle, width: 'auto' }}
          >
            <option value="ft">ft</option>
            <option value="m">m</option>
            <option value="units">units</option>
          </select>
        </label>
      </div>

      {/* Snap mode */}
      <div style={sectionStyle}>
        <p style={sectionHeadingStyle}>Snap Mode</p>
        <div style={radioGroupStyle}>
          {(['off', 'center', 'corner'] as SnapMode[]).map((mode) => (
            <label key={mode} style={radioLabelStyle}>
              <input
                type="radio"
                name="snap_mode"
                value={mode}
                checked={snapMode === mode}
                onChange={() => setSnapMode(mode)}
              />
              {mode.charAt(0).toUpperCase() + mode.slice(1)}
            </label>
          ))}
        </div>
      </div>

      {/* Diagonal mode */}
      <div style={sectionStyle}>
        <p style={sectionHeadingStyle}>Diagonal Mode</p>
        <div style={radioGroupStyle}>
          <label style={radioLabelStyle}>
            <input
              type="radio"
              name="diagonal_mode"
              value="dnd_standard"
              checked={diagonalMode === 'dnd_standard'}
              onChange={() => setDiagonalMode('dnd_standard')}
            />
            D&amp;D Standard
          </label>
          <label style={radioLabelStyle}>
            <input
              type="radio"
              name="diagonal_mode"
              value="euclidean"
              checked={diagonalMode === 'euclidean'}
              onChange={() => setDiagonalMode('euclidean')}
            />
            Euclidean
          </label>
          <label style={radioLabelStyle}>
            <input
              type="radio"
              name="diagonal_mode"
              value="manhattan"
              checked={diagonalMode === 'manhattan'}
              onChange={() => setDiagonalMode('manhattan')}
            />
            Manhattan
          </label>
        </div>
      </div>

      {/* Dimensions */}
      <div style={sectionStyle}>
        <p style={sectionHeadingStyle}>Dimensions (squares)</p>
        <label style={labelStyle}>
          Width
          <input
            type="number"
            min={1}
            value={widthSquares}
            onChange={(e) => setWidthSquares(Number(e.target.value))}
            style={inputStyle}
          />
        </label>
        <label style={labelStyle}>
          Height
          <input
            type="number"
            min={1}
            value={heightSquares}
            onChange={(e) => setHeightSquares(Number(e.target.value))}
            style={inputStyle}
          />
        </label>
      </div>

      {error && (
        <p style={{ color: 'var(--color-error, #f87171)', fontSize: 12, marginTop: 8 }}>{error}</p>
      )}

      <button
        onClick={handleSave}
        disabled={saving}
        style={{
          marginTop: 16,
          padding: '8px 16px',
          background: 'var(--color-primary, #6366f1)',
          color: '#fff',
          border: 'none',
          borderRadius: 6,
          cursor: saving ? 'not-allowed' : 'pointer',
          fontSize: 13,
          opacity: saving ? 0.7 : 1,
        }}
      >
        {saving ? 'Saving…' : 'Save Changes'}
      </button>
    </div>
  )
}

export function MapSettings() {
  const currentMap = useMapStore((s) => s.currentMap)
  const updateMap = useMapStore((s) => s.updateMap)

  if (!currentMap) {
    return (
      <p style={{ color: 'var(--color-text-secondary, #999)', padding: 16, margin: 0 }}>
        No map loaded
      </p>
    )
  }

  return (
    <MapSettingsForm
      key={currentMap.id}
      mapId={currentMap.id}
      initialGridEnabled={currentMap.grid_enabled}
      initialGridSizePx={currentMap.grid_size_px}
      initialGridColor={currentMap.grid_color}
      initialGridOpacity={currentMap.grid_opacity}
      initialGridLineWidth={currentMap.grid_line_width}
      initialGridScale={currentMap.grid_scale}
      initialGridScaleUnit={currentMap.grid_scale_unit}
      initialSnapMode={currentMap.snap_mode}
      initialDiagonalMode={currentMap.diagonal_mode}
      initialWidthSquares={currentMap.width_squares}
      initialHeightSquares={currentMap.height_squares}
      updateMap={updateMap}
    />
  )
}
