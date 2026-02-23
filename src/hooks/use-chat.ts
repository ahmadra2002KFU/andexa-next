"use client"

import { useCallback, useRef } from "react"
import { useChatStore } from "@/stores/chat-store"
import { useSettingsStore } from "@/stores/settings-store"
import type { AssistantResponse, PlotData, ExecutionResult } from "@/types/chat"
import type { StreamEvent } from "@/types"

export function useChat() {
  const {
    messages,
    isStreaming,
    streamingResponse,
    activeMessageId,
    toolPhase,
    addUserMessage,
    startStreaming,
    updateStreamingField,
    replaceStreamingField,
    setToolPhase,
    addToolCall,
    updateToolCall,
    finalizeResponse,
    stopStreaming,
    clearMessages,
  } = useChatStore()

  const provider = useSettingsStore((s) => s.provider)
  const abortRef = useRef<AbortController | null>(null)

  const sendMessage = useCallback(
    async (content: string) => {
      if (isStreaming) return

      const userMsgId = addUserMessage(content)
      startStreaming(userMsgId)

      const accumulated: AssistantResponse = {
        analysis: "",
        generatedCode: "",
        commentary: "",
        plots: [],
      }

      try {
        abortRef.current = new AbortController()
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: content, provider }),
          signal: abortRef.current.signal,
        })

        if (!res.ok || !res.body) {
          throw new Error(`Chat request failed: ${res.status}`)
        }

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ""

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split("\n")
          buffer = lines.pop() || ""

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue
            const jsonStr = line.slice(6).trim()
            if (!jsonStr || jsonStr === "[DONE]") continue

            try {
              const event: StreamEvent = JSON.parse(jsonStr)
              handleStreamEvent(event, accumulated)
            } catch {
              // skip malformed JSON
            }
          }
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") return
        accumulated.commentary =
          accumulated.commentary || "An error occurred while processing your request."
      } finally {
        const { activeMessageId: finalId } = useChatStore.getState()
        if (finalId) {
          finalizeResponse(finalId, accumulated)
        } else {
          stopStreaming()
        }
        abortRef.current = null
      }
    },
    [isStreaming, provider, addUserMessage, startStreaming, finalizeResponse, stopStreaming]
  )

  function handleStreamEvent(event: StreamEvent, acc: AssistantResponse) {
    switch (event.type) {
      // ── Streaming delta events ──
      case "analysis_delta":
        if (!acc.analysis) setToolPhase({ active: true, phase: "thinking" })
        acc.analysis = (acc.analysis || "") + event.delta
        updateStreamingField("analysis", acc.analysis)
        break

      case "analysis_done":
        acc.analysis = event.content
        replaceStreamingField("analysis", event.content)
        break

      case "code_delta":
        acc.generatedCode = (acc.generatedCode || "") + event.delta
        updateStreamingField("generatedCode", acc.generatedCode)
        break

      case "code_done":
        acc.generatedCode = event.content
        replaceStreamingField("generatedCode", event.content)
        break

      case "commentary_delta":
        if (!acc.commentary) setToolPhase({ active: true, phase: "commenting" })
        acc.commentary = (acc.commentary || "") + event.delta
        updateStreamingField("commentary", acc.commentary)
        break

      case "commentary_done":
        acc.commentary = event.content
        replaceStreamingField("commentary", event.content)
        break

      // ── Legacy single-event fallbacks ──
      case "analysis":
        acc.analysis = event.content
        replaceStreamingField("analysis", event.content)
        break

      case "code":
        acc.generatedCode = event.content
        replaceStreamingField("generatedCode", event.content)
        break

      case "commentary":
        acc.commentary = event.content
        replaceStreamingField("commentary", event.content)
        break

      case "execution": {
        setToolPhase({ active: false, phase: "idle" })
        const er = event.result as unknown as Record<string, unknown>
        const backendResults = (er.results ?? {}) as Record<string, unknown>

        // Map backend ExecutionResult to frontend ExecutionResult
        const mapped: ExecutionResult = {
          success: er.success as boolean,
          error: er.error as string | undefined,
          executionTime: typeof er.execution_time_ms === "number" ? er.execution_time_ms / 1000 : undefined,
        }

        // Extract scalar result or dataframe from backend results dict
        for (const val of Object.values(backendResults)) {
          if (val && typeof val === "object") {
            const obj = val as Record<string, unknown>
            if (obj.type === "plotly_figure") {
              const plotData = obj as unknown as { data: unknown[]; layout: Record<string, unknown> }
              const plot: PlotData = { data: plotData.data, layout: plotData.layout }
              acc.plots = [plot]
              replaceStreamingField("plots", [plot])
            } else if (obj.type === "dataframe" || (Array.isArray(obj.data) && Array.isArray(obj.columns))) {
              mapped.dataframe = {
                columns: obj.columns as string[],
                data: obj.data as Record<string, unknown>[],
                totalRows: (obj.total_rows ?? obj.totalRows ?? (obj.data as unknown[]).length) as number,
                truncated: (obj.truncated ?? false) as boolean,
              }
            } else {
              // Generic object result
              mapped.result = val
            }
          } else {
            mapped.result = val
          }
        }

        // If no result extracted from results dict, use output as fallback
        if (mapped.result === undefined && !mapped.dataframe && er.output) {
          mapped.result = er.output
        }

        acc.executionResults = mapped
        replaceStreamingField("executionResults", mapped)
        break
      }

      case "phase":
        setToolPhase({ active: true, phase: event.phase })
        break

      case "tool_phase_start":
        setToolPhase({ active: true, phase: "tools", toolCalls: [] })
        break

      case "tool_call":
        addToolCall({ iteration: event.iteration, toolName: event.toolName, status: "calling" })
        break

      case "tool_result":
        updateToolCall(event.iteration, { status: "done", summary: event.summary })
        break

      case "tool_phase_complete":
        setToolPhase({ active: false, phase: "thinking" })
        break

      case "retry_start":
        setToolPhase({ active: true, phase: "retrying", retryAttempt: event.attempt, retryError: event.errorType })
        break

      case "retry_failed":
        setToolPhase({ active: false, phase: "idle", retryExplanation: event.explanation })
        break

      case "error":
        acc.commentary = acc.commentary || event.message
        replaceStreamingField("commentary", event.message)
        break

      case "done":
        setToolPhase({ active: false, phase: "idle" })
        break
    }
  }

  const cancel = useCallback(() => {
    abortRef.current?.abort()
    stopStreaming()
  }, [stopStreaming])

  return {
    messages,
    isStreaming,
    streamingResponse,
    activeMessageId,
    toolPhase,
    sendMessage,
    cancel,
    clearMessages,
  }
}
