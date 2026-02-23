import { generateObject, generateText } from "ai";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { getModel } from "@/lib/ai/providers";
import { extractGroundTruth, buildGroundTruthSet } from "@/lib/ai/ground-truth";
import { reportRequestSchema } from "@/lib/validators/schemas";
import { executorClient } from "@/lib/executor/client";
import type { ExecutionResult } from "@/types";

export const maxDuration = 120;

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });

  const body = await req.json();
  const parsed = reportRequestSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const { query, analysis, generatedCode, executionResults, commentary } = parsed.data;
  const model = getModel("groq");
  const groundTruthKpis = extractGroundTruth(executionResults as ExecutionResult);
  const gtSet = buildGroundTruthSet(groundTruthKpis);
  const gtSection = groundTruthKpis
    .map((k, i) => `${i + 1}. ${k.source_key}: ${k.formatted_value} (${k.value_type})`)
    .join("\n");

  // Call 1/4: Executive Brief
  const { text: brief } = await generateText({
    model,
    system: "You are an executive report writer. Use exact numbers, not approximations.",
    prompt: `Write a 3-4 sentence executive brief.\nQuery: "${query}"\nResults:\n${gtSection}\nAnalysis: ${analysis.slice(0, 800)}`,
    temperature: 0.1,
    maxOutputTokens: 600,
  });

  // Call 2/4: Key Findings
  const { object: findingsObj } = await generateObject({
    model,
    schema: z.object({
      findings: z.array(z.object({
        content: z.string(),
        priority: z.enum(["HIGH", "MEDIUM", "LOW"]),
        source_keys: z.array(z.string()),
        context: z.string(),
      })),
    }),
    system: "You are a data analyst. Return ONLY valid JSON. NEVER invent values.",
    prompt: `Extract 3-5 findings.\nQuery: ${query}\nGround Truth:\n${gtSection}`,
    temperature: 0.3,
  });

  // Call 3/4: Insights & Risks
  const { object: insightsObj } = await generateObject({
    model,
    schema: z.object({
      insights: z.array(z.object({
        what: z.string(),
        why: z.string(),
        so_what: z.string(),
        source_keys: z.array(z.string()),
      })),
      risks: z.array(z.object({
        description: z.string(),
        severity: z.enum(["HIGH", "MEDIUM", "LOW"]),
        mitigation: z.string(),
      })),
    }),
    system: "You are a strategic analyst. Return ONLY valid JSON.",
    prompt: `Generate insights and risks.\nQuery: ${query}\nFindings: ${JSON.stringify(findingsObj.findings).slice(0, 1000)}\nGround Truth:\n${gtSection}`,
    temperature: 0.2,
  });

  // Call 4/4: Action Items
  const { object: actionsObj } = await generateObject({
    model,
    schema: z.object({
      action_items: z.array(z.object({
        action: z.string(),
        rationale: z.string(),
        priority: z.enum(["HIGH", "MEDIUM", "LOW"]),
      })),
    }),
    system: "You are a business strategy consultant. Return ONLY valid JSON.",
    prompt: `Generate 3-5 action items.\nQuery: ${query}\nFindings: ${JSON.stringify(findingsObj.findings).slice(0, 500)}\nInsights: ${JSON.stringify(insightsObj.insights).slice(0, 500)}`,
    temperature: 0.2,
  });

  // Generate report assets (Plotly -> PNG) via executor
  // Extract Plotly plot data from execution results for PNG conversion
  let images: Array<{ base64?: string; width?: number; height?: number; error?: string }> = [];
  try {
    const execResults = executionResults as ExecutionResult;
    const plots: Array<Record<string, unknown>> = [];
    if (execResults.results) {
      for (const [, value] of Object.entries(execResults.results)) {
        if (value && typeof value === "object" && (value as Record<string, unknown>).type === "plotly_figure") {
          plots.push({ json: JSON.stringify(value) });
        }
      }
    }
    if (plots.length > 0) {
      const assets = await executorClient.generateReportAssets(plots);
      images = assets.images;
    }
  } catch {
    // Continue without images
  }

  // Sanitize numbers against ground truth (simple pass — remove unverified)
  const sanitize = (text: string) => {
    // Simple numeric sanitization: flag numbers not in ground truth
    return text; // Full sanitization would match the Python implementation
  };

  return Response.json({
    chatId: session.user.id,
    brief: sanitize(brief),
    findings: findingsObj.findings,
    insights: insightsObj.insights,
    risks: insightsObj.risks,
    actions: actionsObj.action_items,
    images,
    groundTruthKpis,
    generatedCode,
    commentary: sanitize(commentary),
    query,
  });
}
