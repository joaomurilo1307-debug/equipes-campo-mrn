import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { dataDe, diaDe, exigir, registrar } from "@/lib/efetivos/servidor";
import { dataValida } from "@/lib/efetivos/disponibilidade";
import { instanteBrasilia } from "@/lib/efetivos/hoje";
import { lerPlanilhaEfetivos } from "@/lib/efetivos/importarPlanilha";
import { planejarAtualizacao, totalDeMudancas } from "@/lib/efetivos/planejamento";
import { filtrarPorCliente } from "@/lib/efetivos/clientes";

const MAX_BYTES = 8 * 1024 * 1024;

// Envia a base em Excel PREENCHIDA (início e fim das equipes, previsão de entrada, placas, períodos de ausência...).
// Só preenche: célula em branco nunca apaga o que já está no sistema, e nada do que veio das planilhas do Samuel é alterado.
// Com ?simular=1 mostra o que mudaria, sem gravar.
export async function POST(req: Request) {
  const a = await exigir("editar");
  if ("erro" in a) return a.erro;
  const simular = new URL(req.url).searchParams.get("simular") === "1";
  const form = await req.formData().catch(() => null);
  const campo = form?.get("arquivo");
  if (!campo || typeof campo === "string" || typeof (campo as File).arrayBuffer !== "function") {
    return NextResponse.json({ error: "Envie a base em Excel (.xlsx) no campo 'arquivo'" }, { status: 422 });
  }
  const arquivo = campo as File;
  if (arquivo.size > MAX_BYTES) return NextResponse.json({ error: "Arquivo grande demais (máximo 8 MB)" }, { status: 422 });

  let lido;
  try {
    lido = lerPlanilhaEfetivos(Buffer.from(await arquivo.arrayBuffer()), { anoReferencia: Number(instanteBrasilia().iso.slice(0, 4)) });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Não consegui ler a planilha" }, { status: 422 });
  }
  if (lido.formato !== "base") {
    return NextResponse.json({ error: "Esta não é a base do sistema. Baixe a base em Base > Baixar Excel, preencha as colunas amarelas e envie de volta." }, { status: 422 });
  }

  const [equipesTodas, vagasTodas, veiculosTodos, contratosTodos, ausenciasTodas] = await Promise.all([
    prisma.efetivoEquipe.findMany(),
    prisma.efetivoVaga.findMany(),
    prisma.efetivoVeiculo.findMany(),
    prisma.efetivoContrato.findMany(),
    prisma.efetivoAusencia.findMany(),
  ]);
  // quem é de um cliente só altera o que é do cliente dele
  const escopo = filtrarPorCliente(
    { equipes: equipesTodas, vagas: vagasTodas, ausencias: ausenciasTodas, campanhas: [], alocacoes: [], veiculos: veiculosTodos, movimentos: [], contratos: contratosTodos, movimentosEquipe: [] },
    a.cliente
  );
  const { equipes, vagas, veiculos, contratos, ausencias } = escopo;
  const plano = planejarAtualizacao(lido, {
    equipes: equipes.map((e) => ({ id: e.id, codigo: e.codigo, nome: e.nome, projeto: e.projeto, inicio: diaDe(e.inicio), fim: diaDe(e.fim), local: e.local, gestor: e.gestor, observacao: e.observacao })),
    vagas: vagas.map((v) => ({ id: v.id, equipeId: v.equipeId, numero: v.numero, origem: v.origem, nome: v.nome, cargo: v.cargo, status: v.status, previsaoInicio: diaDe(v.previsaoInicio), contratoAtual: v.contratoAtual, disponivelAPartir: diaDe(v.disponivelAPartir), destino: v.destino, observacao: v.observacao })),
    veiculos: veiculos.map((v) => ({ id: v.id, identificacao: v.identificacao, placa: v.placa, modelo: v.modelo, tracao4x4: v.tracao4x4, status: v.status, observacao: v.observacao })),
    contratos: contratos.map((c) => ({ codigo: c.codigo, nome: c.nome, cliente: c.cliente, gestor: c.gestor, local: c.local, observacao: c.observacao })),
    ausencias: ausencias.map((x) => ({ vagaId: x.vagaId, tipo: x.tipo, inicio: diaDe(x.inicio)!, fim: diaDe(x.fim)! })),
  });
  const resumo = {
    simulacao: simular,
    equipes: plano.equipes.length,
    posicoes: plano.vagas.length,
    viaturas: plano.veiculos.length,
    contratos: plano.contratos.length,
    ausencias: plano.ausencias.length,
    total: totalDeMudancas(plano),
    exemplos: [
      ...plano.equipes.slice(0, 6).map((x) => `${x.rotulo}: ${Object.entries(x.mudancas).map(([k, v]) => `${k} ${v}`).join(", ")}`),
      ...plano.vagas.slice(0, 4).map((x) => `${x.rotulo}: ${Object.entries(x.mudancas).map(([k, v]) => `${k} ${v}`).join(", ")}`),
      ...plano.ausencias.slice(0, 4).map((x) => `${x.rotulo}: ${x.tipo} ${x.inicio} a ${x.fim}`),
    ],
    avisos: plano.avisos,
  };
  if (simular || plano.avisos.length > 0 && totalDeMudancas(plano) === 0) return NextResponse.json(resumo);

  const dia = (d: string | null | undefined) => (d && dataValida(d) ? dataDe(d) : null);
  await prisma.$transaction(
    async (tx) => {
      for (const x of plano.equipes) {
        const m = x.mudancas;
        await tx.efetivoEquipe.update({ where: { id: x.id }, data: { ...(m.inicio ? { inicio: dia(m.inicio) } : {}), ...(m.fim ? { fim: dia(m.fim) } : {}), ...(m.local ? { local: m.local } : {}), ...(m.gestor ? { gestor: m.gestor } : {}), ...(m.observacao ? { observacao: m.observacao } : {}) } });
      }
      for (const x of plano.vagas) {
        const m = x.mudancas;
        await tx.efetivoVaga.update({ where: { id: x.id }, data: { ...(m.status ? { status: m.status } : {}), ...(m.previsaoInicio ? { previsaoInicio: dia(m.previsaoInicio) } : {}), ...(m.contratoAtual ? { contratoAtual: m.contratoAtual } : {}), ...(m.disponivelAPartir ? { disponivelAPartir: dia(m.disponivelAPartir) } : {}), ...(m.destino ? { destino: m.destino } : {}), ...(m.observacao ? { observacao: m.observacao } : {}) } });
      }
      for (const x of plano.veiculos) await tx.efetivoVeiculo.update({ where: { id: x.id }, data: x.mudancas });
      for (const x of plano.contratos) await tx.efetivoContrato.update({ where: { codigo: x.codigo }, data: x.mudancas });
      for (const x of plano.ausencias) await tx.efetivoAusencia.create({ data: { vagaId: x.vagaId, tipo: x.tipo, inicio: dataDe(x.inicio), fim: dataDe(x.fim) } });
    },
    { timeout: 60000, maxWait: 15000 }
  );
  await registrar(a.userId, "PLANEJAMENTO_IMPORTADO", "IMPORTACAO", undefined, `Planejamento preenchido enviado por ${a.nome} ("${arquivo.name}"): ${resumo.equipes} equipes, ${resumo.posicoes} posições, ${resumo.viaturas} viaturas, ${resumo.contratos} contratos e ${resumo.ausencias} ausências`);
  return NextResponse.json({ ...resumo, simulacao: false });
}
