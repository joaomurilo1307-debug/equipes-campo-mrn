import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { dataDe, diaDe, exigir, registrar, foraDoEscopo } from "@/lib/efetivos/servidor";
import { dia } from "@/lib/efetivos/esquemas";
import { TIPOS_AUSENCIA } from "@/lib/efetivos/disponibilidade";

const schema = z
  .object({
    tipo: z.enum(TIPOS_AUSENCIA),
    inicio: dia,
    fim: dia,
    observacao: z.string().trim().max(300).nullable(),
  })
  .partial();

// Corrige uma ausencia lancada (tipo, datas, observacao).
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const a = await exigir("editar");
  if ("erro" in a) return a.erro;
  {
    const fora = await foraDoEscopo(a, { ausenciaId: params.id });
    if (fora) return fora;
  }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || Object.keys(parsed.data).length === 0) return NextResponse.json({ error: "Dados inválidos" }, { status: 422 });
  const antes = await prisma.efetivoAusencia.findUnique({ where: { id: params.id }, include: { vaga: { include: { equipe: true } } } });
  if (!antes) return NextResponse.json({ error: "Ausência não encontrada" }, { status: 404 });
  const inicio = parsed.data.inicio ?? diaDe(antes.inicio)!;
  const fim = parsed.data.fim ?? diaDe(antes.fim)!;
  if (inicio > fim) return NextResponse.json({ error: "O fim não pode ser antes do início" }, { status: 422 });

  const { observacao, ...resto } = parsed.data;
  const ausencia = await prisma.efetivoAusencia.update({
    where: { id: params.id },
    data: { ...resto, ...(parsed.data.inicio ? { inicio: dataDe(parsed.data.inicio) } : {}), ...(parsed.data.fim ? { fim: dataDe(parsed.data.fim) } : {}), ...(observacao !== undefined ? { observacao: observacao || null } : {}) },
  });
  const conflitos = await prisma.efetivoAlocacao.findMany({
    where: { vagaId: antes.vagaId, inicio: { lte: dataDe(fim) }, fim: { gte: dataDe(inicio) }, campanha: { status: { notIn: ["Cancelada", "Concluída"] } } },
    include: { campanha: { select: { codigo: true } } },
  });
  await registrar(
    a.userId,
    "AUSENCIA_ALTERADA",
    "AUSENCIA",
    ausencia.id,
    `${antes.vaga.nome ?? "vaga sem nome"} (${antes.vaga.equipe.codigo}): ${antes.tipo} ${diaDe(antes.inicio)}–${diaDe(antes.fim)} → ${ausencia.tipo} ${diaDe(ausencia.inicio)}–${diaDe(ausencia.fim)} (por ${a.nome})`
  );
  return NextResponse.json({ ausencia, conflitos: conflitos.map((c) => c.campanha.codigo) });
}

// Remove um lancamento de ausencia (engano ou ausencia cancelada). Fica no historico.
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const a = await exigir("editar");
  if ("erro" in a) return a.erro;
  {
    const fora = await foraDoEscopo(a, { ausenciaId: params.id });
    if (fora) return fora;
  }
  const aus = await prisma.efetivoAusencia.findUnique({ where: { id: params.id }, include: { vaga: { include: { equipe: true } } } });
  if (!aus) return NextResponse.json({ error: "Ausência não encontrada" }, { status: 404 });
  await prisma.efetivoAusencia.delete({ where: { id: params.id } });
  await registrar(a.userId, "AUSENCIA_REMOVIDA", "AUSENCIA", params.id, `${aus.tipo} de ${aus.vaga.nome ?? "vaga sem nome"} (${aus.vaga.equipe.codigo}) de ${diaDe(aus.inicio)} a ${diaDe(aus.fim)} removida (por ${a.nome})`);
  return NextResponse.json({ ok: true });
}
