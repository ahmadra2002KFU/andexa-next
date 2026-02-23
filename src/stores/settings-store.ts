import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { ProviderId } from "@/types/providers"

interface SettingsState {
  provider: ProviderId
  sidebarOpen: boolean
  sidebarWidth: number
  autoExpandCode: boolean
  showExecutionTime: boolean
  analysisMode: "normal" | "jci"

  setProvider: (provider: ProviderId) => void
  toggleSidebar: () => void
  setSidebarOpen: (open: boolean) => void
  setSidebarWidth: (width: number) => void
  setAutoExpandCode: (v: boolean) => void
  setShowExecutionTime: (v: boolean) => void
  setAnalysisMode: (mode: "normal" | "jci") => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      provider: "groq",
      sidebarOpen: true,
      sidebarWidth: 280,
      autoExpandCode: true,
      showExecutionTime: true,
      analysisMode: "normal",

      setProvider: (provider) => set({ provider }),
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      setSidebarWidth: (width) => set({ sidebarWidth: width }),
      setAutoExpandCode: (v) => set({ autoExpandCode: v }),
      setShowExecutionTime: (v) => set({ showExecutionTime: v }),
      setAnalysisMode: (mode) => set({ analysisMode: mode }),
    }),
    { name: "andexa-settings" }
  )
)
