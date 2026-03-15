import { create } from 'zustand'

interface UiState {
  sidebarOpen: boolean
  activeTool: string | null
  selectedTokenId: string | null
  toggleSidebar: () => void
  setActiveTool: (tool: string | null) => void
  setSelectedToken: (id: string | null) => void
}

export const useUiStore = create<UiState>((set) => ({
  sidebarOpen: true,
  activeTool: null,
  selectedTokenId: null,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setActiveTool: (tool) => set({ activeTool: tool }),
  setSelectedToken: (id) => set({ selectedTokenId: id }),
}))
