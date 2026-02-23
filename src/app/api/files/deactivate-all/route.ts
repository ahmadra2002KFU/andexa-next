import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });

  await prisma.uploadedFile.updateMany({
    where: { userId: session.user.id },
    data: { isActive: false },
  });

  return Response.json({ ok: true });
}
