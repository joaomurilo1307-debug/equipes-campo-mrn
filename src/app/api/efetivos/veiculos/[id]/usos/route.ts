import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { dataDe, diaDe, exigir, foraDoEscopo, registrar } from "@/lib/efetivos/servidor";
import { dia } from "@/lib/efetivos/esquemas";
import { conferirUso } from "@/lib/efetivos/usosVeiculo";

const schema = z.object({
  equipeId: z.string().min(1),
  inicio: dia.nullable().optional(),
  fim: dia.nullable().optional(),
  observacao: z.string().trim().max(200).nullable().optional(),
});

const fmt = (d: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "—");

// Define (ou corrige) por quanto tempo a viatura fica numa equipe. Cria a linha se ainda não existe.
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const a = await exigir("editar");
  if ("erro" in a) return a.erro;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos", detalhes: parsed.error.flatten() }, { status: 422 });
  const d = parsed.data;
  {
    const fora = await foraDoEscopo(a, { veiculoId: params.id, equipeId: d.equipeId });
    if (fora) return fora;
  }
  if (d.inicio && d.fim && d.fim < d.inicio) return NextResponse.json({ error: "O fim não pode ser antes do início" }, { status: 422 });
  const [veiculo, equipe] = await Promise.all([prisma.efetivoVeiculo.findUnique({ where: { id: params.id } }), prisma.efetivoEquipe.findUnique({ where: { id: d.equipeId } })]);
  if (!veiculo) return NextResponse.json({ error: "Viatura não encontrada" }, { status: 404 });
  if (!equipe) return NextResponse.json({ error: "Equipe não encontrada" }, { status: 404 });

  const dados = {
    ...(d.inicio !== undefined ? { inicio: d.inicio ? dataDe(d.inicio) : null } : {}),
    ...(d.fim !== undefined ? { fim: d.fim ? dataDe(d.fim) : null } : {}),
    ...(d.observacao !== undefined ? { observacao: d.observacao || null } : {}),
  };
  const uso = await prisma.efetivoVeiculoUso.upsert({
    where: { veiculoId_equipeId: { veiculoId: veiculo.id, equipeId: equipe.id } },
    create: { veiculoId: veiculo.id, equipeId: equipe.id, ...dados },
    update: dados,
  });
  const conferencia = conferirUso({ inicio: diaDe(uso.inicio), fim: diaDe(uso.fim) }, { inicio: diaDe(equipe.inicio), fim: diaDe(equipe.fim) });
  await registrar(a.userId, "VEICULO_PERIODO", "VEICULO", veiculo.id, `Viatura ${veiculo.identificacao} na equipe ${equipe.codigo}: ${fmt(diaDe(uso.inicio))} a ${fmt(diaDe(uso.fim))} (${conferencia.texto}) (por ${a.nome})`);
  return NextResponse.json({ uso: { id: uso.id, veiculoId: uso.veiculoId, equipeId: uso.equipeId, inicio: diaDe(uso.inicio), fim: diaDe(uso.fim), observacao: uso.observacao }, conferencia });
}

// Tira a viatura da lista da equipe. Só quando ninguém da equipe está com ela.
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const a = await exigir("editar");
  if ("erro" in a) return a.erro;
  const equipeId = new URL(req.url).searchParams.get("equipeId");
  if (!equipeId) return NextResponse.json({ error: "Informe a equipe" }, { status: 422 });
  {
    const fora = await foraDoEscopo(a, { veiculoId: params.id, equipeId });
    if (fora) return fora;
  }
  const uso = await prisma.efetivoVeiculoUso.findUnique({ where: { veiculoId_equipeId: { veiculoId: params.id, equipeId } }, include: { veiculo: true, equipe: true } });
  if (!uso) return NextResponse.json({ error: "Esta viatura não está nesta equipe" }, { status: 404 });
  const comEla = await prisma.efetivoVaga.count({ where: { veiculoId: params.id, equipeId } });
  if (comEla > 0) return NextResponse.json({ error: `${comEla} pessoa(s) desta equipe estão com esta viatura. Troque a viatura delas antes de tirá-la da equipe.` }, { status: 409 });
  await prisma.efetivoVeiculoUso.delete({ where: { id: uso.id } });
  await registrar(a.userId, "VEICULO_PERIODO", "VEICULO", params.id, `Viatura ${uso.veiculo.identificacao} retirada da equipe ${uso.equipe.codigo} (por ${a.nome})`);
  return NextResponse.json({ ok: true });
}
