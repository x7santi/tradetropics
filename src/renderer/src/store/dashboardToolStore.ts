import { create } from 'zustand'

export type DashboardTool = 'score' | 'calendar' | null
export type ActiveDashboardTool = 'score' | 'calendar' | 'journal' | 'news'

interface DashboardToolState {
  activeTools: ActiveDashboardTool[]
  selectedTool: DashboardTool
  setSelectedTool: (tool: DashboardTool) => void
  toggleTool: (tool: ActiveDashboardTool) => void
}

export const useDashboardToolStore = create<DashboardToolState>((set) => ({
  activeTools: [],
  selectedTool: null,
  setSelectedTool: (tool) => set({
    selectedTool: tool,
    activeTools: tool ? [tool] : [],
  }),
  toggleTool: (tool) => set((state) => {
    const activeTools = state.activeTools.includes(tool)
      ? state.activeTools.filter(activeTool => activeTool !== tool)
      : [...state.activeTools, tool]
    return {
      activeTools,
      selectedTool: activeTools.find(activeTool => activeTool === 'score' || activeTool === 'calendar') ?? null,
    }
  }),
}))
