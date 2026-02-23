"use client"

import { useProviders } from "@/hooks/use-providers"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { ProviderId } from "@/types/providers"

export function ProviderSelect() {
  const { providers, activeProvider, switchProvider } = useProviders()

  return (
    <div className="space-y-2">
      <h4 className="text-xs font-medium text-muted-foreground">LLM Provider</h4>
      <Select value={activeProvider} onValueChange={(v) => switchProvider(v as ProviderId)}>
        <SelectTrigger className="h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {providers.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              <span className="flex items-center gap-2">
                <span
                  className={`inline-block h-2 w-2 rounded-full ${
                    p.healthy ? "bg-green-500" : "bg-red-500"
                  }`}
                />
                {p.name}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
