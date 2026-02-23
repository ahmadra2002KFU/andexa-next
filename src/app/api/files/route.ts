import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });

  const files = await prisma.uploadedFile.findMany({
    where: { userId: session.user.id },
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
