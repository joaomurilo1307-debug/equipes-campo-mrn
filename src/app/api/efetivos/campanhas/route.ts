import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { dataDe, dadosParaRegra, exigir, registrar } from "@/lib/efetivos/servidor";
import { campanhaComEquipeSchema } from "@/lib/efetivos/esquemas";
import { STATUS_CAMPANHA_QUE_LIBERAM, validarAlocacao } from "@/lib/efetivos/disponibilidade";

export async function POST(req: Request) {
  const a = await exigir("global");
  if ("erro" in a) return a.erro;
  const parsed = campanhaComEquipeSchema
    .refine((v) => v.inicio <= v.fim, { message: "O fim não pode ser antes do início", path: ["fim"] })
    .safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos", detalhes: parsed.error.flatten() }, { status: 422 });
  const { vagaIds: idsBrutos, periodos = {}, necessidade, ...d } = parsed.data;
  const vagaIds = Array.from(new Set(idsBrutos));

  // A equipe nasce junto com a campanha: se alguem escolhido nao estiver livre no periodo, nada e criado.
  if (vagaIds.length > 0) {
    if (STATUS_CAMPANHA_QUE_LIBERAM.includes(d.status)) return NextResponse.json({ error: "Uma campanha concluída ou cancelada não segura equipe" }, { status: 422 });
    const { regra } = await dadosParaRegra();
    const problemas = validarAlocacao(regra, "", vagaIds, d.inicio, d.fim, periodos);
    if (problemas.length > 0) {
      const nomes = new Map(regra.vagas.map((v) => [v.id, v.nome ?? "(sem nome)"]));
      return NextResponse.json(
        { error: "Algumas pessoas não estão livres no período escolhido. Nada foi criado.", conflitos: problemas.map((p) => ({ ...p, nome: nomes.get(p.vagaId) ?? null })) },
        { status: 409 }
      );
    }
  }

  // codigo sequencial CAM-001...; tenta de novo se dois cadastros colidirem
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const todas = await prisma.efetivoCampanha.findMany({ select: { codigo: true } });
    const maior = todas.reduce((m, c) => Math.max(m, Number(/^CAM-(\d+)$/.exec(c.codigo)?.[1] ?? 0)), 0);
    const codigo = `CAM-${String(maior + 1).padStart(3, "0")}`;
    try {
      const campanha = await prisma.efetivoCampanha.create({
        data: {
          codigo,
          recebidaEm: d.recebidaEm ? dataDe(d.recebidaEm) : null,
          solicitante: d.solicitante || null,
          projeto: d.projeto,
          grupo: d.grupo,
          atividade: d.atividade,
          local: d.local || null,
          equipeNome: d.equipeNome || null,
          necessidade: necessidade?.length ? necessidade : undefined,
          inicio: dataDe(d.inicio),
          fim: dataDe(d.fim),
          qtdEquipes: d.qtdEquipes,
          prioridade: d.prioridade,
          status: d.status,
          observacao: d.observacao || null,
          criadoPorNome: a.nome,
          alocacoes: {
            create: vagaIds.map((vagaId) => {
              const p = periodos[vagaId] ?? { inicio: d.inicio, fim: d.fim };
              return { vagaId, inicio: dataDe(p.inicio), fim: dataDe(p.fim), criadoPorNome: a.nome };
            }),
          },
        },
      });
      await registrar(
        a.userId,
        "CAMPANHA_CRIADA",
        "CAMPANHA",
        campanha.id,
        `Campanha ${codigo} (${d.projeto}, ${d.grupo}, ${d.atividade}) de ${d.inicio} a ${d.fim} criada por ${a.nome}, com ${vagaIds.length} pessoa(s) na equipe`
      );
      return NextResponse.json({ campanha }, { status: 201 });
    } catch (e: any) {
      if (e?.code !== "P2002") throw e;
    }
  }
  return NextResponse.json({ error: "Não foi possível gerar o código da campanha, tente de novo" }, { status: 409 });
}
