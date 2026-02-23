import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { executorClient } from "@/lib/executor/client";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });
  const userId = session.user.id;

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return Response.json({ error: "No file provided" }, { status: 400 });

  // Strip directory prefix from folder uploads (e.g. "data/file.csv" -> "file.csv")
  const cleanName = file.name.includes("/")
    ? file.name.split("/").pop()!
    : file.name;

  const ext = cleanName.split(".").pop()?.toLowerCase();
  if (!ext || !["csv", "xlsx", "xls"].includes(ext)) {
    return Response.json({ error: "Only CSV and Excel files are supported" }, { status: 400 });
  }

  // Check if this is part of a folder upload (skip deactivating other files)
  const url = new URL(req.url);
  const skipDeactivate = url.searchParams.get("skipDeactivate") === "true";

  // Forward to Python executor for processing
  const execForm = new FormData();
  execForm.append("file", file);
  execForm.append("user_id", userId);

  try {
    const result = await executorClient.uploadFile(execForm);

    // Deactivate other files only for single uploads, not folder uploads
    if (!skipDeactivate) {
      await prisma.uploadedFile.updateMany({ where: { userId }, data: { isActive: false } });
    }

    const dbFile = await prisma.uploadedFile.create({
      data: {
        userId,
        originalFilename: cleanName,
        storedFilename: result.filename,
        storedPath: result.stored_path,
        sizeMb: Math.round((file.size / (1024 * 1024)) * 1000) / 1000,
        rows: result.rows,
        columns: result.columns,
        columnMetadata: result.column_metadata as any,
        isActive: true,
      },
    });

    return Response.json({
      id: dbFile.id,
      originalFilename: dbFile.originalFilename,
      rows: dbFile.rows,
      columns: dbFile.columns,
      sizeMb: dbFile.sizeMb,
    });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Upload failed" }, { status: 502 });
  }
}
