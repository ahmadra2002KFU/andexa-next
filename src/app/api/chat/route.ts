import { generateObject, generateText, streamObject, streamText } from "ai";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { getModel } from "@/lib/ai/providers";
import { buildSystemPrompt } from "@/lib/ai/system-prompt";
import { createDataTools, filenameToVariable } from "@/lib/ai/tools";
import { executeWithRetry } from "@/lib/ai/retry";
import { extractGroundTruth } from "@/lib/ai/ground-truth";
import { chatRequestSchema } from "@/lib/validators/schemas";
import type { ProviderType, ColumnMetadata, ExecutionResult } from "@/types";
import { Prisma } from "@prisma/client";

export const maxDuration = 120;
const TRACE_EXEC = process.env.ANDEXA_TRACE_EXECUTION === "1" || process.env.NODE_ENV !== "production";

// Always-on server logger for critical pipeline events
const slog = {
  info: (...args: unknown[]) => console.log("[Chat API]", ...args),
  warn: (...args: unknown[]) => console.warn("[Chat API]", ...args),
  error: (...args: unknown[]) => console.error("[Chat API]", ...args),
};
const structuredLayerSchema = z.object({
  initial_response: z.string().default(""),
  generated_code: z.string().default(""),
});
type StructuredLayer = z.infer<typeof structuredLayerSchema>;

type UploadedFileRow = {
  id: string;
  originalFilename: string;
  storedPath: string;
  rows: number;
  columns: number;
  columnMetadata: unknown;
  isActive: boolean;
  createdAt: Date;
};

const MAX_CONTEXT_FILES = (() => {
  const parsed = Number.parseInt(process.env.ANDEXA_MAX_CONTEXT_FILES || "4", 10);
  if (!Number.isFinite(parsed)) return 4;
  return Math.min(20, Math.max(1, parsed));
})();

function normalizeWorkspaceSessionId(value?: string): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, 128);
}

function normalizeToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function stripExtension(filename: string): string {
  return filename.replace(/\.[^.]+$/, "");
}

function isFileMentioned(messageNormalized: string, filename: string): boolean {
  if (!messageNormalized) return false;
  const full = normalizeToken(filename);
  const base = normalizeToken(stripExtension(filename));
  const variable = normalizeToken(filenameToVariable(filename));
  return (
    (full.length >= 3 && messageNormalized.includes(full)) ||
    (base.length >= 3 && messageNormalized.includes(base)) ||
    (variable.length >= 3 && messageNormalized.includes(variable))
  );
}

function hasMultiFileIntent(message: string): boolean {
  const text = message.toLowerCase();
  if (/\b(join|merge|compare|across|between|combine|union)\b/.test(text)) return true;
  return /all\s+files|multiple\s+files|multi-?file|all\s+datasets|all\s+tables/.test(text);
}

function pickActiveFile(
  files: UploadedFileRow[],
  preferredActiveFileId?: string
): UploadedFileRow | null {
  if (files.length === 0) return null;
  if (preferredActiveFileId) {
    const preferred = files.find((f) => f.id === preferredActiveFileId);
    if (preferred) return preferred;
  }
  const markedActive = files.find((f) => f.isActive);
  return markedActive ?? files[0];
}

function buildExecutionScope(
  files: UploadedFileRow[],
  activeFile: UploadedFileRow | null,
  message: string,
  maxFiles: number
): UploadedFileRow[] {
  if (files.length === 0) return [];

  const mentioned = files.filter((f) => isFileMentioned(normalizeToken(message), f.originalFilename));
  const multiFileIntent = hasMultiFileIntent(message) || mentioned.length > 1;

  const scoped: UploadedFileRow[] = [];
  const seen = new Set<string>();
  const add = (file?: UploadedFileRow | null) => {
    if (!file || seen.has(file.id)) return;
    scoped.push(file);
    seen.add(file.id);
  };

  add(activeFile);
  for (const file of mentioned) add(file);

  if (multiFileIntent) {
    for (const file of files.filter((f) => f.isActive)) {
      add(file);
      if (scoped.length >= maxFiles) return scoped;
    }
    for (const file of files) {
      add(file);
      if (scoped.length >= maxFiles) return scoped;
    }
  }

  if (scoped.length === 0) add(files[0]);
  return scoped.slice(0, maxFiles);
}

function summarizeExecutionResults(executionResult: ExecutionResult): Record<string, unknown> {
  const entries = Object.entries(executionResult.results || {}).map(([key, value]) => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const obj = value as Record<string, unknown>;
      const json = obj.json;
      return {
        key,
        type: obj.type ?? "object",
        keys: Object.keys(obj).slice(0, 12),
        jsonSizeBytes: typeof json === "string" ? json.length : undefined,
        hasBdata: typeof json === "string" ? json.includes("bdata") : undefined,
      };
    }
    return { key, type: Array.isArray(value) ? "array" : typeof value };
  });

  return {
    success: executionResult.success,
    outputLength: executionResult.output?.length ?? 0,
    error: executionResult.error ? executionResult.error.slice(0, 240) : undefined,
    executionTimeMs: executionResult.execution_time_ms,
    resultKeys: Object.keys(executionResult.results || {}),
    entries,
  };
}

function cleanCodeBlock(code: string): string {
  let c = code.trim();
  if (c.startsWith("```python")) c = c.slice(9);
  else if (c.startsWith("```")) c = c.slice(3);
  if (c.endsWith("```")) c = c.slice(0, -3);
  return c.trim();
}

function extractCodeFence(text: string): string {
  const m = text.match(/```(?:python)?\s*([\s\S]*?)```/i);
  return m?.[1]?.trim() ?? "";
}

function stripCodeFences(text: string): string {
  return text.replace(/```[\s\S]*?```/g, "").trim();
}

function parseStructuredFromText(text: string): StructuredLayer | null {
  const candidates: string[] = [];
  const trimmed = text.trim();
  if (trimmed) candidates.push(trimmed);

  const fencedJson = trimmed.match(/```json\s*([\s\S]*?)```/i)?.[1]?.trim();
  if (fencedJson) candidates.push(fencedJson);

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    candidates.push(trimmed.slice(firstBrace, lastBrace + 1).trim());
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      const validated = structuredLayerSchema.safeParse(parsed);
      if (validated.success) {
        return {
          initial_response: validated.data.initial_response.trim(),
          generated_code: cleanCodeBlock(validated.data.generated_code),
        };
      }
    } catch {
      // try next candidate
    }
  }

  return null;
}

async function generateStructuredFallback(
  provider: ProviderType,
  system: string,
  prompt: string
): Promise<{ result: StructuredLayer | null; source: string }> {
  try {
    const obj = await generateObject({
      model: getModel(provider),
      schema: structuredLayerSchema,
      system,
      prompt,
      temperature: 0.2,
    });
    const structured = {
      initial_response: (obj.object.initial_response ?? "").trim(),
      generated_code: cleanCodeBlock(obj.object.generated_code ?? ""),
    };
    if (structured.initial_response || structured.generated_code) {
      return { result: structured, source: "generateObject" };
    }
  } catch (err) {
    if (TRACE_EXEC) {
      console.warn("[TRACE_EXEC] structured_fallback_generateObject_failed", err);
    }
  }

  try {
    const jsonText = await generateText({
      model: getModel(provider),
      system:
        system +
        '\n\nReturn ONLY valid JSON with keys "initial_response" and "generated_code".' +
        " generated_code must be plain Python code (no markdown fences).",
      prompt,
      temperature: 0.2,
      maxOutputTokens: 3000,
    });
    const parsed = parseStructuredFromText(jsonText.text ?? "");
    if (parsed && (parsed.initial_response || parsed.generated_code)) {
      return { result: parsed, source: "generateText-json" };
    }
  } catch (err) {
    if (TRACE_EXEC) {
      console.warn("[TRACE_EXEC] structured_fallback_generateText_json_failed", err);
    }
  }

  try {
    const plain = await generateText({
      model: getModel(provider),
      system:
        system +
        "\n\nRespond with: concise analysis and Python code in a markdown ```python``` block.",
      prompt,
      temperature: 0.2,
      maxOutputTokens: 3000,
    });
    const text = (plain.text ?? "").trim();
    const code = cleanCodeBlock(extractCodeFence(text));
    const analysis = (code ? stripCodeFences(text) : text).trim();
    if (analysis || code) {
      return {
        result: { initial_response: analysis, generated_code: code },
        source: "generateText-plain",
      };
    }
  } catch (err) {
    if (TRACE_EXEC) {
      console.warn("[TRACE_EXEC] structured_fallback_generateText_plain_failed", err);
    }
  }

  return { result: null, source: "none" };
}

export async function POST(req: Request) {
  // 1. Authenticate
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }
  const userId = session.user.id;

  // 2. Parse request
  const body = await req.json();
  const parsed = chatRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const {
    message,
    provider: providerInput,
    chatId: inputChatId,
    activeFileId: preferredActiveFileId,
    workspaceSessionId: workspaceSessionIdInput,
  } = parsed.data;
  const workspaceSessionId = normalizeWorkspaceSessionId(workspaceSessionIdInput);
  const provider = (providerInput === "auto" ? "groq" : providerInput) as ProviderType;
  slog.info("Request", {
    provider,
    messageLength: message.length,
    chatId: inputChatId ?? "new",
    workspaceSession: workspaceSessionId ? "set" : "none",
  });

  // 3. Get or create chat
  let chatId = inputChatId;
  if (!chatId) {
    const chat = await prisma.chat.create({
      data: { userId, title: message.slice(0, 100) },
    });
    chatId = chat.id;
  }

  // 4. Fetch files + rules and build scoped context
  const [initialFiles, rules] = await Promise.all([
    prisma.uploadedFile.findMany({
      where: {
        userId,
        ...(workspaceSessionId ? { sessionId: workspaceSessionId } : {}),
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        originalFilename: true,
        storedPath: true,
        rows: true,
        columns: true,
        columnMetadata: true,
        isActive: true,
        createdAt: true,
      },
    }),
    prisma.rule.findMany({ where: { userId, active: true }, orderBy: { priority: "desc" } }),
  ]);

  let allFiles = initialFiles as UploadedFileRow[];
  let activeFile = pickActiveFile(allFiles, preferredActiveFileId);
  let scopedFiles = buildExecutionScope(allFiles, activeFile, message, MAX_CONTEXT_FILES);
  let fileMetadata = activeFile?.columnMetadata as ColumnMetadata | null;
  const userRules = rules.map((r) => r.text);

  // Multi-file context (scoped only)
  const multiFileContext = scopedFiles.map((f) => {
    const meta = f.columnMetadata as Record<string, unknown> | null;
    const basicInfo = (meta?.basic_info ?? {}) as Record<string, unknown>;
    return {
      filename: f.originalFilename,
      variableName: filenameToVariable(f.originalFilename),
      rows: f.rows,
      columns: f.columns,
      columnNames: (basicInfo.column_names as string[]) ?? [],
    };
  });

  // 5. Build system prompt
  const systemPrompt = buildSystemPrompt({
    fileMetadata,
    multiFileContext: multiFileContext.length > 1 ? multiFileContext : undefined,
    userRules: userRules.length > 0 ? userRules : undefined,
  });

  // SSE stream
  const encoder = new TextEncoder();
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();

  const sendEvent = async (event: Record<string, unknown>) => {
    await writer.write(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
  };

  // Process pipeline in background
  (async () => {
    try {
      // ── Phase 1: Tool exploration ─────────────────────────────
      let toolContext = "";
      if (allFiles.length > 0) {
        await sendEvent({ type: "tool_phase_start", maxIterations: 5 });
        const toolStart = Date.now();
        try {
          const tools = createDataTools(userId, {
            contextFileIds: scopedFiles.map((f) => f.id),
            workspaceSessionId,
          });
          const toolResult = await generateText({
            model: getModel(provider),
            system: systemPrompt + "\n\nYou have access to data exploration tools. Use them to understand the data before writing code.",
            prompt: message,
            tools,
            maxOutputTokens: 2048,
            temperature: 0.3,
          });

          // Build tool context from steps
          if (toolResult.steps && toolResult.steps.length > 0) {
            const toolLines: string[] = ["[TOOL EXPLORATION RESULTS]"];
            let toolCount = 0;
            for (const step of toolResult.steps) {
              if (step.toolCalls) {
                for (const tc of step.toolCalls) {
                  toolCount++;
                  const toolName = "toolName" in tc ? (tc as { toolName: string }).toolName : "unknown";
                  toolLines.push(`${toolCount}. ${toolName}`);
                  await sendEvent({ type: "tool_call", iteration: toolCount, toolName, args: {} });
                }
              }
              if (step.toolResults) {
                for (const tr of step.toolResults) {
                  const toolResult = (tr as { result?: unknown }).result ?? tr;
                  const summary = JSON.stringify(toolResult).slice(0, 300);
                  toolLines.push(`   Result: ${summary}`);
                  await sendEvent({ type: "tool_result", iteration: toolCount, toolName: "tool", success: true, summary: summary.slice(0, 100) });
                }
              }
            }
            toolLines.push("[END TOOL RESULTS]");
            toolContext = toolLines.join("\n");
          }
          await sendEvent({ type: "tool_phase_complete", toolCount: toolContext ? toolContext.split("\n").length : 0, durationMs: Date.now() - toolStart });
        } catch (err) {
          console.error("Tool phase error:", err);
          await sendEvent({ type: "tool_phase_complete", toolCount: 0, durationMs: Date.now() - toolStart });
        }
      }

      // Tools may have changed the active file. Recompute scope to keep prompt + execution aligned.
      if (allFiles.length > 0) {
        allFiles = (await prisma.uploadedFile.findMany({
          where: {
            userId,
            ...(workspaceSessionId ? { sessionId: workspaceSessionId } : {}),
          },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            originalFilename: true,
            storedPath: true,
            rows: true,
            columns: true,
            columnMetadata: true,
            isActive: true,
            createdAt: true,
          },
        })) as UploadedFileRow[];

        activeFile = pickActiveFile(allFiles, preferredActiveFileId);
        scopedFiles = buildExecutionScope(allFiles, activeFile, message, MAX_CONTEXT_FILES);
        fileMetadata = activeFile?.columnMetadata as ColumnMetadata | null;
      }

      slog.info("Tool phase done", {
        toolContextLength: toolContext.length,
        activeFile: activeFile?.originalFilename ?? "none",
        totalFiles: allFiles.length,
        scopedFiles: scopedFiles.length,
      });

      // Rebuild prompt with tool context
      const scopedMultiFileContext = scopedFiles.map((f) => {
        const meta = f.columnMetadata as Record<string, unknown> | null;
        const basicInfo = (meta?.basic_info ?? {}) as Record<string, unknown>;
        return {
          filename: f.originalFilename,
          variableName: filenameToVariable(f.originalFilename),
          rows: f.rows,
          columns: f.columns,
          columnNames: (basicInfo.column_names as string[]) ?? [],
        };
      });

      const finalPrompt = buildSystemPrompt({
        fileMetadata,
        multiFileContext: scopedMultiFileContext.length > 1 ? scopedMultiFileContext : undefined,
        userRules: userRules.length > 0 ? userRules : undefined,
        toolContext: toolContext || undefined,
      });

      // ── Phase 2: Layer 1 — streamed structured response ──────
      // Send a "thinking" status so frontend shows the thinking indicator
      await sendEvent({ type: "phase", phase: "thinking" });

      let lastAnalysis = "";
      let lastCode = "";
      let streamFailed = false;
      let streamErrorMessage = "";

      try {
        const { partialObjectStream } = streamObject({
          model: getModel(provider),
          schema: structuredLayerSchema,
          system: finalPrompt,
          prompt: message,
          temperature: 0.3,
        });

        for await (const partial of partialObjectStream) {
          if (partial.initial_response && partial.initial_response !== lastAnalysis) {
            const delta = partial.initial_response.slice(lastAnalysis.length);
            if (delta) {
              await sendEvent({ type: "analysis_delta", delta });
            }
            lastAnalysis = partial.initial_response;
          }
          if (partial.generated_code && partial.generated_code !== lastCode) {
            const delta = partial.generated_code.slice(lastCode.length);
            if (delta) {
              await sendEvent({ type: "code_delta", delta });
            }
            lastCode = partial.generated_code;
          }
        }
      } catch (streamErr) {
        console.error("streamObject error:", streamErr);
        streamFailed = true;
        streamErrorMessage = streamErr instanceof Error ? streamErr.message : "LLM streaming failed";
      }

      let analysis = lastAnalysis.trim();
      let generatedCode = cleanCodeBlock(lastCode);
      let fallbackSource = "streamObject";

      if (!analysis || !generatedCode) {
        const fallback = await generateStructuredFallback(provider, finalPrompt, message);
        if (fallback.result) {
          if (!analysis) analysis = fallback.result.initial_response.trim();
          if (!generatedCode) generatedCode = cleanCodeBlock(fallback.result.generated_code);
          fallbackSource = fallback.source;
        }
      }

      if (TRACE_EXEC) {
        console.log("[TRACE_EXEC] structured_layer_result", {
          provider,
          streamFailed,
          streamErrorMessage,
          fallbackSource,
          analysisLength: analysis.length,
          generatedCodeLength: generatedCode.length,
        });
      }

      slog.info("Layer 1 complete", { fallbackSource, analysisLength: analysis.length, codeLength: generatedCode.length, streamFailed });

      if (!analysis && !generatedCode) {
        slog.error("Empty response from model", { streamFailed, streamErrorMessage, fallbackSource });
        await sendEvent({ type: "error", message: "The model returned an empty response. Try again or switch providers." });
        await sendEvent({ type: "done", chatId: chatId! });
        return;
      }

      await sendEvent({ type: "analysis_done", content: analysis });
      await sendEvent({ type: "code_done", content: generatedCode });

      // ── Phase 3: Layer 2 — Code execution with retry ──────────
      let executionResult: ExecutionResult = { success: false, output: "", results: {} };

      if (generatedCode.trim()) {
        await sendEvent({ type: "phase", phase: "executing" });
        const columns = fileMetadata?.basic_info.column_names ?? [];
        const dtypes = fileMetadata?.basic_info.dtypes ?? {};

        // Only load scoped files for this request (active + relevant subset).
        // First path is active and becomes `df` in the executor.
        const filePaths = scopedFiles.map((f) => f.storedPath);
        const retryResult = await executeWithRetry({
          code: generatedCode,
          userQuery: message,
          filePaths,
          columns,
          dtypes,
          provider,
          onRetryStart: (attempt, errorType) => {
            sendEvent({ type: "retry_start", attempt, errorType }).catch(() => {});
          },
        });

        executionResult = retryResult.executionResult;
        executionResult.executed_code = retryResult.finalCode;
        slog.info("Layer 2 complete", { success: retryResult.success, attempts: retryResult.totalAttempts, outputLength: executionResult.output?.length ?? 0 });

        if (TRACE_EXEC) {
          console.log("[TRACE_EXEC] chat_execute_result", summarizeExecutionResults(executionResult));
        }

        if (!retryResult.success && retryResult.failureExplanation) {
          await sendEvent({ type: "retry_failed", totalAttempts: retryResult.totalAttempts, explanation: retryResult.failureExplanation });
        }
      }

      // Only send execution event if code was actually executed
      if (generatedCode.trim()) {
        if (TRACE_EXEC) {
          console.log("[TRACE_EXEC] chat_send_execution_event", summarizeExecutionResults(executionResult));
        }
        await sendEvent({ type: "execution", result: executionResult });
      }

      // ── Phase 4: Ground truth extraction ───────────────────────
      const groundTruthKpis = executionResult.success ? extractGroundTruth(executionResult) : [];

      // ── Phase 5: Layer 3 — Commentary ──────────────────────────
      await sendEvent({ type: "phase", phase: "commenting" });
      let commentary = "";
      if (executionResult.success && generatedCode.trim()) {
        try {
          const execSummary = JSON.stringify({
            success: executionResult.success,
            output: (executionResult.output || "").slice(0, 2000),
            results: Object.fromEntries(
              Object.entries(executionResult.results || {}).map(([k, v]) => {
                if (typeof v === "object" && v && (v as Record<string, unknown>).type === "plotly_figure") {
                  return [k, { note: "Plotly figure omitted" }];
                }
                return [k, JSON.stringify(v).slice(0, 500)];
              })
            ),
          }).slice(0, 4000);

          const commentaryStream = streamText({
            model: getModel(provider),
            system: "You provide concise, factual commentary on data analysis results. Start with the direct answer. Use exact numbers.",
            prompt: `Query: "${message}"\nAnalysis: ${analysis.slice(0, 500)}\nExecution Results:\n${execSummary}\n\nProvide concise commentary.`,
            temperature: 0.2,
            maxOutputTokens: 600,
          });

          commentary = "";
          for await (const delta of commentaryStream.textStream) {
            commentary += delta;
            await sendEvent({ type: "commentary_delta", delta });
          }
        } catch (err) {
          console.error("Commentary generation error:", err);
        }
      }

      await sendEvent({ type: "commentary_done", content: commentary });
      slog.info("Layer 3 complete", { commentaryLength: commentary.length });

      // ── Save to database ───────────────────────────────────────
      await prisma.message.createMany({
        data: [
          { chatId: chatId!, role: "user", content: message },
          {
            chatId: chatId!,
            role: "assistant",
            content: analysis,
            generatedCode: generatedCode || null,
            commentary: commentary || null,
            executionResults: executionResult as unknown as Prisma.InputJsonValue,
            groundTruthKpis:
              groundTruthKpis.length > 0
                ? (groundTruthKpis as unknown as Prisma.InputJsonValue)
                : undefined,
            provider,
          },
        ],
      });

      await sendEvent({ type: "done", chatId });
    } catch (err) {
      slog.error("Pipeline crash", { error: err instanceof Error ? err.message : String(err), stack: err instanceof Error ? err.stack?.split("\n").slice(0, 5).join("\n") : undefined });
      await sendEvent({ type: "error", message: err instanceof Error ? err.message : "Unknown error" });
    } finally {
      await writer.close();
    }
  })();

  return new Response(stream.readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
