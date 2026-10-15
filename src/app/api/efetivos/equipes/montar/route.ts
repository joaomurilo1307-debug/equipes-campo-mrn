import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { dadosParaRegra, dataDe, exigir, proximoNumeroDeVaga, registrar } from "@/lib/efetivos/servidor";
import { dataValida, validarAlocacao } from "@/lib/efetivos/disponibilidade";
import { dadosAoEntrarNaEquipe, vagaAbertaNoLugarDe } from "@/lib/efetivos/vagas";

const dia = z.string().refine(dataValida, "Data inválida (AAAA-MM-DD)");

const schema = z
  .object({
    nome: z.string().trim().min(1).max(120),
    projeto: z.string().trim().min(1).max(60),
    grupo: z.string().trim().max(40).default(""),
    gestor: z.string().trim().max(80).nullable().optional(),
    local: z.string().trim().max(160).nullable().optional(),
    observacao: z.string().trim().max(600).nullable().optional(),
    inicio: dia.nullable().optional(),
    fim: dia.nullable().optional(),
    campanhaId: z.string().nullable().optional(),
    // colaboradores já cadastrados que entram na equipe (saem da equipe atual, que fica com a vaga aberta)
    colaboradorIds: z.array(z.string().min(1)).max(200).default([]),
    abrirVagasNasOrigens: z.boolean().default(true),
    // pessoas novas cadastradas na hora (já entram na equipe)
    novos: z
      .array(
        z.object({
          nome: z.string().trim().min(1).max(120),
          cargo: z.string().trim().min(1).max(120),
          empresa: z.string().trim().min(1).max(60),
          atividade: z.string().trim().min(1).max(60).default("Resgate"),
          nivel: z.string().trim().max(30).nullable().optional(),
          direcao4x4: z.boolean().nullable().optional(),
        })
      )
      .max(100)
      .default([]),
    // posições a preencher depois: abre as vagas já na equipe
    vagasAbertas: z
      .array(z.object({ cargo: z.string().trim().min(1).max(120), empresa: z.string().trim().min(1).max(60), atividade: z.string().trim().min(1).max(60).default("Resgate"), quantidade: z.number().int().min(1).max(50) }))
      .max(40)
      .default([]),
  })
  .refine((v) => !v.inicio || !v.fim || v.inicio <= v.fim, { message: "O fim não pode ser antes do início", path: ["fim"] });

// "Nova equipe": como montar uma campanha. Escolhe-se o contrato, o período, os colaboradores cadastrados (ou se cadastra alguém na hora)
// e, se quiser, a campanha. Se há período, quem estiver ausente ou ocupado nele é recusado e nada é criado.
export async function POST(req: Request) {
  const a = await exigir("editar");
  if ("erro" in a) return a.erro;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos", detalhes: parsed.error.flatten() }, { status: 422 });
  const d = parsed.data;
  const ids = Array.from(new Set(d.colaboradorIds));

  if (d.campanhaId && !(await prisma.efetivoCampanha.findUnique({ where: { id: d.campanhaId } }))) {
    return NextResponse.json({ error: "Campanha não encontrada" }, { status: 404 });
  }
  const pessoas = await prisma.efetivoVaga.findMany({ where: { id: { in: ids } }, include: { equipe: true } });
  if (pessoas.length !== ids.length || pessoas.some((p) => !p.nome)) {
    return NextResponse.json({ error: "Algum colaborador escolhido não existe mais ou está sem nome" }, { status: 422 });
  }
  if (d.inicio && d.fim && ids.length > 0) {
    const { regra } = await dadosParaRegra();
    const problemas = validarAlocacao(regra, "", ids, d.inicio, d.fim);
    if (problemas.length > 0) {
      const nomes = new Map(regra.vagas.map((v) => [v.id, v.nome ?? "(sem nome)"]));
      return NextResponse.json(
        { error: "Algumas pessoas não estão livres no período escolhido. Nada foi criado.", conflitos: problemas.map((p) => ({ ...p, nome: nomes.get(p.vagaId) ?? null })) },
        { status: 409 }
      );
    }
  }

  const resultado = await prisma.$transaction(async (tx) => {
    const todas = await tx.efetivoEquipe.findMany({ select: { codigo: true } });
    const maior = todas.reduce((m, e) => Math.max(m, Number(/^EQ-(\d+)$/.exec(e.codigo)?.[1] ?? 0)), 0);
    const equipe = await tx.efetivoEquipe.create({
      data: {
        codigo: `EQ-${String(maior + 1).padStart(2, "0")}`,
        nome: d.nome,
        projeto: d.projeto,
        grupo: d.grupo,
        gestor: d.gestor || null,
        local: d.local || null,
        observacao: d.observacao || null,
        status: "Ativa",
        ordem: todas.length + 1,
        inicio: d.inicio ? dataDe(d.inicio) : null,
        fim: d.fim ? dataDe(d.fim) : null,
        campanhaId: d.campanhaId || null,
      },
    });
    let abertasNasOrigens = 0;
    for (const p of pessoas) {
      if (d.abrirVagasNasOrigens && p.equipe.grupo !== "Apoio") {
        await tx.efetivoVaga.create({ data: { numero: await proximoNumeroDeVaga(tx), equipeId: p.equipeId, ...vagaAbertaNoLugarDe(p), observacao: `Vaga aberta pela saída de ${p.nome}` } });
        abertasNasOrigens++;
      }
      await tx.efetivoVaga.update({ where: { id: p.id }, data: dadosAoEntrarNaEquipe(p, equipe) });
    }
    for (const n of d.novos) {
      await tx.efetivoVaga.create({
        data: {
          numero: await proximoNumeroDeVaga(tx),
          equipeId: equipe.id,
          nome: n.nome,
          cargo: n.cargo,
          empresa: n.empresa,
          atividade: n.atividade,
          nivel: n.nivel || null,
          direcao4x4: n.direcao4x4 ?? null,
          status: "Vigente",
          contrato: equipe.projeto !== "A definir" ? equipe.projeto : null,
          equipeContrato: equipe.nome,
        },
      });
    }
    let abertas = 0;
    for (const v of d.vagasAbertas) {
      for (let i = 0; i < v.quantidade; i++) {
        await tx.efetivoVaga.create({
          data: { numero: await proximoNumeroDeVaga(tx), equipeId: equipe.id, nome: null, cargo: v.cargo, empresa: v.empresa, atividade: v.atividade, status: "Vigente", contrato: equipe.projeto !== "A definir" ? equipe.projeto : null, equipeContrato: equipe.nome },
        });
        abertas++;
      }
    }
    return { equipe, abertasNasOrigens, abertas };
  }, { timeout: 60000, maxWait: 15000 });

  await registrar(
    a.userId,
    "EQUIPE_CRIADA",
    "EQUIPE",
    resultado.equipe.id,
    `Equipe ${resultado.equipe.codigo} (${d.nome}) no contrato ${d.projeto}${d.inicio ? ` de ${d.inicio} a ${d.fim ?? "—"}` : ""} criada por ${a.nome}: ${pessoas.length} colaborador(es) puxado(s), ${d.novos.length} cadastrado(s) na hora, ${resultado.abertas} vaga(s) aberta(s)`
  );
  return NextResponse.json({ equipe: resultado.equipe, puxados: pessoas.length, cadastrados: d.novos.length, vagasAbertas: resultado.abertas }, { status: 201 });
}
