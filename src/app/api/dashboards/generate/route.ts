import { generateObject } from "ai";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { getModel } from "@/lib/ai/providers";
import { extractGroundTruth } from "@/lib/ai/ground-truth";
import { dashboardRequestSchema } from "@/lib/validators/schemas";
import { executorClient } from "@/lib/executor/client";
import type { ExecutionResult } from "@/types";

export const maxDuration = 120;

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });

  const body = await req.json();
  const parsed = dashboardRequestSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const { query, analysis, executionResults, commentary } = parsed.data;
  const model = getModel("groq");
  const kpis = extractGroundTruth(executionResults as ExecutionResult);

  // LLM planning call — generate dashboard config
  const { object: config } = await generateObject({
    model,
    schema: z.object({
      title: z.string(),
      kpis: z.array(z.object({
        label: z.string(),
        value: z.string(),
        icon: z.string(),
      })),
      insights: z.array(z.string()),
      recommendations: z.array(z.string()),
    }),
    system: "You are a data dashboard designer. Return ONLY valid JSON.",
    prompt: `Design a dashboard for: "${query}"
Results: ${JSON.stringify(kpis.slice(0, 10).map((k) => `${k.source_key}: ${k.formatted_value}`)).slice(0, 1000)}
Commentary: ${commentary.slice(0, 500)}
Generate 4-8 KPI cards, 3-5 insights, 2-3 recommendations.`,
    temperature: 0.3,
  });

  // Extract Plotly plots from execution results
  const execResults = executionResults as ExecutionResult;
  const plots: Array<Record<string, unknown>> = [];
  if (execResults.results) {
    for (const [, value] of Object.entries(execResults.results)) {
      if (value && typeof value === "object" && (value as Record<string, unknown>).type === "plotly_figure") {
        plots.push(value as Record<string, unknown>);
      }
    }
  }

  // Generate dashboard HTML via executor
  try {
    const dashboard = await executorClient.generateDashboard({
      title: config.title,
      kpis: config.kpis,
      plots,
      insights: config.insights,
      recommendations: config.recommendations,
      analysis,
      generated_code: "",
      execution_output: execResults.output || "",
      commentary,
    });
    return Response.json({ html: dashboard.html, config });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Dashboard generation failed" }, { status: 502 });
  }
}
