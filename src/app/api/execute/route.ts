import { auth } from "@/lib/auth";
import { executorClient } from "@/lib/executor/client";
import { executeRequestSchema } from "@/lib/validators/schemas";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });

  const body = await req.json();
  const parsed = executeRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = await executorClient.executeCode(parsed.data.code, parsed.data.file_paths, parsed.data.timeout);
    return Response.json(result);
  } catch (err) {
    return Response.json(
      { success: false, output: err instanceof Error ? err.message : "Execution failed", results: {} },
      { status: 502 }
    );
  }
}
