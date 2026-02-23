"use client"

import { Badge } from "@/components/ui/badge"
import { Wrench } from "lucide-react"
import type { ToolPhaseEvent } from "@/types/chat"

interface ToolPhaseProps {
  event?: ToolPhaseEvent
}

export function ToolPhaseIndicator({ event }: ToolPhaseProps) {
  if (!event) return null

  return (
    <div className="flex items-center gap-2 rounded-md bg-muted px-3 py-1.5 text-xs">
      <Wrench className="h-3.5 w-3.5 animate-spin text-primary" />
      <span>
        {event.type === "tool_call" && `Exploring data: ${event.toolName}...`}
        {event.type === "tool_result" && `Tool ${event.toolName}: ${event.success ? "done" : "failed"}`}
        {event.type === "tool_phase_complete" && `Explored with ${event.toolCount} tool calls`}
      </span>
      {event.iteration != null && (
        <Badge variant="secondary" className="text-xs">
          Step {event.iteration}
        </Badge>
      )}
    </div>
  )
}
