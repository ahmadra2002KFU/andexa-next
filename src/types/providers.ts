export type ProviderId = "groq" | "lmstudio" | "zai" | "ollama"

export interface Provider {
  id: ProviderId
  name: string
  type: "cloud" | "local"
  healthy: boolean
  model?: string
}

export interface ProviderHealth {
  healthy: boolean
  model?: string
  error?: string
}
