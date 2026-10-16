import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { dataDe, diaDe, exigir, registrar } from "@/lib/efetivos/servidor";
import { dataValida } from "@/lib/efetivos/disponibilidade";
import { instanteBrasilia } from "@/lib/efetivos/hoje";
import { lerPlanilhaEfetivos, normalizar } from "@/lib/efetivos/importarPlanilha";
import { planejarAtualizacao, totalDeMudancas } from "@/lib/efetivos/planejamento";
import { filtrarPorCliente } from "@/lib/efetivos/clientes";
import { STATUS_VEICULO } from "@/lib/efetivos/veiculos";

const MAX_BYTES = 8 * 1024 * 1024;
const STATUS_OK: readonly string[] = STATUS_VEICULO;

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

  const [equipesTodas, vagasTodas, veiculosTodos, contratosTodos, ausenciasTodas, usosTodos] = await Promise.all([
    prisma.efetivoEquipe.findMany(),
    prisma.efetivoVaga.findMany(),
    prisma.efetivoVeiculo.findMany(),
    prisma.efetivoContrato.findMany(),
    prisma.efetivoAusencia.findMany(),
    prisma.efetivoVeiculoUso.findMany(),
  ]);
  // quem é de um cliente só altera o que é do cliente dele
  const escopo = filtrarPorCliente(
    { equipes: equipesTodas, vagas: vagasTodas, ausencias: ausenciasTodas, campanhas: [], alocacoes: [], veiculos: veiculosTodos, movimentos: [], contratos: contratosTodos, movimentosEquipe: [], usosVeiculo: usosTodos },
    a.cliente
  );
  const { equipes, vagas, veiculos, contratos, ausencias, usosVeiculo } = escopo;
  const plano = planejarAtualizacao(lido, {
    equipes: equipes.map((e) => ({ id: e.id, codigo: e.codigo, nome: e.nome, projeto: e.projeto, inicio: diaDe(e.inicio), fim: diaDe(e.fim), local: e.local, gestor: e.gestor, observacao: e.observacao })),
    vagas: vagas.map((v) => ({ id: v.id, equipeId: v.equipeId, numero: v.numero, origem: v.origem, nome: v.nome, cargo: v.cargo, status: v.status, previsaoInicio: diaDe(v.previsaoInicio), contratoAtual: v.contratoAtual, disponivelAPartir: diaDe(v.disponivelAPartir), destino: v.destino, observacao: v.observacao })),
    veiculos: veiculos.map((v) => ({ id: v.id, identificacao: v.identificacao, placa: v.placa, modelo: v.modelo, tracao4x4: v.tracao4x4, status: v.status, observacao: v.observacao, substituidoPorId: v.substituidoPorId, trocaEm: diaDe(v.trocaEm) })),
    contratos: contratos.map((c) => ({ codigo: c.codigo, nome: c.nome, cliente: c.cliente, gestor: c.gestor, local: c.local, observacao: c.observacao })),
    ausencias: ausencias.map((x) => ({ vagaId: x.vagaId, tipo: x.tipo, inicio: diaDe(x.inicio)!, fim: diaDe(x.fim)! })),
    usos: (usosVeiculo ?? []).map((u) => ({ veiculoId: u.veiculoId, equipeId: u.equipeId, inicio: diaDe(u.inicio), fim: diaDe(u.fim) })),
  });

  // viatura nova com o mesmo nome de uma que é de outro cliente: não cria (e não mexe nela)
  const idsNoEscopo = new Set(veiculos.map((v) => v.id));
  const nomesDeFora = new Set(veiculosTodos.filter((v) => !idsNoEscopo.has(v.id)).map((v) => normalizar(v.identificacao)));
  const barradas = new Set(plano.veiculosNovos.filter((n) => nomesDeFora.has(n.chave)).map((n) => n.chave));
  if (barradas.size) {
    for (const n of plano.veiculosNovos.filter((x) => barradas.has(x.chave))) plano.avisos.push(`Viatura «${n.identificacao}» já existe em outro cliente; não foi criada nem alterada.`);
    plano.veiculosNovos = plano.veiculosNovos.filter((n) => !barradas.has(n.chave));
    plano.usos = plano.usos.filter((x) => !(x.veiculoNovo && barradas.has(x.veiculoNovo)));
    plano.trocas = plano.trocas.filter((x) => !(x.veiculoNovo && barradas.has(x.veiculoNovo)) && !(x.alvoNovo && barradas.has(x.alvoNovo)));
  }
  const resumo = {
    simulacao: simular,
    equipes: plano.equipes.length,
    posicoes: plano.vagas.length,
    viaturas: plano.veiculos.length,
    contratos: plano.contratos.length,
    ausencias: plano.ausencias.length,
    viaturasNovas: plano.veiculosNovos.length,
    periodosDeViatura: plano.usos.length,
    trocas: plano.trocas.length,
    total: totalDeMudancas(plano),
    exemplos: [
      ...plano.equipes.slice(0, 6).map((x) => `${x.rotulo}: ${Object.entries(x.mudancas).map(([k, v]) => `${k} ${v}`).join(", ")}`),
      ...plano.vagas.slice(0, 4).map((x) => `${x.rotulo}: ${Object.entries(x.mudancas).map(([k, v]) => `${k} ${v}`).join(", ")}`),
      ...plano.ausencias.slice(0, 4).map((x) => `${x.rotulo}: ${x.tipo} ${x.inicio} a ${x.fim}`),
      ...plano.veiculosNovos.slice(0, 4).map((x) => `Nova viatura ${x.identificacao}${x.status ? ` (${x.status})` : ""}`),
      ...plano.usos.slice(0, 4).map((x) => `${x.rotulo}: ${x.inicio ?? "?"} a ${x.fim ?? "?"}`),
      ...plano.trocas.slice(0, 4).map((x) => `Troca ${x.rotulo}${x.trocaEm ? ` em ${x.trocaEm}` : ""}`),
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

      // viaturas que o Excel traz e o sistema ainda não tem (a que vai chegar para substituir outra, por exemplo)
      const idDaNova = new Map<string, string>();
      if (plano.veiculosNovos.length) {
        const todos = await tx.efetivoVeiculo.findMany({ select: { codigo: true } });
        const maior = todos.reduce((m, v) => Math.max(m, Number(/^VEI-(\d+)$/.exec(v.codigo)?.[1] ?? 0)), 0);
        let n = 0;
        for (const x of plano.veiculosNovos) {
          const v = await tx.efetivoVeiculo.create({
            data: { codigo: `VEI-${String(maior + ++n).padStart(3, "0")}`, identificacao: x.identificacao, placa: x.placa ? x.placa.toUpperCase().replace(/\s+/g, "") : null, modelo: x.modelo, tracao4x4: x.tracao4x4, status: x.status && STATUS_OK.includes(x.status) ? x.status : "Em operação", observacao: x.observacao, cliente: a.cliente ?? x.cliente },
          });
          idDaNova.set(x.chave, v.id);
        }
      }
      const idDe = (id: string | null, nova: string | null) => id ?? (nova ? idDaNova.get(nova) ?? null : null);
      // o período da viatura em cada equipe
      for (const x of plano.usos) {
        const veiculoId = idDe(x.veiculoId, x.veiculoNovo);
        if (!veiculoId) continue;
        const data = { inicio: dia(x.inicio), fim: dia(x.fim) };
        await tx.efetivoVeiculoUso.upsert({ where: { veiculoId_equipeId: { veiculoId, equipeId: x.equipeId } }, create: { veiculoId, equipeId: x.equipeId, ...data }, update: data });
      }
      // a troca planejada
      for (const x of plano.trocas) {
        const veiculoId = idDe(x.veiculoId, x.veiculoNovo);
        const alvoId = idDe(x.alvoId, x.alvoNovo);
        if (!veiculoId || !alvoId || veiculoId === alvoId) continue;
        await tx.efetivoVeiculo.update({ where: { id: veiculoId }, data: { substituidoPorId: alvoId, ...(x.trocaEm ? { trocaEm: dia(x.trocaEm) } : {}) } });
      }
    },
    { timeout: 60000, maxWait: 15000 }
  );
  await registrar(a.userId, "PLANEJAMENTO_IMPORTADO", "IMPORTACAO", undefined, `Planejamento preenchido enviado por ${a.nome} ("${arquivo.name}"): ${resumo.equipes} equipes, ${resumo.posicoes} posições, ${resumo.viaturas} viaturas, ${resumo.contratos} contratos, ${resumo.ausencias} ausências, ${resumo.viaturasNovas} viaturas novas, ${resumo.periodosDeViatura} períodos de viatura e ${resumo.trocas} trocas`);
  return NextResponse.json({ ...resumo, simulacao: false });
}
