"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { BarChart3 } from "lucide-react"
import {
  RESPONSE_BLOCK_CARD_CLASS,
  RESPONSE_BLOCK_CONTENT_CLASS,
  RESPONSE_BLOCK_HEADER_CLASS,
} from "./block-styles"

interface AnalysisSectionProps {
  content: string
  isStreaming?: boolean
}

export function AnalysisSection({ content, isStreaming }: AnalysisSectionProps) {
  if (!content && !isStreaming) return null

  return (
    <Card className={RESPONSE_BLOCK_CARD_CLASS}>
      <div className={RESPONSE_BLOCK_HEADER_CLASS}>
        <BarChart3 className="h-4 w-4" />
        Analysis
      </div>
      <CardContent className={RESPONSE_BLOCK_CONTENT_CLASS}>
        {content ? (
          <pre className="whitespace-pre-wrap text-sm text-foreground/95">{content}</pre>
        ) : (
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        )}
        {isStreaming && content && (
          <span className="inline-block h-4 w-1 animate-pulse bg-primary ml-0.5" />
        )}
      </CardContent>
    </Card>
  )
}
