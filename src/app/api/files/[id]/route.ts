import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";

function parseWorkspaceSessionId(url: URL): string | null {
  const raw = url.searchParams.get("workspaceSessionId");
  if (!raw) return null;
  const value = raw.trim();
  if (!value) return null;
  return value.slice(0, 128);
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });
  const workspaceSessionId = parseWorkspaceSessionId(new URL(req.url));

  const { id } = await params;
  const file = await prisma.uploadedFile.findFirst({
    where: {
      id,
      userId: session.user.id,
      ...(workspaceSessionId ? { sessionId: workspaceSessionId } : {}),
    },
  });
  if (!file) return Response.json({ error: "File not found" }, { status: 404 });

  await prisma.uploadedFile.delete({ where: { id } });
  return Response.json({ success: true });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });
  const workspaceSessionId = parseWorkspaceSessionId(new URL(req.url));

  const { id } = await params;
  const userId = session.user.id;
  const body = await req.json();

  if (body.isActive === true) {
    // Deactivate all, activate this one
    await prisma.uploadedFile.updateMany({
      where: {
        userId,
        ...(workspaceSessionId ? { sessionId: workspaceSessionId } : {}),
      },
      data: { isActive: false },
    });
    const updated = await prisma.uploadedFile.updateMany({
      where: {
        id,
        userId,
        ...(workspaceSessionId ? { sessionId: workspaceSessionId } : {}),
      },
      data: { isActive: true },
    });
    if (updated.count === 0) {
      return Response.json({ error: "File not found" }, { status: 404 });
    }
    return Response.json({ success: true });
  }

  return Response.json({ error: "No valid update" }, { status: 400 });
}
