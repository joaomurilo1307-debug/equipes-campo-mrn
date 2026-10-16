import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { dataDe, diaDe, exigir, registrar, foraDoEscopo } from "@/lib/efetivos/servidor";
import { dia } from "@/lib/efetivos/esquemas";
import { instanteBrasilia } from "@/lib/efetivos/hoje";
import { planejarMovimentoDeEquipe } from "@/lib/efetivos/movimentoEquipe";
import { planejarMovimento } from "@/lib/efetivos/veiculos";

const schema = z.object({
  projeto: z.string().trim().min(1).max(60),
  local: z.string().trim().max(160).nullable().optional(),
  inicio: dia,
  fim: dia.nullable().optional(),
  observacao: z.string().trim().max(300).nullable().optional(),
  // as viaturas que estão com a equipe acompanham (padrão) e as pessoas passam a ser do novo contrato
  moverViaturas: z.boolean().default(true),
  atualizarPessoas: z.boolean().default(true),
});

// "Movimentar equipe": a equipe passa para outro contrato/frente a partir de uma data. A passagem anterior é fechada no dia
// anterior (nada se apaga). Com data de hoje ou passada o contrato da equipe muda na hora; com data futura fica agendado e
// vale a partir do dia (o sistema aplica ao abrir os dados).
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const a = await exigir("editar");
  if ("erro" in a) return a.erro;
  {
    const fora = await foraDoEscopo(a, { equipeId: params.id });
    if (fora) return fora;
  }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos", detalhes: parsed.error.flatten() }, { status: 422 });
  const d = parsed.data;
  {
    const fora = await foraDoEscopo(a, { contrato: d.projeto });
    if (fora) return fora;
  }
  const equipe = await prisma.efetivoEquipe.findUnique({ where: { id: params.id }, include: { movimentos: true } });
  if (!equipe) return NextResponse.json({ error: "Equipe não encontrada" }, { status: 404 });
  if (equipe.grupo === "Apoio") return NextResponse.json({ error: "A reserva não é uma equipe de campo" }, { status: 422 });

  const hoje = instanteBrasilia().iso;
  const passagens = equipe.movimentos.map((m) => ({ id: m.id, inicio: diaDe(m.inicio)!, fim: diaDe(m.fim), projeto: m.projeto, local: m.local }));
  const plano = planejarMovimentoDeEquipe(passagens, { projeto: equipe.projeto, local: equipe.local, inicio: diaDe(equipe.inicio), criadaEm: diaDe(equipe.criadoEm)! }, { inicio: d.inicio, fim: d.fim ?? null });
  if (!plano.ok) return NextResponse.json({ error: plano.erro }, { status: 409 });
  const agora = d.inicio <= hoje;

  const resultado = await prisma.$transaction(
    async (tx) => {
      if (plano.criarAnterior) {
        await tx.efetivoEquipeMovimento.create({
          data: {
            equipeId: equipe.id,
            inicio: dataDe(plano.criarAnterior.inicio),
            fim: dataDe(plano.criarAnterior.fim),
            projeto: plano.criarAnterior.projeto,
            local: plano.criarAnterior.local,
            observacao: "Passagem anterior à primeira movimentação (início aproximado)",
            criadoPorNome: a.nome,
          },
        });
      }
      if (plano.fecharAnterior) await tx.efetivoEquipeMovimento.update({ where: { id: plano.fecharAnterior.id }, data: { fim: dataDe(plano.fecharAnterior.fim) } });
      const movimento = await tx.efetivoEquipeMovimento.create({
        data: { equipeId: equipe.id, inicio: dataDe(d.inicio), fim: plano.fimNovo ? dataDe(plano.fimNovo) : null, projeto: d.projeto, local: d.local || null, observacao: d.observacao || null, criadoPorNome: a.nome },
      });

      let pessoas = 0;
      if (agora) {
        const contrato = await tx.efetivoContrato.findUnique({ where: { codigo: d.projeto } });
        await tx.efetivoEquipe.update({ where: { id: equipe.id }, data: { projeto: d.projeto, contratoConfirmado: true, ...(d.local ? { local: d.local } : {}), ...(contrato?.gestor ? { gestor: contrato.gestor } : {}) } });
        if (d.atualizarPessoas && equipe.projeto !== d.projeto) {
          const r = await tx.efetivoVaga.updateMany({ where: { equipeId: equipe.id, OR: [{ contrato: equipe.projeto }, { contrato: null }] }, data: { contrato: d.projeto } });
          pessoas = r.count;
        }
      }

      // viaturas que estão com a equipe no dia em que ela se move
      let viaturas = 0;
      const avisosViaturas: string[] = [];
      if (d.moverViaturas) {
        const dia0 = dataDe(d.inicio);
        const comEquipe = await tx.efetivoVeiculoMovimento.findMany({
          where: { equipeId: equipe.id, inicio: { lte: dia0 }, OR: [{ fim: null }, { fim: { gte: dia0 } }] },
          include: { veiculo: { include: { movimentos: true } } },
        });
        const vistos = new Set<string>();
        for (const atual of comEquipe) {
          if (vistos.has(atual.veiculoId)) continue;
          vistos.add(atual.veiculoId);
          const existentes = atual.veiculo.movimentos.map((m) => ({ id: m.id, veiculoId: m.veiculoId, inicio: diaDe(m.inicio)!, fim: diaDe(m.fim), projeto: m.projeto, equipeId: m.equipeId, campanhaId: m.campanhaId, local: m.local }));
          const pv = planejarMovimento(existentes, { inicio: d.inicio, fim: d.fim ?? null });
          if (!pv.ok) {
            avisosViaturas.push(`${atual.veiculo.identificacao}: ${pv.erro}`);
            continue;
          }
          if (pv.fecharAnterior) await tx.efetivoVeiculoMovimento.update({ where: { id: pv.fecharAnterior.id }, data: { fim: dataDe(pv.fecharAnterior.fim) } });
          await tx.efetivoVeiculoMovimento.create({
            data: { veiculoId: atual.veiculoId, inicio: dataDe(d.inicio), fim: pv.fimNovo ? dataDe(pv.fimNovo) : null, projeto: d.projeto, equipeId: equipe.id, local: d.local || atual.local, observacao: `Acompanhou a equipe ${equipe.codigo}`, criadoPorNome: a.nome },
          });
          viaturas++;
        }
      }
      return { movimento, pessoas, viaturas, avisosViaturas };
    },
    { timeout: 60000, maxWait: 15000 }
  );

  await registrar(
    a.userId,
    "EQUIPE_MOVIDA",
    "EQUIPE",
    equipe.id,
    `Equipe ${equipe.codigo} (${equipe.nome}): ${equipe.projeto} → ${d.projeto}${d.local ? ` (${d.local})` : ""} a partir de ${d.inicio}${agora ? "" : " (agendado)"} por ${a.nome}; ${resultado.viaturas} viatura(s) acompanharam${agora ? `, ${resultado.pessoas} pessoa(s) passaram ao novo contrato` : ""}`
  );
  return NextResponse.json({ movimento: resultado.movimento, aplicadoAgora: agora, pessoas: resultado.pessoas, viaturas: resultado.viaturas, avisos: resultado.avisosViaturas }, { status: 201 });
}
