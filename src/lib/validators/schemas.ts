import { z } from "zod";

// ── Chat request ──────────────────────────────────────────────────────
export const chatRequestSchema = z.object({
  message: z.string().min(1).max(10000),
  provider: z.enum(["groq", "lmstudio", "zai", "ollama", "auto"]).default("groq"),
  chatId: z.string().optional(),
});
export type ChatRequest = z.infer<typeof chatRequestSchema>;

// ── LLM structured response ──────────────────────────────────────────
export const llmResponseSchema = z.object({
  initial_response: z.string(),
  generated_code: z.string(),
  result_commentary: z.string(),
});
export type LLMResponse = z.infer<typeof llmResponseSchema>;

// ── Execution request / result ────────────────────────────────────────
export const executeRequestSchema = z.object({
  code: z.string().min(1),
  file_paths: z.array(z.string()).default([]),
  timeout: z.number().int().min(1).max(300).default(30),
});

export const executionResultSchema = z.object({
  success: z.boolean(),
  output: z.string().default(""),
  results: z.record(z.string(), z.unknown()).default({}),
  executed_code: z.string().optional(),
  error: z.string().optional(),
  execution_time_ms: z.number().optional(),
});
export type ExecutionResultSchema = z.infer<typeof executionResultSchema>;

// ── File upload ───────────────────────────────────────────────────────
export const uploadResponseSchema = z.object({
  id: z.string(),
  originalFilename: z.string(),
  rows: z.number(),
  columns: z.number(),
  sizeMb: z.number(),
});

// ── Rules ─────────────────────────────────────────────────────────────
export const createRuleSchema = z.object({
  text: z.string().min(1).max(1000),
  category: z.string().default("general"),
  priority: z.number().int().min(1).max(10).default(1),
});

export const updateRuleSchema = z.object({
  text: z.string().min(1).max(1000).optional(),
  active: z.boolean().optional(),
  priority: z.number().int().min(1).max(10).optional(),
});

// ── Report request ────────────────────────────────────────────────────
export const reportRequestSchema = z.object({
  query: z.string(),
  analysis: z.string(),
  generatedCode: z.string(),
  executionResults: executionResultSchema,
  commentary: z.string(),
});

// ── Dashboard request ─────────────────────────────────────────────────
export const dashboardRequestSchema = z.object({
  query: z.string(),
  analysis: z.string(),
  executionResults: executionResultSchema,
  commentary: z.string(),
});

// ── Provider health ───────────────────────────────────────────────────
export const providerInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.enum(["healthy", "degraded", "unavailable"]),
  isDefault: z.boolean(),
});

// ── Transcription ─────────────────────────────────────────────────────
export const transcriptionResponseSchema = z.object({
  text: z.string(),
});
