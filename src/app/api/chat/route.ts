import { generateText, streamObject, streamText } from "ai";
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

export const maxDuration = 120;

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
  const { message, provider: providerInput, chatId: inputChatId } = parsed.data;
  const provider = (providerInput === "auto" ? "groq" : providerInput) as ProviderType;

  // 3. Get or create chat
  let chatId = inputChatId;
  if (!chatId) {
    const chat = await prisma.chat.create({
      data: { userId, title: message.slice(0, 100) },
    });
    chatId = chat.id;
  }

  // 4. Fetch file metadata + rules
  const [activeFile, rules] = await Promise.all([
    prisma.uploadedFile.findFirst({ where: { userId, isActive: true } }),
    prisma.rule.findMany({ where: { userId, active: true }, orderBy: { priority: "desc" } }),
  ]);

  const fileMetadata = activeFile?.columnMetadata as ColumnMetadata | null;
  const userRules = rules.map((r) => r.text);

  // Multi-file context
  const allFiles = await prisma.uploadedFile.findMany({ where: { userId } });
  const multiFileContext = allFiles.map((f) => {
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
          const tools = createDataTools(userId);
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
                  const trAny = tr as any;
                  const summary = JSON.stringify(trAny.result ?? trAny).slice(0, 300);
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

      // Rebuild prompt with tool context
      const finalPrompt = buildSystemPrompt({
        fileMetadata,
        multiFileContext: multiFileContext.length > 1 ? multiFileContext : undefined,
        userRules: userRules.length > 0 ? userRules : undefined,
        toolContext: toolContext || undefined,
      });

      // ── Phase 2: Layer 1 — streamed structured response ──────
      // Send a "thinking" status so frontend shows the thinking indicator
      await sendEvent({ type: "phase", phase: "thinking" });

      let lastAnalysis = "";
      let lastCode = "";

      try {
        const { partialObjectStream } = streamObject({
          model: getModel(provider),
          schema: z.object({
            initial_response: z.string(),
            generated_code: z.string(),
          }),
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
        if (!lastAnalysis && !lastCode) {
          const errMsg = streamErr instanceof Error ? streamErr.message : "LLM streaming failed";
          await sendEvent({ type: "error", message: `Analysis failed: ${errMsg}. Try again or switch provider.` });
          await sendEvent({ type: "done", chatId: chatId! });
          return;
        }
      }

      const analysis = lastAnalysis;
      const generatedCode = lastCode;

      if (!analysis && !generatedCode) {
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

        // Pass ALL files to the executor so multi-file code works.
        // Active file first (becomes `df`), then all others by variable name.
        const filePaths: string[] = [];
        if (activeFile) filePaths.push(activeFile.storedPath);
        for (const f of allFiles) {
          if (f.id !== activeFile?.id) filePaths.push(f.storedPath);
        }
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

        if (!retryResult.success && retryResult.failureExplanation) {
          await sendEvent({ type: "retry_failed", totalAttempts: retryResult.totalAttempts, explanation: retryResult.failureExplanation });
        }
      }

      // Only send execution event if code was actually executed
      if (generatedCode.trim()) {
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
            executionResults: executionResult as any,
            groundTruthKpis: groundTruthKpis.length > 0 ? (groundTruthKpis as any) : undefined,
            provider,
          },
        ],
      });

      await sendEvent({ type: "done", chatId });
    } catch (err) {
      console.error("Chat pipeline error:", err);
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
