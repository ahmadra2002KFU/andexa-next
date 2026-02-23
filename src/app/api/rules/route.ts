import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { createRuleSchema } from "@/lib/validators/schemas";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });

  const rules = await prisma.rule.findMany({
    where: { userId: session.user.id },
    orderBy: { priority: "desc" },
  });
  return Response.json(rules);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });

  const body = await req.json();
  const parsed = createRuleSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const rule = await prisma.rule.create({
    data: { userId: session.user.id, ...parsed.data },
  });
  return Response.json(rule, { status: 201 });
}

export async function PUT(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });

  const body = await req.json();
  const { id, ...data } = body;
  if (!id) return Response.json({ error: "Missing id" }, { status: 400 });

  const parsed = createRuleSchema.safeParse(data);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  // Verify ownership first since Rule has no compound unique on (id, userId)
  const existing = await prisma.rule.findFirst({ where: { id, userId: session.user.id } });
  if (!existing) return Response.json({ error: "Rule not found" }, { status: 404 });

  const rule = await prisma.rule.update({
    where: { id },
    data: parsed.data,
  });
  return Response.json(rule);
}

export async function DELETE(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return Response.json({ error: "Missing id" }, { status: 400 });

  await prisma.rule.deleteMany({ where: { id, userId: session.user.id } });
  return Response.json({ success: true });
}
