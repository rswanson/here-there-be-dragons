import { useToolStore } from '../state/tools'
import type { ToolName, WallPlacementType } from '../state/tools'

const WALL_TOOLS: { name: ToolName; label: string }[] = [
  { name: 'wall_polyline', label: 'Wall Polyline' },
  { name: 'wall_rect', label: 'Wall Rect' },
]

const WALL_TYPES: { value: WallPlacementType; label: string }[] = [
  { value: 'wall', label: 'Wall' },
  { value: 'door', label: 'Door' },
  { value: 'secret_door', label: 'Secret Door' },
]

export function WallToolbar() {
  const activeTool = useToolStore((s) => s.activeTool)
  const setTool = useToolStore((s) => s.setTool)
  const wallPlacementType = useToolStore((s) => s.wallPlacementType)
  const setWallPlacementType = useToolStore((s) => s.setWallPlacementType)

  const isWallToolActive = activeTool === 'wall_polyline' || activeTool === 'wall_rect'

  return (
    <div style={{
      position: 'absolute', left: 8, top: 8,
      display: 'flex', flexDirection: 'column', gap: 2,
      background: 'var(--color-surface, #2a2a3e)', borderRadius: 8,
      padding: 6, zIndex: 10,
    }}>
      <span style={{ fontSize: 10, color: 'var(--color-text-secondary)', padding: '2px 4px' }}>
        Walls
      </span>
      {WALL_TOOLS.map((tool) => (
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
      {isWallToolActive && (
        <div style={{ borderTop: '1px solid var(--color-border, #444)', paddingTop: 4, marginTop: 2 }}>
          <span style={{ fontSize: 10, color: 'var(--color-text-secondary)', padding: '2px 4px', display: 'block', marginBottom: 2 }}>
            Type
          </span>
          {WALL_TYPES.map((wt) => (
            <button
              key={wt.value}
              onClick={() => setWallPlacementType(wt.value)}
              style={{
                display: 'block', width: '100%',
                padding: '4px 10px', border: 'none', borderRadius: 3, cursor: 'pointer',
                fontSize: 11, textAlign: 'left',
                background: wallPlacementType === wt.value ? 'var(--color-primary, #6366f1)' : 'transparent',
                color: wallPlacementType === wt.value ? '#fff' : 'var(--color-text, #e0e0e0)',
              }}
            >
              {wt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
