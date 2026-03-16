import { useEffect } from 'react'
import { useToolStore } from '../state/tools'
import type { ToolName } from '../state/tools'
import { isDrawingTool } from '../canvas/DrawingTools'

const TOOL_GROUPS = [
  { label: 'Navigate', tools: [
    { name: 'select' as ToolName, label: 'Select', key: 'V' },
    { name: 'pan' as ToolName, label: 'Pan', key: 'H' },
  ]},
  { label: 'Draw', tools: [
    { name: 'freehand' as ToolName, label: 'Freehand', key: 'B' },
    { name: 'line' as ToolName, label: 'Line', key: 'L' },
    { name: 'rectangle' as ToolName, label: 'Rectangle', key: 'R' },
    { name: 'circle' as ToolName, label: 'Circle', key: 'C' },
    { name: 'polygon' as ToolName, label: 'Polygon' },
    { name: 'eraser' as ToolName, label: 'Eraser' },
  ]},
  { label: 'AoE', tools: [
    { name: 'aoe_cone' as ToolName, label: 'Cone' },
    { name: 'aoe_cube' as ToolName, label: 'Cube' },
    { name: 'aoe_sphere' as ToolName, label: 'Sphere' },
    { name: 'aoe_line' as ToolName, label: 'Line' },
  ]},
  { label: 'Measure', tools: [
    { name: 'ruler' as ToolName, label: 'Ruler', key: 'M' },
    { name: 'waypoint' as ToolName, label: 'Waypoint' },
  ]},
]

export function Toolbar() {
  const activeTool = useToolStore((s) => s.activeTool)
  const setTool = useToolStore((s) => s.setTool)
  const drawSettings = useToolStore((s) => s.drawSettings)
  const setDrawSettings = useToolStore((s) => s.setDrawSettings)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      const shortcuts: Record<string, ToolName> = {
        v: 'select', h: 'pan', b: 'freehand', l: 'line',
        r: 'rectangle', c: 'circle', m: 'ruler',
      }
      const tool = shortcuts[e.key.toLowerCase()]
      if (tool) setTool(tool)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [setTool])

  const showDrawSettings = isDrawingTool(activeTool)

  return (
    <div style={{
      position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)',
      display: 'flex', flexDirection: 'column', gap: 4,
      background: 'var(--color-surface, #2a2a3e)', borderRadius: 8,
      padding: 6, zIndex: 10,
    }}>
      {TOOL_GROUPS.map(group => (
        <div key={group.label} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 10, color: 'var(--color-text-secondary)', padding: '2px 4px' }}>
            {group.label}
          </span>
          {group.tools.map(tool => (
            <button
              key={tool.name}
              onClick={() => setTool(tool.name)}
              title={`${tool.label}${'key' in tool && tool.key ? ` (${tool.key})` : ''}`}
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
        </div>
      ))}
      {showDrawSettings && (
        <div style={{ borderTop: '1px solid var(--color-border, #444)', paddingTop: 6, marginTop: 4 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--color-text-secondary)' }}>
            Color
            <input
              type="color"
              value={drawSettings.strokeColor}
              onChange={(e) => setDrawSettings({ strokeColor: e.target.value })}
              style={{ width: 24, height: 24, border: 'none', cursor: 'pointer' }}
            />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 4 }}>
            Width
            <input
              type="range" min={1} max={20}
              value={drawSettings.strokeWidth}
              onChange={(e) => setDrawSettings({ strokeWidth: Number(e.target.value) })}
              style={{ flex: 1 }}
            />
          </label>
        </div>
      )}
    </div>
  )
}
