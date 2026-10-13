import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { exigir, registrar } from "@/lib/efetivos/servidor";

const schema = z
  .object({
    role: z.enum(["ADMIN", "EDITOR", "VISUALIZADOR"]),
    active: z.boolean(),
    password: z.string().min(8, "A senha precisa ter pelo menos 8 caracteres").max(100),
  })
  .partial();

// Muda papel, ativa/desativa ou redefine a senha. Nunca apaga o usuario (o historico guarda o nome).
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const a = await exigir("admin");
  if ("erro" in a) return a.erro;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: parsed.success ? "Nada para alterar" : parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 422 });
  }
  const alvo = await prisma.user.findUnique({ where: { id: params.id } });
  if (!alvo) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });
  // o administrador nao pode se trancar para fora do sistema
  if (alvo.id === a.userId && (parsed.data.active === false || (parsed.data.role && parsed.data.role !== "ADMIN"))) {
    return NextResponse.json({ error: "Você não pode desativar nem rebaixar o seu próprio acesso" }, { status: 409 });
  }
  const { password, ...resto } = parsed.data;
  await prisma.user.update({ where: { id: alvo.id }, data: { ...resto, ...(password ? { passwordHash: await bcrypt.hash(password, 10) } : {}) } });
  const partes: string[] = [];
  if (resto.role && resto.role !== alvo.role) partes.push(`papel ${alvo.role} → ${resto.role}`);
  if (resto.active !== undefined && resto.active !== alvo.active) partes.push(resto.active ? "reativado" : "desativado");
  if (password) partes.push("senha redefinida");
  if (partes.length) await registrar(a.userId, "USUARIO_ALTERADO", "USUARIO", alvo.id, `Acesso de ${alvo.name}: ${partes.join("; ")} (por ${a.nome})`);
  return NextResponse.json({ ok: true });
}
