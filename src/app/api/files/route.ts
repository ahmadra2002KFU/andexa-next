import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";

function parseWorkspaceSessionId(url: URL): string | null {
  const raw = url.searchParams.get("workspaceSessionId");
  if (!raw) return null;
  const value = raw.trim();
  if (!value) return null;
  return value.slice(0, 128);
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });
  const workspaceSessionId = parseWorkspaceSessionId(new URL(req.url));

  const files = await prisma.uploadedFile.findMany({
    where: {
      userId: session.user.id,
      ...(workspaceSessionId ? { sessionId: workspaceSessionId } : {}),
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      originalFilename: true,
      sizeMb: true,
      rows: true,
      columns: true,
      isActive: true,
      createdAt: true,
    },
  });

  return Response.json(files);
}
