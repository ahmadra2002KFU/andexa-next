// Domain types for the Andexa platform

// ── Chat ──────────────────────────────────────────────────────────────
export interface ChatMessage {
  id: string;
  chatId: string;
  role: "user" | "assistant";
  content: string;
  generatedCode?: string | null;
  commentary?: string | null;
  executionResults?: ExecutionResult | null;
  groundTruthKpis?: GroundTruthKpi[] | null;
  provider?: string | null;
  createdAt: string;
}

export interface Chat {
  id: string;
  title?: string | null;
  userId: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
}

// ── Execution ─────────────────────────────────────────────────────────
export interface ExecutionResult {
  success: boolean;
  output: string;
  results: Record<string, unknown>;
  executed_code?: string;
  error?: string;
  execution_time_ms?: number;
}

export interface CodeExecutionRequest {
  code: string;
  file_paths: string[];
  timeout?: number;
}

// ── Files ─────────────────────────────────────────────────────────────
export interface UploadedFile {
  id: string;
  originalFilename: string;
  storedFilename: string;
  storedPath: string;
  sizeMb: number;
  rows: number;
  columns: number;
  columnMetadata: ColumnMetadata | null;
  isActive: boolean;
  createdAt: string;
}

export interface ColumnMetadata {
  basic_info: {
    filename: string;
    shape: { rows: number; columns: number };
    column_names: string[];
    dtypes: Record<string, string>;
    memory_usage_mb?: number;
  };
  columns: Record<
    string,
    {
      dtype: string;
      column_type: string;
      null_count: number;
      null_percentage: number;
      unique_count: number;
      non_null_count: number;
      min?: number;
      max?: number;
      mean?: number;
      top_values?: Array<{ value: string; count: number }>;
    }
  >;
  data_quality: {
    data_quality_score: number;
    missing_cells: number;
    missing_percentage: number;
    duplicate_rows: number;
    potential_issues: string[];
  };
}

// ── Providers ─────────────────────────────────────────────────────────
export type ProviderType = "groq" | "lmstudio" | "zai" | "ollama";

export interface ProviderInfo {
  id: ProviderType;
  name: string;
  status: "healthy" | "degraded" | "unavailable";
  isDefault: boolean;
}

// ── Rules ─────────────────────────────────────────────────────────────
export interface AnalysisRule {
  id: string;
  text: string;
  category: string;
  priority: number;
  active: boolean;
  createdAt: string;
}

// ── Ground Truth / Anti-Hallucination ─────────────────────────────────
export interface GroundTruthKpi {
  source_key: string;
  value: number | string;
  formatted_value: string;
  value_type: string;
}

// ── Reports ───────────────────────────────────────────────────────────
export interface ReportRequest {
  query: string;
  analysis: string;
  generatedCode: string;
  executionResults: ExecutionResult;
  commentary: string;
}

export interface ReportFinding {
  content: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
  source_keys: string[];
  context: string;
}

export interface ReportInsight {
  what: string;
  why: string;
  so_what: string;
  source_keys: string[];
}

export interface ReportRisk {
  description: string;
  severity: "HIGH" | "MEDIUM" | "LOW";
  mitigation: string;
}

export interface ReportAction {
  action: string;
  rationale: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
}

// ── Dashboards ────────────────────────────────────────────────────────
export interface DashboardKpi {
  label: string;
  value: string;
  icon: string;
  confidence?: "VERIFIED" | "UNVERIFIED";
}

export interface DashboardConfig {
  title: string;
  kpis: DashboardKpi[];
  insights: string[];
  recommendations: string[];
}

// ── Tool Phase Status ─────────────────────────────────────────────────
export interface ToolPhaseStatus {
  active: boolean;
  phase: "tools" | "thinking" | "executing" | "retrying" | "commenting" | "idle";
  toolCalls: Array<{ iteration: number; toolName: string; status: "calling" | "done"; summary?: string }>;
  retryAttempt?: number;
  retryError?: string;
  retryExplanation?: string;
}

// ── Streaming Events ──────────────────────────────────────────────────
export type StreamEvent =
  | { type: "tool_phase_start"; maxIterations: number }
  | { type: "tool_call"; iteration: number; toolName: string; args: Record<string, unknown> }
  | { type: "tool_result"; iteration: number; toolName: string; success: boolean; summary: string }
  | { type: "tool_phase_complete"; toolCount: number; durationMs: number }
  | { type: "analysis_delta"; delta: string }
  | { type: "analysis_done"; content: string }
  | { type: "analysis"; content: string } // legacy fallback
  | { type: "code_delta"; delta: string }
  | { type: "code_done"; content: string }
  | { type: "code"; content: string } // legacy fallback
  | { type: "execution"; result: ExecutionResult }
  | { type: "commentary_delta"; delta: string }
  | { type: "commentary_done"; content: string }
  | { type: "commentary"; content: string } // legacy fallback
  | { type: "retry_start"; attempt: number; errorType: string }
  | { type: "retry_complete"; attempt: number }
  | { type: "retry_failed"; totalAttempts: number; explanation?: string }
  | { type: "phase"; phase: "tools" | "thinking" | "executing" | "retrying" | "commenting" }
  | { type: "error"; message: string }
  | { type: "done"; chatId: string };
