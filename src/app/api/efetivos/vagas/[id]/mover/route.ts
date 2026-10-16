import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { exigir, garantirUso, proximoNumeroDeVaga, registrar, foraDoEscopo } from "@/lib/efetivos/servidor";
import { dadosAoEntrarNaEquipe, posicaoLivreParaOcupar, vagaAbertaNoLugarDe } from "@/lib/efetivos/vagas";

const schema = z.object({
  equipeId: z.string().min(1),
  // ocupa esta posição sem pessoa da equipe de destino (vaga aberta ou posição preenchida sem nome); sem ela, entra como posição nova
  vagaDestinoId: z.string().nullable().optional(),
  // deixa a vaga aberta na equipe de onde a pessoa sai (não vale para quem vem da reserva)
  abrirVagaNaOrigem: z.boolean().default(true),
});

// Puxar/mover um colaborador para uma equipe: sai da equipe atual (que fica com a vaga aberta) e entra na nova, ocupando uma vaga.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const a = await exigir("editar");
  if ("erro" in a) return a.erro;
  {
    const fora = await foraDoEscopo(a, { vagaId: params.id });
    if (fora) return fora;
  }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos" }, { status: 422 });
  const d = parsed.data;
  {
    // quem é de um cliente só move para equipe do mesmo cliente; só a administração cruza de um cliente para outro
    const fora = await foraDoEscopo(a, { equipeId: d.equipeId });
    if (fora) return fora;
  }

  const pessoa = await prisma.efetivoVaga.findUnique({ where: { id: params.id }, include: { equipe: true } });
  if (!pessoa) return NextResponse.json({ error: "Colaborador não encontrado" }, { status: 404 });
  if (!pessoa.nome) return NextResponse.json({ error: "Esta posição não tem pessoa para mover" }, { status: 422 });
  const destino = await prisma.efetivoEquipe.findUnique({ where: { id: d.equipeId } });
  if (!destino) return NextResponse.json({ error: "Equipe de destino não encontrada" }, { status: 404 });
  if (destino.id === pessoa.equipeId) return NextResponse.json({ error: "A pessoa já está nesta equipe" }, { status: 422 });
  const lugar = d.vagaDestinoId ? await prisma.efetivoVaga.findUnique({ where: { id: d.vagaDestinoId } }) : null;
  if (d.vagaDestinoId) {
    if (!lugar || lugar.equipeId !== destino.id) return NextResponse.json({ error: "A vaga escolhida não é desta equipe" }, { status: 422 });
    if (!posicaoLivreParaOcupar(lugar)) return NextResponse.json({ error: "A vaga escolhida já tem pessoa" }, { status: 422 });
  }

  const veioDeEquipe = pessoa.equipe.grupo !== "Apoio";
  const r = await prisma.$transaction(async (tx) => {
    let aberta = null;
    if (d.abrirVagaNaOrigem && veioDeEquipe) {
      aberta = await tx.efetivoVaga.create({
        data: { numero: await proximoNumeroDeVaga(tx), equipeId: pessoa.equipeId, ...vagaAbertaNoLugarDe(pessoa), observacao: `Vaga aberta pela saída de ${pessoa.nome}` },
      });
    }
    // a vaga ocupada deixa de existir como posição vazia: a pessoa passa a ocupar o lugar
    if (lugar) await tx.efetivoVaga.delete({ where: { id: lugar.id } });
    const atualizada = await tx.efetivoVaga.update({ where: { id: pessoa.id }, data: dadosAoEntrarNaEquipe(pessoa, destino, lugar) });
    await garantirUso(tx, atualizada.veiculoId, atualizada.equipeId);
    return { aberta, atualizada };
  });

  await registrar(
    a.userId,
    "VAGA_MOVIDA",
    "VAGA",
    pessoa.id,
    `${pessoa.nome}: ${pessoa.equipe.grupo === "Apoio" ? "fora das equipes" : `equipe ${pessoa.equipe.codigo}`} → ${destino.codigo} (${destino.nome})${lugar ? ", ocupando uma vaga" : ""}${r.aberta ? `; vaga aberta em ${pessoa.equipe.codigo}` : ""} (por ${a.nome})`
  );
  return NextResponse.json({ vaga: r.atualizada, vagaAberta: r.aberta });
}
