import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { exigir, registrar } from "@/lib/efetivos/servidor";
import { STATUS_EQUIPE, dataValida } from "@/lib/efetivos/disponibilidade";
import { dataDe } from "@/lib/efetivos/servidor";

const dia = z.string().refine(dataValida, "Data inválida (AAAA-MM-DD)");

const schema = z.object({
  codigo: z.string().trim().min(1).max(20).optional(),
  nome: z.string().trim().min(1).max(120),
  projeto: z.string().trim().min(1).max(60),
  gestor: z.string().trim().max(80).nullable().optional(),
  local: z.string().trim().max(160).nullable().optional(),
  observacao: z.string().trim().max(600).nullable().optional(),
  grupo: z.string().trim().min(1).max(40),
  status: z.enum(STATUS_EQUIPE).default("Ativa"),
  inicio: dia.nullable().optional(),
  fim: dia.nullable().optional(),
  campanhaId: z.string().nullable().optional(),
});

export async function POST(req: Request) {
  const a = await exigir("editar");
  if ("erro" in a) return a.erro;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos", detalhes: parsed.error.flatten() }, { status: 422 });
  const d = parsed.data;

  let codigo = d.codigo;
  if (!codigo) {
    const todas = await prisma.efetivoEquipe.findMany({ select: { codigo: true } });
    const maior = todas.reduce((m, e) => Math.max(m, Number(/^EQ-(\d+)$/.exec(e.codigo)?.[1] ?? 0)), 0);
    codigo = `EQ-${String(maior + 1).padStart(2, "0")}`;
  }
  if (await prisma.efetivoEquipe.findUnique({ where: { codigo } })) {
    return NextResponse.json({ error: `Já existe a equipe ${codigo}` }, { status: 409 });
  }
  const total = await prisma.efetivoEquipe.count();
  const equipe = await prisma.efetivoEquipe.create({
    data: { codigo, nome: d.nome, projeto: d.projeto, gestor: d.gestor || null, local: d.local || null, observacao: d.observacao || null, grupo: d.grupo, status: d.status, ordem: total + 1, inicio: d.inicio ? dataDe(d.inicio) : null, fim: d.fim ? dataDe(d.fim) : null, campanhaId: d.campanhaId || null },
  });
  await registrar(a.userId, "EQUIPE_CRIADA", "EQUIPE", equipe.id, `Equipe ${codigo} (${d.nome}) criada por ${a.nome}`);
  return NextResponse.json({ equipe }, { status: 201 });
}
