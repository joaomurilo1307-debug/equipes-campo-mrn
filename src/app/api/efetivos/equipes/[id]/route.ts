import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { exigir, registrar, foraDoEscopo } from "@/lib/efetivos/servidor";
import { STATUS_EQUIPE, dataValida } from "@/lib/efetivos/disponibilidade";
import { dataDe } from "@/lib/efetivos/servidor";

const dia = z.string().refine(dataValida, "Data inválida (AAAA-MM-DD)");

const schema = z
  .object({
    nome: z.string().trim().min(1).max(120),
    projeto: z.string().trim().min(1).max(60),
    gestor: z.string().trim().max(80).nullable(),
    local: z.string().trim().max(160).nullable(),
    observacao: z.string().trim().max(600).nullable(),
    grupo: z.string().trim().max(40),
    cliente: z.string().trim().max(60).nullable(),
    status: z.enum(STATUS_EQUIPE),
    // true = a pessoa responsavel conferiu o contrato da equipe
    contratoConfirmado: z.boolean(),
    inicio: dia.nullable(),
    fim: dia.nullable(),
    campanhaId: z.string().nullable(),
  })
  .partial();

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const a = await exigir("editar");
  if ("erro" in a) return a.erro;
  {
    const fora = await foraDoEscopo(a, { equipeId: params.id });
    if (fora) return fora;
  }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 422 });
  }
  if (a.cliente && parsed.data.cliente !== undefined && (parsed.data.cliente || null) !== a.cliente) return NextResponse.json({ error: "Só a administração muda o cliente de uma equipe" }, { status: 403 });
  {
    const fora = await foraDoEscopo(a, { contrato: parsed.data.projeto });
    if (fora) return fora;
  }
  const antes = await prisma.efetivoEquipe.findUnique({ where: { id: params.id } });
  if (!antes) return NextResponse.json({ error: "Equipe não encontrada" }, { status: 404 });
  // mudar o contrato (ou conferi-lo) tira o "a confirmar" da equipe
  const { inicio, fim, campanhaId, ...basico } = parsed.data;
  const data = {
    ...basico,
    ...(parsed.data.projeto || parsed.data.contratoConfirmado ? { contratoConfirmado: true } : {}),
    ...(inicio !== undefined ? { inicio: inicio ? dataDe(inicio) : null } : {}),
    ...(fim !== undefined ? { fim: fim ? dataDe(fim) : null } : {}),
    ...(campanhaId !== undefined ? { campanhaId: campanhaId || null } : {}),
  };
  const equipe = await prisma.efetivoEquipe.update({ where: { id: params.id }, data });
  // viaturas que estao com esta equipe (passagem aberta no contrato antigo) acompanham o novo contrato
  if (parsed.data.projeto && antes.projeto !== equipe.projeto) {
    await prisma.efetivoVeiculoMovimento.updateMany({
      where: { equipeId: equipe.id, fim: null, projeto: antes.projeto },
      data: { projeto: equipe.projeto },
    });
  }
  const mudou = Object.keys(parsed.data).filter((k) => (antes as any)[k] !== (equipe as any)[k]);
  if (mudou.length) {
    await registrar(a.userId, "EQUIPE_ALTERADA", "EQUIPE", equipe.id, `Equipe ${equipe.codigo}: ${mudou.map((k) => `${k} "${(antes as any)[k] ?? ""}" → "${(equipe as any)[k] ?? ""}"`).join("; ")}`);
  }
  return NextResponse.json({ equipe });
}

// Exclui uma equipe sem vagas (criada por engano). Equipe com vagas: mova ou exclua as vagas antes.
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const a = await exigir("editar");
  if ("erro" in a) return a.erro;
  {
    const fora = await foraDoEscopo(a, { equipeId: params.id });
    if (fora) return fora;
  }
  const equipe = await prisma.efetivoEquipe.findUnique({ where: { id: params.id }, include: { _count: { select: { vagas: true } } } });
  if (!equipe) return NextResponse.json({ error: "Equipe não encontrada" }, { status: 404 });
  if (equipe._count.vagas > 0) {
    return NextResponse.json({ error: `A equipe ${equipe.codigo} ainda tem ${equipe._count.vagas} vaga(s). Mova as pessoas para outra equipe (em Detalhes) ou exclua as vagas antes. Para parar de usar a equipe, marque como Inativa.` }, { status: 409 });
  }
  await prisma.efetivoVeiculoMovimento.updateMany({ where: { equipeId: equipe.id }, data: { equipeId: null } });
  await prisma.efetivoEquipe.delete({ where: { id: equipe.id } });
  await registrar(a.userId, "EQUIPE_EXCLUIDA", "EQUIPE", equipe.id, `Equipe ${equipe.codigo} (${equipe.nome}) excluída por ${a.nome}`);
  return NextResponse.json({ ok: true });
}
