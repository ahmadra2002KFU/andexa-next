"use client"

import { Card, CardContent } from "@/components/ui/card"
import { MessageSquare } from "lucide-react"

interface CommentarySectionProps {
  content: string
  isStreaming?: boolean
}

export function CommentarySection({ content, isStreaming }: CommentarySectionProps) {
  if (!content && !isStreaming) return null

  return (
    <Card className="mb-3">
      <CardContent className="p-4">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-primary">
          <MessageSquare className="h-4 w-4" />
          Commentary
        </div>
        <pre className="whitespace-pre-wrap text-sm">{content}</pre>
        {isStreaming && content && (
          <span className="inline-block h-4 w-1 animate-pulse bg-primary ml-0.5" />
        )}
      </CardContent>
    </Card>
  )
}
