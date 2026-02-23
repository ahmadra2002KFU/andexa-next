export interface ChatMessage {
  id: string
  role: "user" | "assistant"
  content?: string
  response?: AssistantResponse
  timestamp: Date
}

export interface AssistantResponse {
  analysis: string
  generatedCode: string
  executionResults?: ExecutionResult
  commentary: string
  plots?: PlotData[]
  retryEvents?: RetryEvent[]
  toolPhaseEvents?: ToolPhaseEvent[]
}

export interface ExecutionResult {
  success: boolean
  result?: unknown
  error?: string
  executionTime?: number
  dataframe?: DataFrameResult
}

export interface DataFrameResult {
  columns: string[]
  data: Record<string, unknown>[]
  totalRows: number
  truncated: boolean
}

export interface PlotData {
  data: unknown[]
  layout: Record<string, unknown>
}

export interface RetryEvent {
  type: "retry_start" | "retry_progress" | "retry_complete" | "retry_failed"
  attempt: number
  maxAttempts: number
  errorType?: string
  message?: string
}

export interface ToolPhaseEvent {
  type: "tool_phase_start" | "tool_call" | "tool_result" | "tool_phase_complete"
  iteration?: number
  toolName?: string
  arguments?: Record<string, unknown>
  success?: boolean
  summary?: string
  toolCount?: number
  durationMs?: number
}

export interface StreamEvent {
  event: string
  field?: string
  delta?: string
  position?: number
  final?: Record<string, string>
  execution_results?: ExecutionResult
  // retry/tool events
  attempt?: number
  max_attempts?: number
  error_type?: string
  tool_name?: string
  iteration?: number
  tool_count?: number
  duration_ms?: number
  success?: boolean
  summary?: string
}

export interface ChatSession {
  id: number
  title: string
  messageCount: number
  createdAt: string
}
