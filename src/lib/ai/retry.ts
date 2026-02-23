import { generateObject } from "ai";
import { z } from "zod";
import { getModel } from "./providers";
import { buildCorrectionPrompt, buildFailureExplanationPrompt, CORRECTION_SYSTEM_PROMPT } from "./retry-prompts";
import { executorClient } from "@/lib/executor/client";
import type { ExecutionResult, ProviderType } from "@/types";

const MAX_RETRIES = parseInt(process.env.RETRY_MAX_ATTEMPTS || "3", 10);
const NON_RETRIABLE = [
  /Potentially dangerous operation/i,
  /Security violation/i,
  /Import.*not allowed/i,
];

interface RetryOptions {
  code: string;
  userQuery: string;
  filePaths: string[];
  columns: string[];
  dtypes: Record<string, string>;
  provider: ProviderType;
  onRetryStart?: (attempt: number, errorType: string) => void;
}

export interface RetryResult {
  success: boolean;
  totalAttempts: number;
  finalCode: string;
  executionResult: ExecutionResult;
  failureExplanation?: string;
}

function classifyError(output: string): { type: string; message: string } {
  const match = output.match(/(\w+Error|\w+Exception|Timeout):\s*(.+?)(?:\n|$)/i);
  if (match) return { type: match[1], message: match[2].trim() };
  if (/timed?\s*out|timeout/i.test(output)) return { type: "TimeoutError", message: "Code execution timed out" };
  return { type: "UnknownError", message: output.slice(0, 500) };
}

function isRetriable(errorType: string, output: string): boolean {
  for (const pattern of NON_RETRIABLE) {
    if (pattern.test(output)) return false;
  }
  return ["SyntaxError", "NameError", "KeyError", "TypeError", "ValueError", "AttributeError", "IndexError", "TimeoutError"].includes(errorType);
}

export async function executeWithRetry(opts: RetryOptions): Promise<RetryResult> {
  let currentCode = opts.code;
  let lastResult: ExecutionResult | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
    // Execute
    lastResult = await executorClient.executeCode(currentCode, opts.filePaths);

    if (lastResult.success) {
      return { success: true, totalAttempts: attempt, finalCode: currentCode, executionResult: lastResult };
    }

    // Classify error
    const { type: errorType, message: errorMessage } = classifyError(lastResult.output || lastResult.error || "");

    if (attempt > MAX_RETRIES || !isRetriable(errorType, lastResult.output || "")) {
      break;
    }

    opts.onRetryStart?.(attempt + 1, errorType);

    // Generate correction
    try {
      const { object: correction } = await generateObject({
        model: getModel(opts.provider),
        schema: z.object({
          initial_response: z.string(),
          generated_code: z.string(),
          result_commentary: z.string(),
        }),
        system: CORRECTION_SYSTEM_PROMPT,
        prompt: buildCorrectionPrompt({
          userQuery: opts.userQuery,
          failedCode: currentCode,
          errorType,
          errorMessage,
          traceback: lastResult.output || "",
          columns: opts.columns,
          dtypes: opts.dtypes,
        }),
        temperature: 0.3,
      });

      if (correction.generated_code && correction.generated_code !== currentCode) {
        currentCode = cleanCode(correction.generated_code);
      }
    } catch {
      // If correction generation fails, continue with same code
    }
  }

  // All retries exhausted — generate explanation
  let failureExplanation: string | undefined;
  try {
    const { object } = await generateObject({
      model: getModel(opts.provider),
      schema: z.object({ explanation: z.string() }),
      prompt: buildFailureExplanationPrompt({
        userQuery: opts.userQuery,
        attempts: MAX_RETRIES + 1,
        errorHistory: lastResult?.output?.slice(0, 1000) || "Unknown error",
        columns: opts.columns,
      }),
      temperature: 0.5,
    });
    failureExplanation = object.explanation;
  } catch {
    failureExplanation = `Analysis failed after ${MAX_RETRIES + 1} attempts. Try rephrasing your query.`;
  }

  return {
    success: false,
    totalAttempts: MAX_RETRIES + 1,
    finalCode: currentCode,
    executionResult: lastResult!,
    failureExplanation,
  };
}

function cleanCode(code: string): string {
  let c = code.trim();
  if (c.startsWith("```python")) c = c.slice(9);
  else if (c.startsWith("```")) c = c.slice(3);
  if (c.endsWith("```")) c = c.slice(0, -3);
  return c.trim();
}
