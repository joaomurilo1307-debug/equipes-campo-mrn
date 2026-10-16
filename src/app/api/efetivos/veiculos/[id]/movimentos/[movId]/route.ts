import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { dataDe, diaDe, exigir, registrar, foraDoEscopo } from "@/lib/efetivos/servidor";
import { dia } from "@/lib/efetivos/esquemas";
import { validarEdicaoMovimento } from "@/lib/efetivos/veiculos";

const schema = z
  .object({
    inicio: dia,
    fim: dia.nullable(),
    projeto: z.string().trim().min(1).max(60),
    equipeId: z.string().nullable(),
    campanhaId: z.string().nullable(),
    local: z.string().trim().max(160).nullable(),
    observacao: z.string().trim().max(300).nullable(),
  })
  .partial();

// Corrige uma passagem do historico (datas, contrato, equipe, local), sem sobrepor as outras do veiculo.
export async function PATCH(req: Request, { params }: { params: { id: string; movId: string } }) {
  const a = await exigir("editar");
  if ("erro" in a) return a.erro;
  {
    const fora = await foraDoEscopo(a, { veiculoId: params.id });
    if (fora) return fora;
  }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || Object.keys(parsed.data).length === 0) return NextResponse.json({ error: "Dados inválidos" }, { status: 422 });
  {
    const fora = await foraDoEscopo(a, { equipeId: parsed.data.equipeId, contrato: parsed.data.projeto });
    if (fora) return fora;
  }
  const veiculo = await prisma.efetivoVeiculo.findUnique({ where: { id: params.id }, include: { movimentos: true } });
  const mov = veiculo?.movimentos.find((m) => m.id === params.movId);
  if (!veiculo || !mov) return NextResponse.json({ error: "Passagem não encontrada" }, { status: 404 });

  const d = parsed.data;
  const inicio = d.inicio ?? diaDe(mov.inicio)!;
  const fim = d.fim !== undefined ? d.fim : diaDe(mov.fim);
  const outras = veiculo.movimentos.map((m) => ({ id: m.id, veiculoId: m.veiculoId, inicio: diaDe(m.inicio)!, fim: diaDe(m.fim), projeto: m.projeto, equipeId: m.equipeId, campanhaId: m.campanhaId, local: m.local }));
  const erro = validarEdicaoMovimento(outras, mov.id, { inicio, fim });
  if (erro) return NextResponse.json({ error: erro }, { status: 409 });
  if (d.equipeId && !(await prisma.efetivoEquipe.findUnique({ where: { id: d.equipeId } }))) return NextResponse.json({ error: "Equipe não encontrada" }, { status: 404 });

  const novo = await prisma.efetivoVeiculoMovimento.update({
    where: { id: mov.id },
    data: {
      ...(d.inicio ? { inicio: dataDe(d.inicio) } : {}),
      ...(d.fim !== undefined ? { fim: d.fim ? dataDe(d.fim) : null } : {}),
      ...(d.projeto ? { projeto: d.projeto } : {}),
      ...(d.equipeId !== undefined ? { equipeId: d.equipeId } : {}),
      ...(d.campanhaId !== undefined ? { campanhaId: d.campanhaId } : {}),
      ...(d.local !== undefined ? { local: d.local || null } : {}),
      ...(d.observacao !== undefined ? { observacao: d.observacao || null } : {}),
    },
  });
  await registrar(
    a.userId,
    "VEICULO_PASSAGEM_ALTERADA",
    "VEICULO",
    veiculo.id,
    `Veículo ${veiculo.codigo} (${veiculo.identificacao}): passagem ${mov.projeto} ${diaDe(mov.inicio)}–${diaDe(mov.fim) ?? "sem fim"} → ${novo.projeto} ${diaDe(novo.inicio)}–${diaDe(novo.fim) ?? "sem fim"} (por ${a.nome})`
  );
  return NextResponse.json({ ok: true });
}

// Corrige um lancamento errado de localizacao (o historico da remocao fica registrado).
export async function DELETE(_req: Request, { params }: { params: { id: string; movId: string } }) {
  const a = await exigir("editar");
  if ("erro" in a) return a.erro;
  {
    const fora = await foraDoEscopo(a, { veiculoId: params.id });
    if (fora) return fora;
  }
  const mov = await prisma.efetivoVeiculoMovimento.findFirst({ where: { id: params.movId, veiculoId: params.id }, include: { veiculo: true } });
  if (!mov) return NextResponse.json({ error: "Passagem não encontrada" }, { status: 404 });
  await prisma.efetivoVeiculoMovimento.delete({ where: { id: mov.id } });
  await registrar(
    a.userId,
    "VEICULO_PASSAGEM_REMOVIDA",
    "VEICULO",
    params.id,
    `Veículo ${mov.veiculo.codigo} (${mov.veiculo.identificacao}): passagem em ${mov.projeto} de ${diaDe(mov.inicio)} a ${diaDe(mov.fim) ?? "sem fim"} removida (por ${a.nome})`
  );
  return NextResponse.json({ ok: true });
}
