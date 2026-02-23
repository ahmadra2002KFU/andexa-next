"use client"

import type { ToolPhaseStatus } from "@/types"
import { Search, Brain, Play, RotateCcw, MessageSquare, Check, Loader2 } from "lucide-react"

interface ToolPhaseIndicatorProps {
  toolPhase: ToolPhaseStatus
}

const phaseConfig = {
  tools: { icon: Search, label: "Exploring data", color: "text-blue-400" },
  thinking: { icon: Brain, label: "Analyzing & generating code", color: "text-amber-400" },
  executing: { icon: Play, label: "Executing code", color: "text-green-400" },
  retrying: { icon: RotateCcw, label: "Retrying", color: "text-orange-400" },
  commenting: { icon: MessageSquare, label: "Writing commentary", color: "text-purple-400" },
  idle: { icon: Check, label: "", color: "text-muted-foreground" },
}

export function ToolPhaseIndicator({ toolPhase }: ToolPhaseIndicatorProps) {
  if (toolPhase.phase === "idle" && !toolPhase.active) return null

  const config = phaseConfig[toolPhase.phase]
  const Icon = config.icon

  return (
    <div className="my-2 rounded-lg border border-border/50 bg-muted/30 px-4 py-3 text-sm animate-in fade-in slide-in-from-top-2 duration-300">
      {/* Current phase header */}
      <div className="flex items-center gap-2">
        {toolPhase.active ? (
          <Loader2 className={`h-4 w-4 animate-spin ${config.color}`} />
        ) : (
          <Icon className={`h-4 w-4 ${config.color}`} />
        )}
        <span className={`font-medium ${config.color}`}>
          {toolPhase.phase === "retrying"
            ? `Retrying (attempt ${toolPhase.retryAttempt ?? 1})${toolPhase.retryError ? ` — ${toolPhase.retryError}` : ""}`
            : config.label}
        </span>
      </div>

      {/* Tool calls list */}
      {toolPhase.toolCalls.length > 0 && (
        <div className="mt-2 space-y-1 pl-6 text-xs text-muted-foreground">
          {toolPhase.toolCalls.map((tc) => (
            <div key={tc.iteration} className="flex items-center gap-2">
              {tc.status === "calling" ? (
                <Loader2 className="h-3 w-3 animate-spin text-blue-400" />
              ) : (
                <Check className="h-3 w-3 text-green-400" />
              )}
              <span className="font-mono">{tc.toolName}</span>
              {tc.summary && (
                <span className="truncate opacity-60">— {tc.summary}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Retry explanation */}
      {toolPhase.retryExplanation && (
        <p className="mt-2 pl-6 text-xs text-orange-400/80">{toolPhase.retryExplanation}</p>
      )}
    </div>
  )
}
