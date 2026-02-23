"use client"

import type { ChatMessage, AssistantResponse } from "@/types/chat"
import { AnalysisSection } from "./analysis-section"
import { CodeBlock } from "./code-block"
import { ResultsSection } from "./results-section"
import { Visualization } from "./visualization"
import { CommentarySection } from "./commentary-section"
import { GenerationButtons } from "./generation-buttons"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"

interface MessageProps {
  message: ChatMessage
  isStreaming?: boolean
  streamingResponse?: Partial<AssistantResponse>
}

export function Message({ message, isStreaming, streamingResponse }: MessageProps) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end gap-3 py-3">
        <div className="max-w-[80%] rounded-xl bg-primary px-4 py-2.5 text-primary-foreground">
          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
        </div>
        <Avatar className="h-8 w-8 shrink-0">
          <AvatarFallback>U</AvatarFallback>
        </Avatar>
      </div>
    )
  }

  // Assistant message
  const resp = isStreaming ? streamingResponse : message.response
  if (!resp) return null

  const showGenButtons = !isStreaming && message.response?.executionResults?.success

  const hasAnalysis = !!(resp.analysis)
  const hasCode = !!(resp.generatedCode)
  const hasPlots = !!(resp.plots && resp.plots.length > 0)
  const hasResults = !!(resp.executionResults)
  const hasCommentary = !!(resp.commentary)

  return (
    <div className="flex gap-3 py-3">
      <Avatar className="h-8 w-8 shrink-0">
        <AvatarFallback className="bg-primary text-primary-foreground text-xs">A</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        {hasAnalysis && (
          <div className="animate-in fade-in duration-300">
            <AnalysisSection content={resp.analysis || ""} isStreaming={isStreaming} />
          </div>
        )}
        {hasCode && (
          <div className="animate-in fade-in duration-300">
            <CodeBlock code={resp.generatedCode || ""} />
          </div>
        )}
        {hasPlots && (
          <div className="animate-in fade-in duration-300">
            <Visualization plots={resp.plots} />
          </div>
        )}
        {hasResults && (
          <div className="animate-in fade-in duration-300">
            <ResultsSection results={resp.executionResults} isStreaming={isStreaming} />
          </div>
        )}
        {hasCommentary && (
          <div className="animate-in fade-in duration-300">
            <CommentarySection content={resp.commentary || ""} isStreaming={isStreaming} />
          </div>
        )}
        {showGenButtons && <GenerationButtons />}
      </div>
    </div>
  )
}
