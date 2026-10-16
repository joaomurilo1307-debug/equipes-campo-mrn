import { test } from "node:test";
import assert from "node:assert/strict";
import { indexar } from "../src/lib/efetivos/disponibilidade";
import { colunasDaEscala, duracaoTexto, equipeAtivaNoDia, faseDaEquipe, inicioDaSemana, janelaPadrao, posicaoNaJanela, somarMeses } from "../src/lib/efetivos/linhaDoTempo";
import { agruparTopo, calcularHistograma, SEM_FILTROS, type EntradaHistograma } from "../src/lib/efetivos/histograma";
import { conferirUso, conflitosDeUso, lerNotaDeTroca, planejarTroca, usoCobreDia } from "../src/lib/efetivos/usosVeiculo";
import { calcularFrotaPorMes, chegadaDaPrevista, situacaoDaViaturaNoDia, viaturasEmUsoNoDia } from "../src/lib/efetivos/frota";

// Regras puras (sem banco): linha do tempo, histograma e o tempo das viaturas nas equipes.

// ---------------------------------------------------------------- linha do tempo

test("Escalas: meses, trimestres e semanas cobrem a janela inteira, com as pontas levadas ao começo/fim da coluna", () => {
  const m = colunasDaEscala("mes", "2026-10-15", "2027-01-10");
  assert.deepEqual(m.map((c) => c.rotulo), ["out", "nov", "dez", "jan"]);
  assert.equal(m[0].inicio, "2026-10-01");
  assert.equal(m[0].fim, "2026-10-31");
  assert.equal(m[0].dias, 31);
  assert.equal(m[1].dias, 30);
  assert.deepEqual(m.map((c) => c.superior), ["2026", "2026", "2026", "2027"]);

  const t = colunasDaEscala("trimestre", "2026-10-15", "2027-02-01");
  assert.deepEqual(t.map((c) => [c.rotulo, c.inicio, c.fim]), [["T4", "2026-10-01", "2026-12-31"], ["T1", "2027-01-01", "2027-03-31"]]);

  const s = colunasDaEscala("semana", "2026-10-15", "2026-11-01");
  assert.equal(s[0].inicio, "2026-10-12", "a semana começa na segunda-feira");
  assert.equal(inicioDaSemana("2026-10-18"), "2026-10-12", "domingo ainda é da semana que começou na segunda");
  assert.ok(s.every((c) => c.dias === 7));
  assert.equal(s.at(-1)!.inicio <= "2026-11-01" && s.at(-1)!.fim >= "2026-11-01", true);

  assert.deepEqual(colunasDaEscala("mes", "2026-12-01", "2026-10-01"), []);
  assert.equal(somarMeses("2026-11", 3), "2027-02");
  assert.equal(somarMeses("2026-02", -3), "2025-11");
});

test("Janela padrão: um mês para trás e oito para frente, esticando para o que as equipes pedem, sem passar de 30 meses", () => {
  assert.deepEqual(janelaPadrao([], "2026-10-15"), { de: "2026-09-01", ate: "2027-06-30" });
  assert.deepEqual(janelaPadrao([{ inicio: "2026-03-10", fim: "2027-12-05" }], "2026-10-15"), { de: "2026-03-01", ate: "2027-12-31" });
  // equipe sem datas não estica nada
  assert.deepEqual(janelaPadrao([{ inicio: null, fim: null }], "2026-10-15"), { de: "2026-09-01", ate: "2027-06-30" });
  // uma data errada (ano 2099) não estica a tela para sempre
  const j = janelaPadrao([{ inicio: "2026-10-01", fim: "2099-01-01" }], "2026-10-15");
  assert.equal(j.de, "2026-09-01");
  assert.equal(j.ate, "2029-02-28"); // 30 meses a partir de set/2026
});

test("Barra: posição e largura na janela; lado sem data vai até a borda e marca aberto; fora da janela é detectado", () => {
  const janela = { de: "2026-10-01", ate: "2026-12-31" }; // 92 dias
  const b = posicaoNaJanela("2026-10-11", "2026-10-20", janela, 1);
  assert.deepEqual([b.esquerda, b.largura, b.abertoEsq, b.abertoDir, b.fora], [10, 10, false, false, false]);
  const aberta = posicaoNaJanela("2026-10-11", null, janela, 1);
  assert.equal(aberta.largura, 82);
  assert.equal(aberta.abertoDir, true);
  const semInicio = posicaoNaJanela(null, "2026-10-10", janela, 2);
  assert.deepEqual([semInicio.esquerda, semInicio.largura, semInicio.abertoEsq], [0, 20, true]);
  assert.equal(posicaoNaJanela("2027-01-01", "2027-02-01", janela, 1).fora, true);
  assert.equal(posicaoNaJanela("2026-01-01", "2026-09-30", janela, 1).fora, true);
  // começa antes da janela: corta na borda
  const cortada = posicaoNaJanela("2026-09-01", "2026-10-10", janela, 1);
  assert.deepEqual([cortada.esquerda, cortada.largura], [0, 10]);
});

test("Duração escrita na barra e fase da equipe", () => {
  assert.equal(duracaoTexto("2026-10-01", "2026-12-31"), "3 meses");
  assert.equal(duracaoTexto("2026-10-01", "2027-09-30"), "12 meses");
  assert.equal(duracaoTexto("2026-10-01", "2026-10-21"), "3 semanas");
  assert.equal(duracaoTexto("2026-10-01", "2026-10-10"), "10 dias");
  assert.equal(duracaoTexto("2026-10-01", "2026-10-01"), "1 dia");
  assert.equal(duracaoTexto(null, "2026-10-01"), "");
  assert.equal(faseDaEquipe({ inicio: null, fim: null }, "2026-10-15"), "sem_datas");
  assert.equal(faseDaEquipe({ inicio: "2026-11-01", fim: "2026-12-01" }, "2026-10-15"), "futura");
  assert.equal(faseDaEquipe({ inicio: "2026-10-01", fim: "2026-12-01" }, "2026-10-15"), "andamento");
  assert.equal(faseDaEquipe({ inicio: "2026-08-01", fim: "2026-09-01" }, "2026-10-15"), "encerrada");
  assert.equal(faseDaEquipe({ inicio: "2026-08-01", fim: null }, "2026-10-15"), "sem_fim");
  assert.equal(faseDaEquipe({ inicio: null, fim: "2026-12-01" }, "2026-10-15"), "sem_inicio");
  assert.equal(equipeAtivaNoDia({ inicio: "2026-10-16", fim: null }, "2026-10-15"), false);
  assert.equal(equipeAtivaNoDia({ inicio: null, fim: null }, "2030-01-01"), true);
});

// ---------------------------------------------------------------- viaturas: tempo na equipe, conferência, conflito, troca

test("Conferência: o período da viatura contra o da equipe", () => {
  const eq = { inicio: "2026-10-01", fim: "2026-12-31" };
  assert.deepEqual(conferirUso({ inicio: "2026-10-01", fim: "2026-12-31" }, eq), { nivel: "ok", texto: "Confere com a equipe" });
  assert.equal(conferirUso({ inicio: "2026-10-10", fim: "2026-11-30" }, eq).nivel, "ok", "dentro do período da equipe também confere");
  const antes = conferirUso({ inicio: "2026-09-01", fim: "2026-12-31" }, eq);
  assert.equal(antes.nivel, "atencao");
  assert.equal(antes.texto, "Começa antes da equipe (01/10/2026)");
  assert.equal(conferirUso({ inicio: "2026-10-01", fim: "2027-02-01" }, eq).texto, "Termina depois da equipe (31/12/2026)");
  assert.equal(conferirUso({ inicio: "2027-01-10", fim: null }, eq).nivel, "atencao");
  assert.deepEqual(conferirUso({ inicio: null, fim: null }, eq), { nivel: "sem_datas", texto: "Preencher as datas da viatura" });
  assert.deepEqual(conferirUso({ inicio: "2026-10-01", fim: null }, { inicio: null, fim: null }), { nivel: "sem_datas", texto: "Equipe sem datas" });
  assert.equal(conferirUso({ inicio: "2026-10-01", fim: null }, eq).texto, "Sem fim na viatura; a equipe termina em 31/12/2026");
  assert.equal(conferirUso({ inicio: null, fim: "2026-12-31" }, eq).texto, "Sem início na viatura; a equipe começa em 01/10/2026");
  assert.equal(usoCobreDia({ inicio: "2026-10-01", fim: "2026-10-31" }, "2026-10-31"), true);
  assert.equal(usoCobreDia({ inicio: "2026-10-01", fim: "2026-10-31" }, "2026-11-01"), false);
  assert.equal(usoCobreDia({ inicio: null, fim: null }, "2030-01-01"), true);
});

test("Conflito: a mesma viatura em duas equipes ao mesmo tempo (uso sem nenhuma data não conta)", () => {
  const u = (veiculoId: string, equipeId: string, inicio: string | null, fim: string | null) => ({ veiculoId, equipeId, inicio, fim });
  assert.equal(conflitosDeUso([u("v1", "E1", "2026-10-01", "2026-10-31"), u("v1", "E2", "2026-10-20", "2026-11-30")]).length, 1);
  assert.equal(conflitosDeUso([u("v1", "E1", "2026-10-01", "2026-10-31"), u("v1", "E2", "2026-11-01", "2026-11-30")]).length, 0, "uma sai num dia e a outra entra no seguinte");
  assert.equal(conflitosDeUso([u("v1", "E1", null, null), u("v1", "E2", null, null)]).length, 0);
  assert.equal(conflitosDeUso([u("v1", "E1", "2026-10-01", null), u("v1", "E2", "2026-12-01", "2026-12-31")]).length, 1, "sem fim cobre tudo para frente");
  assert.equal(conflitosDeUso([u("v1", "E1", "2026-10-01", "2026-10-31"), u("v2", "E2", "2026-10-20", "2026-11-30")]).length, 0);
});

test("Nota da planilha: a troca vira vínculo e o resto continua comentário", () => {
  assert.deepEqual(lerNotaDeTroca("Será substituida pela CNS-102"), { substituta: "CNS-102", comentario: null });
  assert.deepEqual(lerNotaDeTroca("Será substituída pela CNS 105. Aguardando entrega"), { substituta: "CNS-105", comentario: "Aguardando entrega" });
  assert.deepEqual(lerNotaDeTroca("Camionete Backup"), { substituta: null, comentario: "Camionete Backup" });
  assert.deepEqual(lerNotaDeTroca(""), { substituta: null, comentario: null });
  assert.deepEqual(lerNotaDeTroca(null), { substituta: null, comentario: null });
});

test("Trocar viatura: a antiga termina no dia anterior, a nova começa no dia e herda o fim; recusa data antes do início ou sem uso", () => {
  const usos = [
    { veiculoId: "v1", equipeId: "E1", inicio: "2026-10-01", fim: "2026-12-31" },
    { veiculoId: "v1", equipeId: "E2", inicio: null, fim: null },
    { veiculoId: "v1", equipeId: "E3", inicio: "2026-01-01", fim: "2026-02-28" }, // já terminou
  ];
  const p = planejarTroca(usos, "2026-11-15");
  assert.equal(p.ok, true);
  if (!p.ok) return;
  assert.deepEqual(p.antiga, [{ equipeId: "E1", fim: "2026-11-14" }, { equipeId: "E2", fim: "2026-11-14" }]);
  assert.deepEqual(p.nova, [{ equipeId: "E1", inicio: "2026-11-15", fim: "2026-12-31" }, { equipeId: "E2", inicio: "2026-11-15", fim: null }]);
  const so = planejarTroca(usos, "2026-11-15", ["E1"]);
  assert.equal(so.ok && so.nova.length, 1);
  const cedo = planejarTroca(usos, "2026-10-01", ["E1"]);
  assert.equal(cedo.ok, false);
  assert.match(!cedo.ok ? cedo.erro : "", /depois do início da viatura/);
  const nenhuma = planejarTroca(usos, "2026-11-15", ["E3"]);
  assert.equal(nenhuma.ok, false);
  assert.match(!nenhuma.ok ? nenhuma.erro : "", /não está em nenhuma equipe/);
});

// ---------------------------------------------------------------- histograma

const eq = (id: string, projeto: string, inicio: string | null, fim: string | null) => ({ id, codigo: id, nome: `Equipe ${id}`, projeto, grupo: "", status: "Ativa", inicio, fim });
const vaga = (id: string, equipeId: string, nome: string | null, extra: Record<string, unknown> = {}) => ({ id, equipeId, nome, status: nome ? "Vigente" : "Vago", cargo: "Biólogo", atividade: "Resgate", veiculoId: null, ...extra });

function entrada(extra: Partial<EntradaHistograma> = {}): EntradaHistograma {
  return {
    equipes: [eq("E1", "3686", "2026-10-16", "2026-11-15"), eq("E2", "3687", null, null)],
    vagas: [vaga("v1", "E1", "Ana"), vaga("v2", "E1", "Bia"), vaga("v3", "E1", null), vaga("v4", "E2", "Caio")] as any,
    idx: indexar({ ausencias: [], alocacoes: [] }),
    contratos: [{ codigo: "3686", cliente: "MRN" }, { codigo: "3687", cliente: "MRN" }],
    usos: [],
    ...extra,
  };
}
const cfg = { medida: "efetivo" as const, agrupar: "equipe" as const, de: "2026-10", ate: "2026-11", filtros: SEM_FILTROS };

test("Histograma: cada mês é a média dos dias; equipe que começa/termina no meio do mês entra pela fração", () => {
  const h = calcularHistograma(entrada(), cfg);
  assert.deepEqual(h.meses, ["2026-10", "2026-11"]);
  const e1 = h.grupos.find((g) => g.chave === "E1")!;
  // outubro: ativa de 16 a 31 (16 dias de 31) com 2 pessoas; novembro: 1 a 15 (15 de 30)
  assert.deepEqual(e1.valores, [1, 1]);
  const e2 = h.grupos.find((g) => g.chave === "E2")!;
  assert.deepEqual(e2.valores, [1, 1], "equipe sem datas conta como ativa o tempo todo");
  assert.deepEqual(h.totais, [2, 2]);
  assert.equal(h.equipesSemDatas, 1);
  assert.equal(h.equipesNoCalculo, 2);
});

test("Histograma: férias com período diminuem o efetivo só nos dias da ausência; vaga aberta aparece em Vagas a preencher", () => {
  const idx = indexar({ ausencias: [{ id: "a1", vagaId: "v1", tipo: "Férias", inicio: "2026-11-01", fim: "2026-11-15" }] as any, alocacoes: [] });
  const h = calcularHistograma(entrada({ idx }), cfg);
  const e1 = h.grupos.find((g) => g.chave === "E1")!;
  assert.deepEqual(e1.valores, [1, 0.5]); // novembro: Ana ausente nos 15 dias em que a equipe existe -> sobra a Bia (0,5)
  const aus = calcularHistograma(entrada({ idx }), { ...cfg, medida: "ausentes" });
  assert.deepEqual(aus.grupos.find((g) => g.chave === "E1")!.valores, [0, 0.5]);
  const abertas = calcularHistograma(entrada(), { ...cfg, medida: "abertas" });
  assert.deepEqual(abertas.grupos.map((g) => g.chave), ["E1"], "só a equipe com vaga aberta");
  assert.deepEqual(abertas.grupos[0].valores, [0.5, 0.5]);
  const pos = calcularHistograma(entrada(), { ...cfg, medida: "posicoes" });
  assert.deepEqual(pos.grupos.find((g) => g.chave === "E1")!.valores, [1.5, 1.5]);
  assert.deepEqual(h.composicao[0], { emEquipe: 2 * 0.5 + 1, ausentes: 0, abertas: 0.5, semNome: 0 });
});

test("Histograma: filtros (contrato, equipe, cargo, sem datas) e agrupamentos", () => {
  const so3686 = calcularHistograma(entrada(), { ...cfg, filtros: { ...SEM_FILTROS, contratos: ["3686"] } });
  assert.deepEqual(so3686.grupos.map((g) => g.chave), ["E1"]);
  const semData = calcularHistograma(entrada(), { ...cfg, filtros: { ...SEM_FILTROS, semDatas: false } });
  assert.deepEqual(semData.grupos.map((g) => g.chave), ["E1"]);
  assert.equal(semData.equipesSemDatas, 0);
  const porContrato = calcularHistograma(entrada(), { ...cfg, agrupar: "contrato" });
  assert.deepEqual(porContrato.grupos.map((g) => g.chave).sort(), ["3686", "3687"]);
  const porCliente = calcularHistograma(entrada(), { ...cfg, agrupar: "cliente" });
  assert.deepEqual(porCliente.grupos.map((g) => [g.chave, g.valores]), [["MRN", [2, 2]]]);
  const porCargo = calcularHistograma(entrada(), { ...cfg, agrupar: "cargo" });
  assert.deepEqual(porCargo.grupos.map((g) => g.chave), ["Resgate"]);
  const cargoQueNaoExiste = calcularHistograma(entrada(), { ...cfg, filtros: { ...SEM_FILTROS, cargos: ["Topógrafo"] } });
  assert.equal(cargoQueNaoExiste.grupos.length, 0);
  // viatura não agrupa por cargo: cai em equipe
  const viat = calcularHistograma(entrada(), { ...cfg, medida: "viaturas", agrupar: "cargo" });
  assert.ok(viat.grupos.every((g) => /^E\d$/.test(g.chave)) || viat.grupos.length === 0);
});

test("Histograma: viaturas pelo período de cada uma na equipe; equipes ativas contam a fração do mês", () => {
  const usos = [
    { veiculoId: "A", equipeId: "E1", inicio: "2026-10-16", fim: "2026-10-31" },
    { veiculoId: "B", equipeId: "E2", inicio: null, fim: null },
  ];
  const vagas = [vaga("v1", "E1", "Ana", { veiculoId: "C" }), vaga("v2", "E1", "Bia", { veiculoId: "A" }), vaga("v4", "E2", "Caio")] as any;
  const h = calcularHistograma(entrada({ usos, vagas }), { ...cfg, medida: "viaturas" });
  // E1: A (16 dias de 31, 0,52) + C (só pela pessoa, sem uso: vale enquanto a equipe existe, 16 dias) em outubro; C em novembro (15 de 30)
  assert.deepEqual(h.grupos.find((g) => g.chave === "E1")!.valores, [1, 0.5]);
  assert.deepEqual(h.grupos.find((g) => g.chave === "E2")!.valores, [1, 1]);
  const eqs = calcularHistograma(entrada(), { ...cfg, medida: "equipes" });
  assert.deepEqual(eqs.grupos.find((g) => g.chave === "E1")!.valores, [0.5, 0.5]);
  assert.deepEqual(eqs.grupos.find((g) => g.chave === "E2")!.valores, [1, 1]);
});

test("Histograma: a mesma viatura em duas equipes conta uma vez no total (cada equipe mostra a sua)", () => {
  const equipes = [eq("E1", "3686", null, null), eq("E2", "3687", null, null)];
  const usos = [
    { veiculoId: "B", equipeId: "E1", inicio: null, fim: null },
    { veiculoId: "B", equipeId: "E2", inicio: null, fim: null },
    { veiculoId: "C", equipeId: "E2", inicio: null, fim: null },
  ];
  const h = calcularHistograma(entrada({ equipes, vagas: [], usos }), { ...cfg, medida: "viaturas" });
  assert.deepEqual(h.grupos.find((g) => g.chave === "E1")!.valores, [1, 1]);
  assert.deepEqual(h.grupos.find((g) => g.chave === "E2")!.valores, [2, 2]);
  assert.deepEqual(h.totais, [2, 2], "B e C: duas viaturas, não três");
});

test("Histograma: pessoas livres = reserva + quem terminou a equipe, mês a mês, respeitando os filtros", () => {
  const equipes = [eq("E1", "3686", "2026-09-01", "2026-10-31"), eq("E2", "3687", null, null), { ...eq("R", "A definir", null, null), grupo: "Apoio" }];
  const vagas = [vaga("a", "E1", "Ana"), vaga("b", "E1", "Bia"), vaga("c", "E2", "Caio"), vaga("d", "R", "Rui"), vaga("e", "E1", null)] as any;
  const h = calcularHistograma(entrada({ equipes, vagas }), cfg);
  // outubro: a equipe E1 ainda existe até o dia 31 -> só o Rui (reserva); novembro: Ana e Bia ficam livres (+ Rui)
  assert.deepEqual(h.livres, [1, 3]);
  // vaga aberta não é pessoa livre; com filtro de outro contrato, quem terminou em E1 não entra, mas a reserva sempre entra
  const soE2 = calcularHistograma(entrada({ equipes, vagas }), { ...cfg, filtros: { ...SEM_FILTROS, contratos: ["3687"] } });
  assert.deepEqual(soE2.livres, [1, 1]);
  // equipe que termina no meio do mês: as pessoas ficam livres só pela fração (E1 acaba no dia 15 de novembro: 15 de 30 dias)
  const meio = calcularHistograma(entrada(), cfg);
  assert.deepEqual(meio.livres, [0, 1]);
});

test("Histograma: Outros soma o resto dos grupos e os totais continuam fechando", () => {
  const equipes = ["E1", "E2", "E3", "E4"].map((id) => eq(id, "3686", null, null));
  const vagas = [vaga("a", "E1", "A"), vaga("b", "E1", "B"), vaga("c", "E2", "C"), vaga("d", "E3", "D"), vaga("e", "E4", "E")] as any;
  const h = calcularHistograma(entrada({ equipes, vagas }), cfg);
  const topo = agruparTopo(h, 2);
  assert.equal(topo.length, 3);
  assert.equal(topo[2].rotulo, "Outros (2)");
  for (let i = 0; i < h.meses.length; i++) assert.equal(Math.round(topo.reduce((s, g) => s + g.valores[i], 0) * 10) / 10, h.totais[i]);
  assert.equal(agruparTopo(h, 10), h.grupos);
});

// ---------------------------------------------------------------- frota: em uso, livres, indisponíveis, previstas

test("Frota: situação da viatura no dia (em uso, livre, indisponível, prevista que chega na data da troca, devolvida)", () => {
  const prev = { id: "N", status: "Prevista" };
  const velha = { id: "V", status: "Em operação", substituidoPorId: "N", trocaEm: "2026-12-15" };
  assert.equal(chegadaDaPrevista(prev, [prev, velha]), "2026-12-15");
  assert.equal(chegadaDaPrevista(prev, [prev]), null);
  assert.equal(situacaoDaViaturaNoDia(prev, false, "2026-12-15", "2026-12-14"), "prevista");
  assert.equal(situacaoDaViaturaNoDia(prev, false, "2026-12-15", "2026-12-15"), "livre", "a prevista vira viatura do dia da troca");
  assert.equal(situacaoDaViaturaNoDia(prev, true, "2026-12-15", "2027-01-01"), "em_uso");
  assert.equal(situacaoDaViaturaNoDia(prev, false, null, "2030-01-01"), "prevista", "sem data de chegada nunca chegou");
  assert.equal(situacaoDaViaturaNoDia({ id: "M", status: "Em manutenção" }, true, null, "2026-10-01"), "indisponivel");
  assert.equal(situacaoDaViaturaNoDia({ id: "D", status: "Devolvido" }, true, null, "2026-10-01"), "devolvida");
  assert.equal(situacaoDaViaturaNoDia({ id: "L", status: "Disponível" }, false, null, "2026-10-01"), "livre");
});

test("Frota: viatura em uso só enquanto a equipe e o período dela valem; depois fica livre", () => {
  const equipes = [eq("E1", "3686", "2026-10-01", "2026-10-31"), eq("E2", "3687", null, null)];
  const usos = [
    { veiculoId: "A", equipeId: "E1", inicio: "2026-10-01", fim: "2026-10-31" },
    { veiculoId: "B", equipeId: "E2", inicio: null, fim: null },
  ];
  const vagas = [{ equipeId: "E1", veiculoId: "C" }]; // C só pela pessoa
  const e = { equipes, vagas, usos };
  assert.deepEqual([...viaturasEmUsoNoDia(e, "2026-10-15")].sort(), ["A", "B", "C"]);
  assert.deepEqual([...viaturasEmUsoNoDia(e, "2026-11-01")].sort(), ["B"], "a equipe E1 terminou");
  assert.deepEqual([...viaturasEmUsoNoDia(e, "2026-10-15", (id) => id === "E2")], ["B"]);

  const veiculos = [{ id: "A", status: "Em operação" }, { id: "B", status: "Em operação" }, { id: "C", status: "Disponível" }, { id: "M", status: "Em manutenção" }, { id: "D", status: "Devolvido" }, { id: "N", status: "Prevista" }];
  const f = calcularFrotaPorMes({ ...e, veiculos }, "2026-10", "2026-11");
  // outubro: A, B, C em uso; M indisponível; N prevista; D devolvida não conta
  assert.deepEqual([f.emUso[0], f.livres[0], f.indisponiveis[0], f.previstas[0], f.frota[0]], [3, 0, 1, 1, 5]);
  // novembro: só B em uso; A e C ficam livres
  assert.deepEqual([f.emUso[1], f.livres[1], f.indisponiveis[1], f.previstas[1], f.frota[1]], [1, 2, 1, 1, 5]);
});
