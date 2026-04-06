import { useToolStore } from '../state/tools'
import type { ToolName } from '../state/tools'

const BRUSH_SIZES = [1, 3, 5]

export function FogTool() {
  const activeTool = useToolStore((s) => s.activeTool)
  const setTool = useToolStore((s) => s.setTool)
  const fogBrushSize = useToolStore((s) => s.fogBrushSize)
  const setFogBrushSize = useToolStore((s) => s.setFogBrushSize)

  const isFogToolActive = activeTool === 'fog_reveal' || activeTool === 'fog_hide'

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 2,
    }}>
      <span style={{ fontSize: 10, color: 'var(--color-text-secondary)', padding: '2px 4px' }}>
        Fog
      </span>
      {([
        { name: 'fog_reveal' as ToolName, label: 'Reveal' },
        { name: 'fog_hide' as ToolName, label: 'Hide' },
      ]).map((tool) => (
        <button
          key={tool.name}
          onClick={() => setTool(tool.name)}
          style={{
            padding: '6px 10px', border: 'none', borderRadius: 4, cursor: 'pointer',
            fontSize: 12, textAlign: 'left',
            background: activeTool === tool.name ? 'var(--color-primary, #6366f1)' : 'transparent',
            color: activeTool === tool.name ? '#fff' : 'var(--color-text, #e0e0e0)',
          }}
        >
          {tool.label}
        </button>
      ))}
      {isFogToolActive && (
        <div style={{ borderTop: '1px solid var(--color-border, #444)', paddingTop: 4, marginTop: 2 }}>
          <span style={{ fontSize: 10, color: 'var(--color-text-secondary)', padding: '2px 4px', display: 'block', marginBottom: 2 }}>
            Brush
          </span>
          <div style={{ display: 'flex', gap: 2, padding: '0 4px' }}>
            {BRUSH_SIZES.map((size) => (
              <button
                key={size}
                onClick={() => setFogBrushSize(size)}
                style={{
                  padding: '3px 8px', border: 'none', borderRadius: 3, cursor: 'pointer',
                  fontSize: 11,
                  background: fogBrushSize === size ? 'var(--color-primary, #6366f1)' : 'transparent',
                  color: fogBrushSize === size ? '#fff' : 'var(--color-text, #e0e0e0)',
                }}
              >
                {size}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
