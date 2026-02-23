import { createOpenAI } from "@ai-sdk/openai";
import type { ProviderType } from "@/types";

interface ProviderConfig {
  id: ProviderType;
  name: string;
  baseURL: string;
  apiKey: string;
  model: string;
  enabled: boolean;
}

function getProviderConfigs(): ProviderConfig[] {
  return [
    {
      id: "groq",
      name: "Groq (Kimi K2)",
      baseURL: process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1",
      apiKey: process.env.GROQ_API_KEY || "",
      model: process.env.GROQ_MODEL || "moonshotai/kimi-k2-instruct-0905",
      enabled: !!process.env.GROQ_API_KEY,
    },
    {
      id: "zai",
      name: "Z.AI (GLM 4.6)",
      baseURL: process.env.ZAI_BASE_URL || "https://api.z.ai/api/paas/v4",
      apiKey: process.env.ZAI_API_KEY || "",
      model: process.env.ZAI_MODEL || "glm-4.6",
      enabled: !!process.env.ZAI_API_KEY,
    },
    {
      id: "lmstudio",
      name: "LM Studio (Local)",
      baseURL: process.env.LMSTUDIO_BASE_URL || "http://127.0.0.1:1234/v1",
      apiKey: "lm-studio",
      model: "local-model",
      enabled: process.env.LMSTUDIO_ENABLED === "true",
    },
    {
      id: "ollama",
      name: "Ollama (Local)",
      baseURL: process.env.OLLAMA_BASE_URL || "http://localhost:11434/v1",
      apiKey: "ollama",
      model: process.env.OLLAMA_MODEL || "llama3.2",
      enabled: process.env.OLLAMA_ENABLED === "true",
    },
  ];
}

const providerInstances = new Map<ProviderType, ReturnType<typeof createOpenAI>>();

function getOrCreateProvider(config: ProviderConfig) {
  if (!providerInstances.has(config.id)) {
    providerInstances.set(
      config.id,
      createOpenAI({
        baseURL: config.baseURL,
        apiKey: config.apiKey,
      })
    );
  }
  return providerInstances.get(config.id)!;
}

export function getModel(providerId: ProviderType = "groq") {
  const configs = getProviderConfigs();
  const config = configs.find((c) => c.id === providerId && c.enabled);
  if (!config) {
    // Fall back to first enabled provider
    const fallback = configs.find((c) => c.enabled);
    if (!fallback) throw new Error("No LLM providers configured");
    const provider = getOrCreateProvider(fallback);
    return provider.chat(fallback.model);
  }
  const provider = getOrCreateProvider(config);
  return provider.chat(config.model);
}

export async function getAvailableProviders() {
  const configs = getProviderConfigs();
  const localProviders = new Set(["lmstudio", "ollama"]);

  return configs
    .filter((c) => c.enabled)
    .map((c) => ({
      id: c.id,
      name: c.name,
      type: localProviders.has(c.id) ? "local" as const : "cloud" as const,
      healthy: true, // Simplified; real health checks go through executor
    }));
}
