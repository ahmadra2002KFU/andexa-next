"use client"

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { ChevronDown, MessageSquare } from "lucide-react"
import { useState } from "react"
import type { ChatSession } from "@/types/chat"

interface RecentChatsProps {
  sessions?: ChatSession[]
  onSelect?: (id: number) => void
}

export function RecentChats({ sessions = [], onSelect }: RecentChatsProps) {
  const [open, setOpen] = useState(true)

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex w-full items-center justify-between py-2 text-sm font-semibold">
        <span className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4" />
          Recent Chats
        </span>
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? "" : "-rotate-90"}`} />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="max-h-48 space-y-1 overflow-y-auto py-2">
          {sessions.length === 0 ? (
            <p className="text-center text-xs text-muted-foreground py-4">No recent chats</p>
          ) : (
            sessions.map((s) => (
              <button
                key={s.id}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-muted text-left"
                onClick={() => onSelect?.(s.id)}
              >
                <MessageSquare className="h-3 w-3 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{s.title}</p>
                  <p className="text-muted-foreground">{s.messageCount} messages</p>
                </div>
              </button>
            ))
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
