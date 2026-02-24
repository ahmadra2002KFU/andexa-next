"use client"

import { Card, CardContent } from "@/components/ui/card"
import { MessageSquare } from "lucide-react"
import {
  RESPONSE_BLOCK_CARD_CLASS,
  RESPONSE_BLOCK_CONTENT_CLASS,
  RESPONSE_BLOCK_HEADER_CLASS,
} from "./block-styles"

interface CommentarySectionProps {
  content: string
  isStreaming?: boolean
}

export function CommentarySection({ content, isStreaming }: CommentarySectionProps) {
  if (!content && !isStreaming) return null

  return (
    <Card className={RESPONSE_BLOCK_CARD_CLASS}>
      <div className={RESPONSE_BLOCK_HEADER_CLASS}>
        <MessageSquare className="h-4 w-4" />
        Commentary
      </div>
      <CardContent className={RESPONSE_BLOCK_CONTENT_CLASS}>
        <pre className="whitespace-pre-wrap text-sm text-foreground/95">{content}</pre>
        {isStreaming && content && (
          <span className="inline-block h-4 w-1 animate-pulse bg-primary ml-0.5" />
        )}
      </CardContent>
    </Card>
  )
}
