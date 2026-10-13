import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { dataDe, exigir, registrar } from "@/lib/efetivos/servidor";
import { dia } from "@/lib/efetivos/esquemas";
import { TIPOS_AUSENCIA } from "@/lib/efetivos/disponibilidade";

// Uma ausencia (vagaId) ou varias de uma vez (vagaIds), p. ex. ferias coletivas da equipe inteira.
const schema = z
  .object({
    vagaId: z.string().min(1).optional(),
    vagaIds: z.array(z.string().min(1)).min(1).max(300).optional(),
    tipo: z.enum(TIPOS_AUSENCIA),
    inicio: dia,
    fim: dia,
    observacao: z.string().trim().max(300).nullable().optional(),
  })
  .refine((v) => v.inicio <= v.fim, { message: "O fim não pode ser antes do início", path: ["fim"] })
  .refine((v) => !!v.vagaId || !!v.vagaIds?.length, { message: "Escolha a pessoa", path: ["vagaId"] });

export async function POST(req: Request) {
  const a = await exigir("editar");
  if ("erro" in a) return a.erro;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos", detalhes: parsed.error.flatten() }, { status: 422 });
  const d = parsed.data;
  const ids = Array.from(new Set(d.vagaIds ?? [d.vagaId!]));

  const vagas = await prisma.efetivoVaga.findMany({ where: { id: { in: ids } }, include: { equipe: true } });
  if (vagas.length !== ids.length) return NextResponse.json({ error: "Alguma das pessoas escolhidas não existe mais" }, { status: 404 });
  const semNome = vagas.filter((v) => !v.nome);
  if (semNome.length > 0) return NextResponse.json({ error: "Ausência só para vaga com profissional. Tire da lista as vagas abertas." }, { status: 422 });

  const criadas = await prisma.$transaction(
    ids.map((vagaId) => prisma.efetivoAusencia.create({ data: { vagaId, tipo: d.tipo, inicio: dataDe(d.inicio), fim: dataDe(d.fim), observacao: d.observacao || null } }))
  );

  // quem ja estava escalado em campanha nesse periodo: a tela precisa avisar
  const conflitos = await prisma.efetivoAlocacao.findMany({
    where: { vagaId: { in: ids }, inicio: { lte: dataDe(d.fim) }, fim: { gte: dataDe(d.inicio) }, campanha: { status: { notIn: ["Cancelada", "Concluída"] } } },
    include: { campanha: { select: { codigo: true } }, vaga: { select: { nome: true } } },
  });

  const nomes = vagas.map((v) => v.nome).join(", ");
  await registrar(a.userId, "AUSENCIA_CRIADA", "AUSENCIA", criadas[0]?.id, `${d.tipo} de ${d.inicio} a ${d.fim} lançada por ${a.nome}: ${nomes}`);
  return NextResponse.json({ criadas: criadas.length, conflitos: conflitos.map((c) => ({ pessoa: c.vaga.nome, campanha: c.campanha.codigo })) }, { status: 201 });
}
