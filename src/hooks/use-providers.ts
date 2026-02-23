"use client"

import { useState, useCallback, useEffect } from "react"
import { useSettingsStore } from "@/stores/settings-store"
import type { Provider, ProviderId } from "@/types/providers"

export function useProviders() {
  const [providers, setProviders] = useState<Provider[]>([])
  const [loading, setLoading] = useState(false)
  const { provider: activeProvider, setProvider } = useSettingsStore()

  const fetchProviders = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/providers")
      if (res.ok) {
        const data = await res.json()
        setProviders(Array.isArray(data) ? data : data.providers || [])
      }
    } catch {
      // API may not exist yet - use defaults
      setProviders([
        { id: "groq", name: "Groq (Kimi K2)", type: "cloud", healthy: true },
        { id: "lmstudio", name: "LM Studio", type: "local", healthy: false },
        { id: "zai", name: "Z.AI (GLM 4.6)", type: "cloud", healthy: false },
        { id: "ollama", name: "Ollama", type: "local", healthy: false },
      ])
    } finally {
      setLoading(false)
    }
  }, [])

  const switchProvider = useCallback(
    (id: ProviderId) => {
      setProvider(id)
    },
    [setProvider]
  )

  useEffect(() => {
    fetchProviders()
  }, [fetchProviders])

  return { providers, activeProvider, loading, switchProvider, fetchProviders }
}
