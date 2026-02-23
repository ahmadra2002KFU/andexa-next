import type { ColumnMetadata } from "@/types";

export interface PromptContext {
  fileMetadata?: ColumnMetadata | null;
  multiFileContext?: Array<{
    filename: string;
    variableName: string;
    rows: number;
    columns: number;
    columnNames: string[];
  }>;
  userRules?: string[];
  toolContext?: string;
  sharedColumns?: Record<string, string[]>;
}

export function buildSystemPrompt(ctx: PromptContext): string {
  const sections: string[] = [baseSection()];

  if (ctx.fileMetadata) {
    sections.push(fileContextSection(ctx.fileMetadata));
  }
  if (ctx.multiFileContext && ctx.multiFileContext.length > 1) {
    sections.push(multiFileSection(ctx.multiFileContext));
  }
  if (ctx.sharedColumns && Object.keys(ctx.sharedColumns).length > 0) {
    sections.push(joinInstructionsSection(ctx.sharedColumns));
  }
  if (ctx.userRules && ctx.userRules.length > 0) {
    sections.push(rulesSection(ctx.userRules));
  }
  if (ctx.toolContext) {
    sections.push(ctx.toolContext);
  }
  sections.push(outputFormatSection());

  return sections.join("\n\n");
}

function baseSection(): string {
  return `You are an AI assistant specialized in data analysis and visualization.
You help users analyze their data files (CSV, XLSX) and create insights through code generation and execution.

CRITICAL RULES FOR CODE GENERATION:
- NEVER use pd.read_csv() or try to read files from disk
- ALWAYS use the variable 'df' which contains the already-loaded uploaded data
- ALWAYS assign your final output/results to a variable named 'result' or 'output'
- For visualizations, assign the figure to 'fig' or 'figure'
- Always use plotly instead of matplotlib
- Libraries available: pandas (pd), numpy (np), plotly.express (px), plotly.graph_objects (go), plotly.figure_factory (ff), plotly.subplots (make_subplots), json, datetime, math, statistics, re, itertools
- For current date/time use datetime.now()`;
}

function fileContextSection(meta: ColumnMetadata): string {
  const { basic_info, columns, data_quality } = meta;
  const colNames = basic_info.column_names.join(", ");
  let colDetails = "";
  for (const [name, info] of Object.entries(columns)) {
    colDetails += `- ${name}: ${info.dtype} (${info.column_type}), ${info.non_null_count} non-null`;
    if (info.column_type === "numeric" && info.min != null) {
      colDetails += `, range: ${info.min}-${info.max}, mean: ${info.mean}`;
    }
    colDetails += "\n";
  }

  return `MANDATORY COLUMN NAMES - USE THESE EXACT NAMES IN YOUR CODE:
File: ${basic_info.filename}
AVAILABLE COLUMNS (${basic_info.column_names.length} total): [${colNames}]
Column names are CASE-SENSITIVE. NEVER invent or guess column names.

CURRENT UPLOADED FILE (Available as 'df' variable):
- Shape: ${basic_info.shape.rows} rows x ${basic_info.shape.columns} columns
- Data Quality Score: ${data_quality?.data_quality_score ?? "N/A"}/100

COLUMN DETAILS:
${colDetails}`;
}

function multiFileSection(
  files: NonNullable<PromptContext["multiFileContext"]>
): string {
  let lines = `MULTI-FILE CONTEXT (${files.length} files uploaded):\n`;
  for (const f of files) {
    const cols = f.columnNames.slice(0, 10).join(", ");
    const more = f.columnNames.length > 10 ? ` ... (+${f.columnNames.length - 10} more)` : "";
    lines += `  - ${f.filename} -> USE AS: ${f.variableName} (${f.rows} rows x ${f.columns} cols)\n    Columns: [${cols}${more}]\n`;
  }
  lines += `NOTE: 'df' contains the ACTIVE file. Other files are accessed by variable name.`;
  return lines;
}

function joinInstructionsSection(shared: Record<string, string[]>): string {
  const entries = Object.entries(shared)
    .map(([col, files]) => `  - '${col}' exists in: [${files.join(", ")}]`)
    .join("\n");

  return `CRITICAL: COLUMNS FOR JOIN/MERGE OPERATIONS
These columns exist in MULTIPLE files - USE THEM as merge keys:
${entries}

MANDATORY RULES FOR MERGING FILES:
1. ONLY use columns from the list above as merge keys
2. The merge key MUST exist in BOTH DataFrames before merging
3. Use multi-hop joins if a direct key is unavailable`;
}

function rulesSection(rules: string[]): string {
  return `USER ANALYSIS RULES (apply these constraints):
${rules.map((r, i) => `${i + 1}. ${r}`).join("\n")}`;
}

function outputFormatSection(): string {
  return `You must respond in a structured JSON format with exactly three fields:
1. "initial_response": Your initial analysis/understanding of the request
2. "generated_code": Python code to execute (if applicable, otherwise empty string) - MUST assign final output to 'result', 'output', 'fig', or 'figure' variable
3. "result_commentary": CONCISE, FACTUAL interpretation of results

Respond ONLY with valid JSON in the exact format specified.`;
}
