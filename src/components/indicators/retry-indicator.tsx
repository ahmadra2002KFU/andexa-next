"use client"

import { Badge } from "@/components/ui/badge"
import { RefreshCw } from "lucide-react"
import type { RetryEvent } from "@/types/chat"

interface RetryIndicatorProps {
  event?: RetryEvent
}

export function RetryIndicator({ event }: RetryIndicatorProps) {
  if (!event) return null

  return (
    <div className="flex items-center gap-2 rounded-md bg-amber-50 dark:bg-amber-950/30 px-3 py-1.5 text-xs text-amber-700 dark:text-amber-400">
      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
      <span>
        Retry attempt {event.attempt}/{event.maxAttempts}
        {event.errorType && ` - fixing ${event.errorType}`}
      </span>
      <Badge variant="outline" className="text-xs border-amber-300">
        {event.type === "retry_complete" ? "Fixed" : "Retrying"}
      </Badge>
    </div>
  )
}
