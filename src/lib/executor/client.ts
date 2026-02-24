import type { ExecutionResult } from "@/types";

const EXECUTOR_URL = process.env.EXECUTOR_URL || "http://localhost:8020";
const TIMEOUT = 60_000;
const TRACE_EXEC = process.env.ANDEXA_TRACE_EXECUTION === "1" || process.env.NODE_ENV !== "production";

function summarizeExecutorResponse(path: string, payload: unknown): Record<string, unknown> {
  if (path !== "/execute") return { path, type: typeof payload };
  const result = payload as ExecutionResult;
  const entries = Object.entries(result.results || {}).map(([key, value]) => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const obj = value as Record<string, unknown>;
      const json = obj.json;
      return {
        key,
        type: obj.type ?? "object",
        keys: Object.keys(obj).slice(0, 8),
        jsonSizeBytes: typeof json === "string" ? json.length : undefined,
        hasBdata: typeof json === "string" ? json.includes("bdata") : undefined,
      };
    }
    return { key, type: Array.isArray(value) ? "array" : typeof value };
  });
  return {
    path,
    success: result.success,
    outputLength: result.output?.length ?? 0,
    resultKeys: Object.keys(result.results || {}),
    entries,
    executionTimeMs: result.execution_time_ms,
  };
}

async function post<T>(path: string, body: unknown): Promise<T> {
  if (TRACE_EXEC) {
    const reqBody = body as Record<string, unknown>;
    console.log("[TRACE_EXEC] executor_request", {
      path,
      codeLength: typeof reqBody.code === "string" ? reqBody.code.length : undefined,
      fileCount: Array.isArray(reqBody.file_paths) ? reqBody.file_paths.length : undefined,
      timeout: reqBody.timeout,
    });
  }
  const res = await fetch(`${EXECUTOR_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "Unknown error");
    if (TRACE_EXEC) {
      console.error("[TRACE_EXEC] executor_error", { path, status: res.status, body: text.slice(0, 1000) });
    }
    throw new Error(`Executor ${path} failed (${res.status}): ${text}`);
  }
  const json = (await res.json()) as T;
  if (TRACE_EXEC) {
    console.log("[TRACE_EXEC] executor_response", summarizeExecutorResponse(path, json));
  }
  return json;
}

async function postForm<T>(path: string, formData: FormData, timeoutMs = 30_000): Promise<T> {
  const res = await fetch(`${EXECUTOR_URL}${path}`, {
    method: "POST",
    body: formData,
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "Unknown error");
    throw new Error(`Executor ${path} failed (${res.status}): ${text}`);
  }
  return res.json() as Promise<T>;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${EXECUTOR_URL}${path}`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Executor GET ${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

export const executorClient = {
  /**
   * Execute Python code against loaded DataFrames.
   * @param code - Python code to execute
   * @param filePaths - Paths to data files to load as DataFrames
   * @param timeout - Execution timeout in seconds (default 30)
   */
  async executeCode(
    code: string,
    filePaths: string[],
    timeout = 30
  ): Promise<ExecutionResult> {
    return post<ExecutionResult>("/execute", {
      code,
      file_paths: filePaths,
      timeout,
    });
  },

  /** Inspect a column in a file — returns dtype, sample values, stats. */
  async inspectColumn(
    filePath: string,
    columnName: string,
    sampleSize = 10
  ): Promise<Record<string, unknown>> {
    return post("/inspect-column", {
      file_path: filePath,
      column_name: columnName,
      sample_size: sampleSize,
    });
  },

  /**
   * Extract KPIs by evaluating expressions against a loaded DataFrame.
   * @param filePaths - Paths to data files
   * @param expressions - Array of { label, extract } where extract is a Python expression
   */
  async extractKpis(
    filePaths: string[],
    expressions: Array<{ label: string; extract: string }>
  ): Promise<{ kpis: Array<{ label: string; value: unknown; success: boolean; error?: string }> }> {
    return post("/extract-kpis", {
      file_paths: filePaths,
      expressions,
    });
  },

  /**
   * Convert Plotly figures to PNG images (base64 encoded).
   * @param plots - Array of plot objects with a `json` field containing Plotly JSON
   * @param dpi - Resolution (default 150)
   */
  async generateReportAssets(
    plots: Array<Record<string, unknown>>,
    dpi = 150
  ): Promise<{
    images: Array<{ base64?: string; width?: number; height?: number; error?: string }>;
  }> {
    return post("/generate-report-assets", { plots, dpi });
  },

  /** Generate a self-contained HTML dashboard. */
  async generateDashboard(config: {
    title: string;
    kpis: Array<{ label: string; value: string; icon: string }>;
    plots: Array<Record<string, unknown>>;
    insights: string[];
    recommendations: string[];
    analysis: string;
    generated_code: string;
    execution_output: string;
    commentary: string;
  }): Promise<{ html: string }> {
    return post("/generate-dashboard", config);
  },

  /** Upload a file to the executor. Returns metadata. */
  async uploadFile(formData: FormData): Promise<{
    filename: string;
    rows: number;
    columns: number;
    column_metadata: Record<string, unknown>;
    stored_path: string;
  }> {
    return postForm("/upload", formData);
  },

  /** Health check. */
  async healthCheck(): Promise<{ status: string; libraries: Record<string, string> }> {
    return get("/health");
  },
};
