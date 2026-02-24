"use client"

import { useCallback, useRef } from "react"
import { useChatStore } from "@/stores/chat-store"
import { useSettingsStore } from "@/stores/settings-store"
import type { AssistantResponse, PlotData, ExecutionResult } from "@/types/chat"
import type { StreamEvent } from "@/types"

function isTraceExecEnabled(): boolean {
  if (process.env.NEXT_PUBLIC_ANDEXA_TRACE_EXECUTION === "1" || process.env.NODE_ENV !== "production") {
    return true
  }
  if (typeof window !== "undefined") {
    return window.localStorage.getItem("ANDEXA_TRACE_EXECUTION") === "1"
  }
  return false
}

// Always-on logger for critical events (visible in browser console regardless of env)
const log = {
  info: (...args: unknown[]) => console.log("[Andexa]", ...args),
  warn: (...args: unknown[]) => console.warn("[Andexa]", ...args),
  error: (...args: unknown[]) => console.error("[Andexa]", ...args),
  debug: (...args: unknown[]) => {
    if (isTraceExecEnabled()) console.log("[Andexa:debug]", ...args)
  },
}

function isPlainObject(val: unknown): val is Record<string, unknown> {
  return val !== null && typeof val === "object" && !Array.isArray(val)
}

function isLikelyPlotlyFigure(obj: Record<string, unknown>): boolean {
  if (obj.type === "plotly_figure") return true
  if (!Array.isArray(obj.data)) return false
  const firstTrace = obj.data[0]
  return (
    firstTrace === undefined ||
    (isPlainObject(firstTrace) && ("type" in firstTrace || "x" in firstTrace || "y" in firstTrace))
  )
}

/** Recursively remove any { type: "plotly_figure" } objects from a value */
function stripPlotly(val: unknown): unknown {
  if (val === null || val === undefined || typeof val !== "object") return val
  if (Array.isArray(val)) {
    return val
      .filter((item) => !(isPlainObject(item) && isLikelyPlotlyFigure(item)))
      .map(stripPlotly)
  }
  const obj = val as Record<string, unknown>
  if (isLikelyPlotlyFigure(obj)) return undefined
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) {
    const stripped = stripPlotly(v)
    if (stripped !== undefined) out[k] = stripped
  }
  return Object.keys(out).length > 0 ? out : undefined
}

function summarizeExecutionEvent(er: Record<string, unknown>): Record<string, unknown> {
  const backendResults = (er.results ?? {}) as Record<string, unknown>
  const entries = Object.entries(backendResults).map(([key, val]) => {
    if (isPlainObject(val)) {
      const json = val.json
      return {
        key,
        type: String(val.type ?? "object"),
        keys: Object.keys(val).slice(0, 10),
        jsonSizeBytes: typeof json === "string" ? json.length : undefined,
        hasBdata: typeof json === "string" ? json.includes("bdata") : undefined,
      }
    }
    return { key, type: Array.isArray(val) ? "array" : typeof val }
  })

  return {
    success: er.success,
    outputLength: typeof er.output === "string" ? er.output.length : undefined,
    error: typeof er.error === "string" ? er.error.slice(0, 240) : undefined,
    resultKeys: Object.keys(backendResults),
    entries,
  }
}

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
        log.info("Sending chat request", { provider, messageLength: content.length })
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: content, provider }),
          signal: abortRef.current.signal,
        })

        log.info("Chat response", { status: res.status, ok: res.ok, hasBody: !!res.body })
        if (!res.ok || !res.body) {
          const errorText = !res.ok ? await res.text().catch(() => "") : ""
          log.error("Chat request failed", { status: res.status, errorText: errorText.slice(0, 500) })
          throw new Error(`Chat request failed: ${res.status} ${errorText.slice(0, 200)}`)
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
              log.debug("Stream event", event.type, "type" in event ? event.type : event)
              handleStreamEvent(event, accumulated)
            } catch (parseErr) {
              log.warn("Malformed SSE JSON", { jsonStr: jsonStr.slice(0, 200), error: String(parseErr) })
            }
          }
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") {
          log.info("Chat request aborted by user")
          return
        }
        log.error("Chat request error", {
          name: err instanceof Error ? err.name : "unknown",
          message: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack?.split("\n").slice(0, 3).join("\n") : undefined,
        })
        accumulated.commentary =
          accumulated.commentary || `An error occurred: ${err instanceof Error ? err.message : "Unknown error"}`
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

        if (isTraceExecEnabled()) {
          console.log("[TRACE_EXEC] client_execution_event_in", summarizeExecutionEvent(er))
        }

        // Map backend ExecutionResult to frontend ExecutionResult
        const mapped: ExecutionResult = {
          success: er.success as boolean,
          error: er.error as string | undefined,
          executionTime: typeof er.execution_time_ms === "number" ? er.execution_time_ms / 1000 : undefined,
        }

        // Extract scalar result or dataframe from backend results dict
        for (const [, val] of Object.entries(backendResults)) {
          if (val && typeof val === "object") {
            const obj = val as Record<string, unknown>
            if (obj.type === "plotly_figure") {
              try {
                // The plotly figure may have data/layout directly, or nested in a "json" string
                let figData: { data: unknown[]; layout: Record<string, unknown> }
                if ("json" in obj && typeof obj.json === "string") {
                  figData = JSON.parse(obj.json)
                  if (isTraceExecEnabled()) {
                    console.log("[TRACE_EXEC] client_plot_from_json", {
                      key: "json",
                      dataLen: Array.isArray(figData.data) ? figData.data.length : 0,
                      layoutKeys: Object.keys(figData.layout || {}).slice(0, 10),
                    })
                  }
                } else if ("data" in obj && Array.isArray(obj.data)) {
                  figData = obj as unknown as { data: unknown[]; layout: Record<string, unknown> }
                  if (isTraceExecEnabled()) {
                    console.log("[TRACE_EXEC] client_plot_from_object", {
                      dataLen: Array.isArray(figData.data) ? figData.data.length : 0,
                      layoutKeys: Object.keys(figData.layout || {}).slice(0, 10),
                    })
                  }
                } else {
                  if (isTraceExecEnabled()) {
                    console.warn("[TRACE_EXEC] client_plot_skipped_unrecognized_format", {
                      keys: Object.keys(obj),
                    })
                  }
                  continue // skip unrecognized plotly format, don't exit loop
                }
                const plot: PlotData = { data: figData.data, layout: figData.layout }
                acc.plots = [...(acc.plots || []), plot]
                replaceStreamingField("plots", acc.plots)
              } catch {
                if (isTraceExecEnabled()) {
                  console.warn("[TRACE_EXEC] client_plot_parse_failed")
                }
                // skip malformed plotly figure
              }
            } else if (obj.type === "dataframe" || (Array.isArray(obj.columns) && (Array.isArray(obj.data) || Array.isArray(obj.head)))) {
              const rows = (Array.isArray(obj.data) ? obj.data : obj.head) as Record<string, unknown>[] | undefined
              mapped.dataframe = {
                columns: obj.columns as string[],
                data: rows ?? [],
                totalRows: (obj.total_rows ?? obj.totalRows ?? rows?.length ?? 0) as number,
                truncated: (obj.truncated ?? false) as boolean,
              }
              if (isTraceExecEnabled()) {
                console.log("[TRACE_EXEC] client_dataframe_mapped", {
                  columns: mapped.dataframe.columns.length,
                  rowPreviewCount: mapped.dataframe.data.length,
                  totalRows: mapped.dataframe.totalRows,
                  truncated: mapped.dataframe.truncated,
                })
              }
            } else if (obj.type !== "plotly_figure") {
              // Generic object result — strip any nested plotly figures before storing
              if (mapped.result === undefined) {
                mapped.result = stripPlotly(val)
              }
            }
          } else {
            // Scalar value — only set if we don't already have a richer result
            if (mapped.result === undefined) {
              mapped.result = val
            }
          }
        }

        // If no result extracted from results dict, use output as fallback
        if (mapped.result === undefined && !mapped.dataframe && er.output) {
          mapped.result = er.output
        }

        if (isTraceExecEnabled()) {
          console.log("[TRACE_EXEC] client_execution_event_out", {
            success: mapped.success,
            hasDataframe: !!mapped.dataframe,
            hasResult: mapped.result !== undefined,
            plotCount: acc.plots?.length ?? 0,
            resultType: mapped.result === undefined ? "undefined" : Array.isArray(mapped.result) ? "array" : typeof mapped.result,
          })
        }

        acc.executionResults = mapped
        replaceStreamingField("executionResults", mapped)
        break
      }

      case "phase":
        log.info("Phase change:", event.phase)
        setToolPhase({ active: true, phase: event.phase })
        break

      case "tool_phase_start":
        log.info("Tool phase started")
        setToolPhase({ active: true, phase: "tools", toolCalls: [] })
        break

      case "tool_call":
        log.info("Tool call:", event.toolName, "iteration:", event.iteration)
        addToolCall({ iteration: event.iteration, toolName: event.toolName, status: "calling" })
        break

      case "tool_result":
        log.info("Tool result:", "iteration:", event.iteration, "summary:", event.summary)
        updateToolCall(event.iteration, { status: "done", summary: event.summary })
        break

      case "tool_phase_complete":
        log.info("Tool phase complete")
        setToolPhase({ active: false, phase: "thinking" })
        break

      case "retry_start":
        log.warn("Retry started", { attempt: event.attempt, errorType: event.errorType })
        setToolPhase({ active: true, phase: "retrying", retryAttempt: event.attempt, retryError: event.errorType })
        break

      case "retry_failed":
        log.error("All retries failed", { explanation: event.explanation })
        setToolPhase({ active: false, phase: "idle", retryExplanation: event.explanation })
        break

      case "error":
        log.error("Server error event:", event.message)
        acc.commentary = acc.commentary || event.message
        replaceStreamingField("commentary", event.message)
        break

      case "done":
        log.info("Stream complete", {
          hasAnalysis: !!acc.analysis,
          hasCode: !!acc.generatedCode,
          hasCommentary: !!acc.commentary,
          plotCount: acc.plots?.length ?? 0,
          hasExecution: !!acc.executionResults,
        })
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
