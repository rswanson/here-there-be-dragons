import { create } from 'zustand'

export type ToolName =
  | 'select'
  | 'pan'
  | 'freehand'
  | 'line'
  | 'rectangle'
  | 'circle'
  | 'polygon'
  | 'eraser'
  | 'aoe_cone'
  | 'aoe_cube'
  | 'aoe_sphere'
  | 'aoe_line'
  | 'ruler'
  | 'waypoint'
  | 'wall_polyline'
  | 'wall_rect'
  | 'fog_reveal'
  | 'fog_hide'

export type WallPlacementType = 'wall' | 'door' | 'secret_door'

export interface DrawSettings {
  strokeColor: string
  strokeWidth: number
  strokeOpacity: number
  fillColor: string | null
  fillOpacity: number
}

interface ToolState {
  activeTool: ToolName
  drawSettings: DrawSettings
  wallPlacementType: WallPlacementType
  fogBrushSize: number

  setTool: (tool: ToolName) => void
  setDrawSettings: (patch: Partial<DrawSettings>) => void
  setWallPlacementType: (type: WallPlacementType) => void
  setFogBrushSize: (size: number) => void
}

const defaultDrawSettings: DrawSettings = {
  strokeColor: '#ffffff',
  strokeWidth: 2,
  strokeOpacity: 1,
  fillColor: null,
  fillOpacity: 0.3,
}

const initialState = {
  activeTool: 'select' as ToolName,
  drawSettings: { ...defaultDrawSettings },
  wallPlacementType: 'wall' as WallPlacementType,
  fogBrushSize: 1,
}

export const useToolStore = create<ToolState>()((set) => ({
  ...initialState,

  setTool: (tool) => set({ activeTool: tool }),

  setDrawSettings: (patch) =>
    set((s) => ({
      drawSettings: { ...s.drawSettings, ...patch },
    })),

  setWallPlacementType: (type) => set({ wallPlacementType: type }),

  setFogBrushSize: (size) => set({ fogBrushSize: size }),
}))
