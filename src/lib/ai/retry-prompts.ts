export const CORRECTION_SYSTEM_PROMPT = `You are an expert Python data analyst debugging code.
Your task is to fix code that failed to execute.

CRITICAL RULES:
1. The DataFrame is pre-loaded as 'df' - NEVER use pd.read_csv()
2. You MUST assign output to a variable named 'result', 'output', or 'fig'
3. Use ONLY the columns that exist in the DataFrame
4. Return valid JSON with the exact structure requested
5. The generated_code field must contain raw Python code (no markdown)

Be precise and minimal - fix only what's broken.`;

export function buildCorrectionPrompt(opts: {
  userQuery: string;
  failedCode: string;
  errorType: string;
  errorMessage: string;
  traceback: string;
  columns: string[];
  dtypes: Record<string, string>;
  sampleData?: string;
  attemptHistory?: string;
}): string {
  return `The following code failed to execute. Analyze the error and provide a corrected version.

## Original User Query
${opts.userQuery}

## Failed Code
\`\`\`python
${opts.failedCode}
\`\`\`

## Error Details
Type: ${opts.errorType}
Message: ${opts.errorMessage}

## Full Traceback
${opts.traceback.slice(0, 2000)}

## Available DataFrame Information
Columns: ${opts.columns.join(", ") || "No columns available"}
Data Types: ${JSON.stringify(opts.dtypes)}
${opts.sampleData ? `Sample Data:\n${opts.sampleData.slice(0, 1000)}` : ""}

${opts.attemptHistory || "This is the first correction attempt."}

## Response Format
Respond with valid JSON:
{
  "initial_response": "Brief explanation of the fix",
  "generated_code": "The corrected Python code",
  "result_commentary": ""
}`;
}

export function buildFailureExplanationPrompt(opts: {
  userQuery: string;
  attempts: number;
  errorHistory: string;
  columns: string[];
}): string {
  return `After ${opts.attempts} attempts, the code still fails.
Explain to the user why and suggest alternatives.

## Original Query: ${opts.userQuery}
## Error History: ${opts.errorHistory}
## Available Columns: ${opts.columns.join(", ")}

Provide a helpful explanation with 2-3 suggestions.`;
}
