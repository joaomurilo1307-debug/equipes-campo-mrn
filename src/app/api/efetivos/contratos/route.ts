import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { exigir, registrar } from "@/lib/efetivos/servidor";

const schema = z.object({
  codigo: z.string().trim().min(1).max(60),
  nome: z.string().trim().max(160).nullable().optional(),
  cliente: z.string().trim().max(120).nullable().optional(),
  gestor: z.string().trim().max(120).nullable().optional(),
  local: z.string().trim().max(160).nullable().optional(),
  observacao: z.string().trim().max(600).nullable().optional(),
  ativo: z.boolean().optional(),
});

// Cadastro de contrato/projeto: o espaço para os dados dele (cliente, gestor, local, observações).
export async function POST(req: Request) {
  const a = await exigir("editar");
  if ("erro" in a) return a.erro;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos", detalhes: parsed.error.flatten() }, { status: 422 });
  const d = parsed.data;
  // quem está restrito a um cliente só cadastra contrato desse cliente
  const cliente = a.cliente ?? (d.cliente || null);
  if (await prisma.efetivoContrato.findUnique({ where: { codigo: d.codigo } })) return NextResponse.json({ error: `Já existe o contrato ${d.codigo}` }, { status: 409 });
  const c = await prisma.efetivoContrato.create({
    data: { codigo: d.codigo, nome: d.nome || null, cliente, gestor: d.gestor || null, local: d.local || null, observacao: d.observacao || null, ativo: d.ativo ?? true },
  });
  await registrar(a.userId, "CONTRATO_CRIADO", "CONTRATO", c.id, `Contrato ${c.codigo} cadastrado por ${a.nome}`);
  return NextResponse.json({ contrato: c }, { status: 201 });
}
