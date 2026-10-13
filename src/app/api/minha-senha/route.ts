import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const schema = z.object({ atual: z.string().min(1), nova: z.string().min(8, "A nova senha precisa ter pelo menos 8 caracteres").max(100) });

// Cada pessoa troca a propria senha (precisa saber a atual).
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const id = (session?.user as any)?.id as string | undefined;
  if (!id) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 422 });
  const u = await prisma.user.findUnique({ where: { id } });
  if (!u || !(await bcrypt.compare(parsed.data.atual, u.passwordHash))) return NextResponse.json({ error: "A senha atual não confere" }, { status: 403 });
  await prisma.user.update({ where: { id }, data: { passwordHash: await bcrypt.hash(parsed.data.nova, 10) } });
  return NextResponse.json({ ok: true });
}
