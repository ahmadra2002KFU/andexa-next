"use client"

import { useEffect, useCallback } from "react"
import { useSettingsStore } from "@/stores/settings-store"

export function useSidebar() {
  const { sidebarOpen, sidebarWidth, toggleSidebar, setSidebarOpen, setSidebarWidth } =
    useSettingsStore()

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "b") {
        e.preventDefault()
        toggleSidebar()
      }
    },
    [toggleSidebar]
  )

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [handleKeyDown])

  return { sidebarOpen, sidebarWidth, toggleSidebar, setSidebarOpen, setSidebarWidth }
}
