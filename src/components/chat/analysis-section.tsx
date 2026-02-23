"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { BarChart3 } from "lucide-react"

interface AnalysisSectionProps {
  content: string
  isStreaming?: boolean
}

export function AnalysisSection({ content, isStreaming }: AnalysisSectionProps) {
  if (!content && !isStreaming) return null

  return (
    <Card className="mb-3">
      <CardContent className="p-4">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-primary">
          <BarChart3 className="h-4 w-4" />
          Analysis
        </div>
        {content ? (
          <pre className="whitespace-pre-wrap text-sm text-foreground">{content}</pre>
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
