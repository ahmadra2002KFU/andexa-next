import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });

  const { id } = await params;
  const file = await prisma.uploadedFile.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!file) return Response.json({ error: "File not found" }, { status: 404 });

  await prisma.uploadedFile.delete({ where: { id } });
  return Response.json({ success: true });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });

  const { id } = await params;
  const userId = session.user.id;
  const body = await req.json();

  if (body.isActive === true) {
    // Deactivate all, activate this one
    await prisma.uploadedFile.updateMany({ where: { userId }, data: { isActive: false } });
    await prisma.uploadedFile.update({ where: { id }, data: { isActive: true } });
    return Response.json({ success: true });
  }

  return Response.json({ error: "No valid update" }, { status: 400 });
}
