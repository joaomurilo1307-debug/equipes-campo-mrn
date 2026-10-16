import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { exigir, registrar } from "@/lib/efetivos/servidor";

export const dynamic = "force-dynamic";

// Acessos ao sistema: so o administrador cria e altera.
export async function GET() {
  const a = await exigir("admin");
  if ("erro" in a) return a.erro;
  const usuarios = await prisma.user.findMany({
    orderBy: [{ role: "asc" }, { name: "asc" }],
    select: { id: true, name: true, email: true, role: true, active: true, cliente: true, createdAt: true },
  });
  return NextResponse.json({ usuarios });
}

const criarSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email().max(120),
  password: z.string().min(8, "A senha precisa ter pelo menos 8 caracteres").max(100),
  role: z.enum(["ADMIN", "EDITOR", "VISUALIZADOR"]),
  // acesso restrito a um cliente (MRN, AGA...); vazio = todos os clientes
  cliente: z.string().trim().max(60).nullable().optional(),
});

export async function POST(req: Request) {
  const a = await exigir("admin");
  if ("erro" in a) return a.erro;
  const parsed = criarSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Dados inválidos";
    return NextResponse.json({ error: msg }, { status: 422 });
  }
  const d = parsed.data;
  if (await prisma.user.findUnique({ where: { email: d.email } })) return NextResponse.json({ error: "Já existe um usuário com esse e-mail" }, { status: 409 });
  const u = await prisma.user.create({
    data: { name: d.name, email: d.email, passwordHash: await bcrypt.hash(d.password, 10), role: d.role, cliente: d.role === "ADMIN" ? null : d.cliente || null },
    select: { id: true, name: true, email: true, role: true, active: true, cliente: true },
  });
  await registrar(a.userId, "USUARIO_CRIADO", "USUARIO", u.id, `Acesso criado para ${u.name} (${u.email}) como ${u.role}${u.cliente ? ` (só ${u.cliente})` : ""} por ${a.nome}`);
  return NextResponse.json({ usuario: u }, { status: 201 });
}
