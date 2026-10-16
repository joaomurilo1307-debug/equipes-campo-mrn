import { test } from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { lerPlanilhaEfetivos } from "../src/lib/efetivos/importarPlanilha";
import { montarPlanilhaBase, linhasDaBase, origensDe, type DadosBase } from "../src/lib/efetivos/base";
import { indexar, type VagaBase } from "../src/lib/efetivos/disponibilidade";
import { contar, estadoDaEquipe, resumirDia, situacaoDaPosicao, type EquipeDoDia } from "../src/lib/efetivos/situacao";
import { detalheDaSemana, indexarAusencias, somarSemanas } from "../src/lib/efetivos/semanas";
import { contratoDaEquipeNoDia, planejarMovimentoDeEquipe } from "../src/lib/efetivos/movimentoEquipe";

function xlsx(abas: Record<string, unknown[][]>): Buffer {
  const wb = XLSX.utils.book_new();
  for (const [nome, linhas] of Object.entries(abas)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(linhas), nome);
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

// ---------------------------------------------------------------- situação: uma regra só

const eq = (o: Partial<EquipeDoDia> & { id: string }): EquipeDoDia => ({ codigo: o.id, nome: `Equipe ${o.id}`, projeto: "3636 PNM", grupo: "Fauna", status: "Ativa", inicio: null, fim: null, ...o });
const vg = (o: Partial<VagaBase> & { id: string; equipeId: string }): VagaBase => ({ nome: "Fulano", status: "Vigente", cargo: "Auxiliar", empresa: "Consominas", atividade: "Resgate", ...o });
const semAus = indexar({ ausencias: [], alocacoes: [] });

test("Situação: quem está em equipe ativa está EM EQUIPE (e não 'livre'); reserva e equipe encerrada ficam DISPONÍVEL", () => {
  const ativa = eq({ id: "a" });
  const acabou = eq({ id: "b", fim: "2026-10-10" });
  const comecaDepois = eq({ id: "c", inicio: "2026-11-01" });
  const reserva = eq({ id: "r", grupo: "Apoio" });
  assert.equal(situacaoDaPosicao(vg({ id: "1", equipeId: "a" }), ativa, semAus, "2026-10-15").situacao, "EM_EQUIPE");
  // a equipe termina em 10/10: no dia 10 ainda é equipe, no 11 as pessoas ficam disponíveis
  assert.equal(situacaoDaPosicao(vg({ id: "2", equipeId: "b" }), acabou, semAus, "2026-10-10").situacao, "EM_EQUIPE");
  const depois = situacaoDaPosicao(vg({ id: "2", equipeId: "b" }), acabou, semAus, "2026-10-11");
  assert.equal(depois.situacao, "DISPONIVEL");
  assert.match(depois.motivo ?? "", /encerrada em 10\/10\/2026/);
  assert.equal(situacaoDaPosicao(vg({ id: "3", equipeId: "c" }), comecaDepois, semAus, "2026-10-15").situacao, "EM_EQUIPE"); // já reservada para a equipe que começa
  assert.equal(situacaoDaPosicao(vg({ id: "4", equipeId: "r" }), reserva, semAus, "2026-10-15").situacao, "DISPONIVEL");
  assert.equal(situacaoDaPosicao(vg({ id: "5", equipeId: "a" }), eq({ id: "a", status: "Inativa" }), semAus, "2026-10-15").situacao, "DISPONIVEL");
});

test("Situação: ausência, afastamento, outro contrato com data e posição sem pessoa", () => {
  const e = eq({ id: "a" });
  const aus = indexar({ ausencias: [{ vagaId: "1", tipo: "Férias", inicio: "2026-10-12", fim: "2026-10-20" }], alocacoes: [] });
  assert.equal(situacaoDaPosicao(vg({ id: "1", equipeId: "a" }), e, aus, "2026-10-15").situacao, "AUSENTE");
  assert.equal(situacaoDaPosicao(vg({ id: "1", equipeId: "a" }), e, aus, "2026-10-21").situacao, "EM_EQUIPE");
  assert.equal(situacaoDaPosicao(vg({ id: "2", equipeId: "a", status: "Afastado" }), e, semAus, "2026-10-15").situacao, "AUSENTE");
  assert.equal(situacaoDaPosicao(vg({ id: "3", equipeId: "a", status: "Desmobilizado" }), e, semAus, "2026-10-15").situacao, "DESMOBILIZADO");
  const reserva = eq({ id: "r", grupo: "Apoio" });
  const apoio = vg({ id: "4", equipeId: "r", contratoAtual: "4362 LT", disponivelAPartir: "2026-10-11" });
  assert.equal(situacaoDaPosicao(apoio, reserva, semAus, "2026-10-10").situacao, "OUTRO_CONTRATO");
  assert.equal(situacaoDaPosicao(apoio, reserva, semAus, "2026-10-11").situacao, "DISPONIVEL");
  assert.equal(situacaoDaPosicao(vg({ id: "5", equipeId: "a", nome: null }), e, semAus, "2026-10-15").situacao, "VAGA_ABERTA");
  assert.equal(situacaoDaPosicao(vg({ id: "6", equipeId: "a", nome: null, status: "Em contratação" }), e, semAus, "2026-10-15").motivo, "Em contratação");
  assert.equal(situacaoDaPosicao({ ...vg({ id: "7", equipeId: "a", nome: null }), semNome: true }, e, semAus, "2026-10-15").situacao, "SEM_NOME");
});

test("Resumo do dia: as contas fecham (colaboradores = em equipe + ausentes + disponíveis + outro contrato; posições = com nome + sem nome + abertas)", () => {
  const equipes = [eq({ id: "a" }), eq({ id: "b", fim: "2026-10-10" }), eq({ id: "r", grupo: "Apoio" }), eq({ id: "x", projeto: "3686 LAVRA" })];
  const vagas: VagaBase[] = [
    vg({ id: "1", equipeId: "a" }),
    vg({ id: "2", equipeId: "a", status: "Afastado" }),
    vg({ id: "3", equipeId: "a", nome: null }),
    { ...vg({ id: "4", equipeId: "a", nome: null }), semNome: true } as VagaBase,
    vg({ id: "5", equipeId: "b" }), // equipe encerrada: disponível
    vg({ id: "6", equipeId: "r" }), // reserva
    vg({ id: "7", equipeId: "r", contratoAtual: "4362 LT", disponivelAPartir: "2026-10-30" }),
    vg({ id: "8", equipeId: "x", status: "Desmobilizado" }),
    vg({ id: "9", equipeId: "x" }),
  ];
  const r = resumirDia({ equipes, vagas }, semAus, "2026-10-15");
  assert.equal(r.equipes, 3); // a, b e x; a reserva não é equipe
  assert.equal(r.contratos, 2);
  assert.equal(r.posicoes, r.comNome + r.semNome + r.abertas);
  assert.equal(r.posicoes, 6); // 1,2,3,4,5,9 (a reserva não ocupa posição; o desmobilizado não conta)
  assert.deepEqual([r.comNome, r.semNome, r.abertas], [4, 1, 1]);
  assert.equal(r.colaboradores, r.emEquipe + r.ausentes + r.disponiveis + r.outroContrato);
  assert.deepEqual([r.emEquipe, r.ausentes, r.disponiveis, r.outroContrato], [2, 1, 2, 1]); // 1 e 9 em equipe; 2 ausente; 5 e 6 disponíveis; 7 em outro contrato
  assert.equal(r.colaboradores, 6);
  // mesma conta por equipe
  const mapa = new Map(equipes.map((e) => [e.id, e]));
  const c = contar(vagas.filter((v) => v.equipeId === "a"), mapa, semAus, "2026-10-15");
  assert.deepEqual([c.posicoes, c.comNome, c.semNome, c.abertas, c.emEquipe, c.ausentes], [4, 2, 1, 1, 1, 1]);
  assert.equal(estadoDaEquipe(equipes[0], c, "2026-10-15"), "COM_VAGAS");
  assert.equal(estadoDaEquipe(equipes[1], contar(vagas.filter((v) => v.equipeId === "b"), mapa, semAus, "2026-10-15"), "2026-10-15"), "ENCERRADA");
});

// ---------------------------------------------------------------- semanas (quadro)

test("Semanas: cobertura da equipe por semana, com ausentes, vagas, equipe que termina e fora do período", () => {
  const e = eq({ id: "a", inicio: "2026-10-05", fim: "2026-10-25" });
  const vagas: VagaBase[] = [vg({ id: "1", equipeId: "a" }), vg({ id: "2", equipeId: "a", nome: "Beltrana" }), vg({ id: "3", equipeId: "a", nome: null, cargo: "Biólogo" })];
  const aus = indexarAusencias([{ vagaId: "2", tipo: "Férias", inicio: "2026-10-14", fim: "2026-10-16" }]);
  const s1 = detalheDaSemana(e, vagas, aus, "2026-10-12");
  assert.deepEqual([s1.total, s1.presentes, s1.ausentes.length, s1.abertas.length, s1.nivel, s1.ativa], [3, 1, 1, 1, "ambos", true]);
  assert.equal(s1.ausentes[0].tipo, "Férias");
  const s2 = detalheDaSemana(e, vagas, aus, "2026-10-19");
  assert.deepEqual([s2.presentes, s2.ausentes.length, s2.nivel], [2, 0, "vagas"]);
  assert.match(s2.nota ?? "", /termina em 25\/10\/2026/);
  const fora = detalheDaSemana(e, vagas, aus, "2026-11-02");
  assert.deepEqual([fora.ativa, fora.nivel], [false, "fora"]);
  const soma = somarSemanas([s1, fora], "2026-10-12");
  assert.deepEqual([soma.equipes, soma.total, soma.presentes], [1, 3, 1]); // a equipe encerrada não entra na conta
});

// ---------------------------------------------------------------- movimentar equipe

test("Movimentar equipe: a primeira vez guarda de onde ela vinha; depois fecha a passagem aberta no dia anterior e recusa sobreposição", () => {
  const equipe = { projeto: "3636 PNM", local: "Trecho 4", inicio: null as string | null, criadaEm: "2026-09-01" };
  const p1 = planejarMovimentoDeEquipe([], equipe, { inicio: "2026-10-20", fim: null });
  assert.ok(p1.ok);
  if (p1.ok) {
    assert.deepEqual(p1.criarAnterior, { inicio: "2026-09-01", fim: "2026-10-19", projeto: "3636 PNM", local: "Trecho 4" });
    assert.equal(p1.fecharAnterior, null);
  }
  // equipe criada depois da data pedida: o início aproximado nunca passa do fim
  const p0 = planejarMovimentoDeEquipe([], { ...equipe, criadaEm: "2026-11-30" }, { inicio: "2026-10-20", fim: null });
  assert.ok(p0.ok && p0.criarAnterior!.inicio <= p0.criarAnterior!.fim);
  const passagens = [{ id: "p", inicio: "2026-09-01", fim: null, projeto: "3636 PNM", local: null }];
  const p2 = planejarMovimentoDeEquipe(passagens, equipe, { inicio: "2026-10-20", fim: null });
  assert.ok(p2.ok && p2.fecharAnterior?.fim === "2026-10-19" && p2.criarAnterior === null);
  const fechada = [{ id: "p", inicio: "2026-09-01", fim: "2026-10-31", projeto: "3636 PNM", local: null }];
  assert.equal(planejarMovimentoDeEquipe(fechada, equipe, { inicio: "2026-10-10", fim: "2026-10-12" }).ok, false);
  assert.equal(planejarMovimentoDeEquipe(passagens, equipe, { inicio: "2026-10-20", fim: "2026-10-10" }).ok, false);
  assert.equal(contratoDaEquipeNoDia([{ inicio: "2026-10-20", fim: null, projeto: "3687 LT" }], "3636 PNM", "2026-10-19"), "3636 PNM");
  assert.equal(contratoDaEquipeNoDia([{ inicio: "2026-10-20", fim: null, projeto: "3687 LT" }], "3636 PNM", "2026-10-20"), "3687 LT");
});

// ---------------------------------------------------------------- a base: junção das abas, linha a linha

const CAB1 = ["ID", "PROJETO", "Gestor MRN", "GRUPO", "EQUIPE / PROJETO", "RESGATE / AFUGENTAMENTO", "EMPRESA", "CARG / FUNÇÃO", " PROFISSIONAIS", "STATUS"];
const ABA1 = [
  CAB1,
  // bloco A: a equipe de Lavra (as linhas 2 a 7 são da primeira aba)
  [1, "3686 LAVRA", "Ronaldo", "Fauna", "EQUIPE LAVRA 01", "Resgate", "Consominas", "Médico Veterinário Campo", "Lucas Teste", "Vigente"],
  [2, "3686 LAVRA", "Ronaldo", "Fauna", "", "Resgate", "Coopermoura/MRN", "Auxiliar de campo / Mateiro", "Elbson Teste", "Vigente"],
  [3, "3686 LAVRA", "Ronaldo", "Fauna", "", "Resgate", "Coopermoura/MRN", "Auxiliar de campo / Mateiro", "Keyweth Teste", "Vigente"],
  [4, "3686 LAVRA", "Ronaldo", "Fauna", "", "Afugentamento", "Consominas", "Biólogo para resgate Fauna", "Erica Teste", "Vigente"],
  [5, "3686 LAVRA", "Ronaldo", "Fauna", "", "Resgate", "Coopermoura/MRN", "Auxiliar de campo / Mateiro", "", "Vigente"],
  [6, "3686 LAVRA", "Ronaldo", "Fauna", "", "Resgate", "Consominas", "Biólogo para resgate de Abelhas", "Em Contratação", "Vigente"],
  [7, "3686 LAVRA", "Ronaldo", "Fauna", "", "Afugentamento", "Consominas", "Técnico de campo / Op. de motosserra", "Em Contratação", "Vigente"],
  // dois blocos da Flora com o mesmo nome de equipe: são duas equipes
  [8, "3648", "Jocenildo", "Flora", "EQUIPE FLORA", "Resgate", "Consominas", "Analista Ambiental de Flora", "", "Vigente"],
  [9, "3648", "Jocenildo", "Flora", "", "Resgate", "Coopermoura/MRN", "Auxiliar de campo / Mateiro", "", "Vigente"],
  [10, "3648", "Jocenildo", "Flora", "EQUIPE FLORA", "Resgate", "Consominas", "Analista Ambiental de Flora", "", "Vigente"],
];
const ABA2 = [
  ["ATIVIDADE", "EMPRESA", "EQUIPE", "NIVEL", "Cargo / Função", "NOME PROFISSIONAIS", "DIREÇÃO 4X4", "CARROS", "STATUS ATUAL"],
  ["RESGATE LAVRA", "Consominas", "Afugentamento", "Superior", "Médico Veterinário CETAS", "Lucas Teste", "Sim", "VL 01", "Ativo"],
  ["", "Coopermoura/MRN", "Afugentamento", "NA", "Auxiliar", "", "", "", ""],
  ["", "Coopermoura/MRN", "Afugentamento", "NA", "Auxiliar", "", "", "", ""],
  ["", "Coopermoura/MRN", "Afugentamento", "NA", "Auxiliar", "", "", "", ""],
  ["", "Consominas", "Resgate", "Superior", "Biólogo para resgate de Abelhas", "Vago", "Sim", "VL 02", ""],
];
const ABA3 = [
  ["CONTRATO", "FUNÇÃO", "PROFISSIONAL", "LIBERAÇÃO PELA SEGURANÇA", "MOBILIZADO", "LAVRA", "MIGRAR PARA", "DATA DE TRANASIÇÃO"],
  ["4362 LT", "CONSULTOR AMBIENTAL", "GABRIELA SOLTA", "Sim", "Sim", "", "FELINOS", "Acaba LT 10/10"],
];
const PLANILHA = () => xlsx({ "AFUG E RESG - SETEMBRO": ABA1, "DIVISÃO DE EQUIPES": ABA2, "EQUIPE DE LT PARA APOIO": ABA3 });

test("Junção das abas: nenhuma pessoa é contada duas vezes e cada linha das abas vira uma posição (ou fica listada)", () => {
  const r = lerPlanilhaEfetivos(PLANILHA(), { anoReferencia: 2026 });
  assert.equal(r.formato, "cruzado");
  const lavra = r.equipes.find((e) => e.nome === "RESGATE LAVRA")!;
  assert.equal(lavra.projeto, "3686 LAVRA");
  const doTime = r.vagas.filter((v) => v.equipeCodigo === lavra.codigo);
  // as 5 posições da divisão + a Erica, que só está na primeira aba (sem posição em branco da mesma função)
  assert.equal(doTime.length, 6);
  // Elbson e Keyweth ocupam posições em branco da divisão (mesma empresa e função, mesmo com a atividade diferente nas abas)
  assert.ok(doTime.some((v) => v.nome === "Elbson Teste" && v.origem?.startsWith("Aba 2")));
  assert.ok(doTime.some((v) => v.nome === "Keyweth Teste"));
  // a posição em branco que sobra é a pessoa sem nome da linha 5 da primeira aba (absorvida, não duplicada)
  assert.equal(doTime.filter((v) => !v.nome && v.semNome).length, 1);
  // a vaga em contratação da primeira aba casa com o "Vago" da divisão e leva o status
  const vago = doTime.find((v) => !v.nome && !v.semNome)!;
  assert.equal(vago.status, "Em contratação");
  assert.match(vago.origem ?? "", /Aba 2 · linha 6 \+ Aba 1 · ID 6/);
  // quem só existe numa das abas vai para conferir
  const erica = doTime.find((v) => v.nome === "Erica Teste")!;
  assert.match(erica.conferir ?? "", /Só na aba 1/);
  // a vaga em contratação da primeira aba sem equivalente (motosserra) não vira posição: fica na lista da conferência
  assert.equal(r.conferencia!.substituidas.length, 1);
  assert.match(r.conferencia!.substituidas[0].descricao, /motosserra/i);

  // dois blocos com o mesmo nome em 3648 = duas equipes
  const flora = r.equipes.filter((e) => e.projeto === "3648");
  assert.equal(flora.length, 2);
  assert.deepEqual(flora.map((e) => e.nome).sort(), ["EQUIPE FLORA", "EQUIPE FLORA (2)"]);

  // conservação: cada linha da aba 1 (2 a 11) e da aba 2 (2 a 6) aparece uma vez em alguma posição, ou na lista das substituídas
  const aba1 = new Map<string, number>();
  const aba2 = new Map<string, number>();
  for (const v of r.vagas) {
    const o = origensDe(v.origem ?? "");
    o.aba1.forEach((l) => aba1.set(l, (aba1.get(l) ?? 0) + 1));
    o.aba2.forEach((l) => aba2.set(l, (aba2.get(l) ?? 0) + 1));
  }
  for (const s of r.conferencia!.substituidas) aba1.set(/linha (\d+)/.exec(s.origem)![1], (aba1.get(/linha (\d+)/.exec(s.origem)![1]) ?? 0) + 1);
  assert.deepEqual([...aba1.keys()].map(Number).sort((a, b) => a - b), [2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  assert.ok([...aba1.values()].every((n) => n === 1), "linha da aba 1 usada mais de uma vez");
  assert.deepEqual([...aba2.keys()].map(Number).sort((a, b) => a - b), [2, 3, 4, 5, 6]);
  assert.ok([...aba2.values()].every((n) => n === 1), "linha da aba 2 usada mais de uma vez");
  assert.equal(r.conferencia!.linhasAba1, 10);
  assert.equal(r.conferencia!.linhasAba2, 5);
  // a aba de apoio fica na reserva, com a origem
  const apoio = r.vagas.find((v) => v.nome === "GABRIELA SOLTA")!;
  assert.equal(apoio.equipeCodigo, "APOIO");
  assert.equal(apoio.origem, "Aba 3 · linha 2");
});

function dadosDe(r: ReturnType<typeof lerPlanilhaEfetivos>): DadosBase {
  return {
    equipes: r.equipes.map((e) => ({ id: e.codigo, codigo: e.codigo, nome: e.nome, projeto: e.projeto, gestor: e.gestor, grupo: e.grupo, local: e.local ?? null, observacao: e.observacao ?? null, status: e.status, inicio: e.inicio ?? null, fim: e.fim ?? null })),
    vagas: r.vagas.map((v, i) => ({
      id: `v${i + 1}`,
      numero: v.numero,
      equipeId: v.equipeCodigo,
      nome: v.nome,
      status: v.status,
      cargo: v.cargo,
      empresa: v.empresa,
      atividade: v.atividade,
      nivel: v.nivel ?? null,
      direcao4x4: v.direcao4x4 ?? null,
      contratoAtual: v.contratoAtual ?? null,
      disponivelAPartir: v.disponivelAPartir ?? null,
      destino: v.destino ?? null,
      veiculoId: v.carroRef ?? null,
      contrato: v.contrato ?? null,
      grupo: v.grupo ?? null,
      semNome: !!v.semNome && !v.nome,
      observacao: v.observacao,
      origem: v.origem ?? null,
      conferir: v.conferir ?? null,
    })),
    veiculos: r.veiculos.map((v, i) => ({ id: v.ref, codigo: `VEI-${i + 1}`, identificacao: v.identificacao, placa: null, modelo: null, tracao4x4: null, status: "Em operação", observacao: null })),
    ausencias: [],
    contratos: r.contratos.map((c) => ({ codigo: c.codigo, nome: null, cliente: c.cliente, gestor: c.gestor, local: null, observacao: null, ativo: true })),
  };
}

test("Base em Excel: o que sai do sistema entra de volta igual (equipes, posições, viaturas, contratos e origem)", () => {
  const original = lerPlanilhaEfetivos(PLANILHA(), { anoReferencia: 2026 });
  const buf = montarPlanilhaBase(dadosDe(original), indexar({ ausencias: [], alocacoes: [] }), "2026-10-15", original.conferencia ?? null);
  const wb = XLSX.read(buf, { type: "buffer" });
  assert.deepEqual(wb.SheetNames, ["LEIA-ME", "PESSOAS", "EQUIPES", "VIATURAS"], "o mínimo de abas para concentrar o preenchimento");
  const volta = lerPlanilhaEfetivos(buf, { anoReferencia: 2026 });
  assert.equal(volta.formato, "base");
  assert.equal(volta.equipes.length, original.equipes.length);
  assert.equal(volta.vagas.length, original.vagas.length);
  assert.equal(volta.veiculos.length, original.veiculos.length);
  assert.deepEqual(volta.contratos.map((c) => [c.codigo, c.gestor]).sort(), original.contratos.map((c) => [c.codigo, c.gestor]).sort());
  const chave = (v: { equipeCodigo: string; cargo: string; empresa: string; atividade: string; nome: string | null; semNome?: boolean; status: string; origem?: string | null; conferir?: string | null }) =>
    [v.equipeCodigo, v.cargo, v.empresa, v.atividade, v.nome ?? "", v.semNome ? "S" : "-", v.status, v.origem ?? "", v.conferir ?? ""].join("|");
  assert.deepEqual(volta.vagas.map(chave).sort(), original.vagas.map(chave).sort());
  // a reserva mantém o código APOIO e o grupo
  assert.equal(volta.equipes.find((e) => e.codigo === "APOIO")?.grupo, "Apoio");
  // a aba PESSOAS tem uma linha por posição, sem a coluna de grupo (que não vem das planilhas)
  const pessoas = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets["PESSOAS"]);
  assert.equal(pessoas.length, original.vagas.length);
  assert.ok(!("Grupo" in pessoas[0]));
});

test("Base: linhas com situação de hoje, contagem por origem e a reserva sem contrato", () => {
  const original = lerPlanilhaEfetivos(PLANILHA(), { anoReferencia: 2026 });
  const linhas = linhasDaBase(dadosDe(original), indexar({ ausencias: [], alocacoes: [] }), "2026-10-15");
  assert.equal(linhas.length, original.vagas.length);
  const reserva = linhas.filter((l) => l.codigoEquipe === "APOIO");
  assert.equal(reserva.length, 1);
  assert.equal(reserva[0].contrato, "");
  assert.equal(reserva[0].situacao, "DISPONIVEL"); // a liberação do apoio era 10/10
  const abertas = linhas.filter((l) => l.posicao === "Vaga aberta");
  assert.ok(abertas.every((l) => l.situacao === "VAGA_ABERTA"));
  assert.deepEqual(origensDe("Aba 2 · linha 6 + Aba 1 · ID 6 (linha 7): Fulano"), { aba1: ["7"], aba2: ["6"], aba3: [] });
});
