import { test } from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { lerPlanilhaEfetivos } from "../src/lib/efetivos/importarPlanilha";
import { pontuarNomes, tokensDoNome } from "../src/lib/efetivos/cruzarAbas";
import { avaliarEquipe, bloqueiosNoPeriodo, estadoDaVaga, indexar, livresNoPeriodo, montarPainel, type EquipeBase, type VagaBase } from "../src/lib/efetivos/disponibilidade";

// Cruzamento da primeira aba (contrato -> equipe -> pessoa) com a aba DIVISÃO DE EQUIPES: sem arquivo do usuário.

function xlsx(abas: Record<string, unknown[][]>): Buffer {
  const wb = XLSX.utils.book_new();
  for (const [nome, linhas] of Object.entries(abas)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(linhas), nome);
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
const casa = (a: string, b: string) => pontuarNomes(tokensDoNome(a), tokensDoNome(b)) > 0;

test("Nomes: liga a mesma pessoa com grafia diferente e recusa quem só parece", () => {
  assert.ok(casa("Isabele Macedo", "Isabelle F. Macedo")); // letra a mais + sobrenome igual
  assert.ok(casa("Suelen Leticia", "Suellem Letícia")); // acento e dupla letra
  assert.ok(casa("Maysa Santos", "Maysa S. Rodrigues")); // inicial do sobrenome
  assert.ok(casa("Diego Madero", "Diego Madeira")); // sobrenome parecido
  assert.ok(casa("Luis Fernando", "Luiz Fernando")); // 1º nome curto, mas sobrenome exato
  assert.ok(casa("Valtino", "Valtino Meirelles")); // só o 1º nome de um lado (par fraco, quem chama confere)
  assert.ok(!casa("Lais Barbosa", "Lais De Nazaré")); // mesmo 1º nome, sobrenomes diferentes
  assert.ok(!casa("Jorge Menancio", "George Venâncio"));
  assert.ok(!casa("Thayane Duarte", "Tayane F. Cardoso"));
});

const CADASTRO = [
  ["ID", "PROJETO", "Gestor MRN", "GRUPO", "EQUIPE / PROJETO", "RESGATE / AFUGENTAMENTO", "EMPRESA", "CARG / FUNÇÃO", " PROFISSIONAIS", "STATUS"],
  [1, "3636 PNM", "Ronaldo", "Fauna", "EQUIPE 01 - FLANCO NORTE - PTR", "Resgate", "Consominas", "Médico Veterinário Campo", "Suellem Letícia", "Vigente"],
  [2, "3636 PNM", "Ronaldo", "Fauna", "", "Resgate", "Consominas", "Biólogo para resgate Fauna", "Tayane F. Cardoso", "Vigente"],
  [3, "3636 PNM", "Ronaldo", "Fauna", "", "Resgate", "Coopermoura/MRN", "Auxiliar de campo / Mateiro", "Nicivaldo De Jesus", "Vigente"],
  [4, "3636 PNM", "Ronaldo", "Fauna", "", "Afugentamento", "Consominas", "Biólogo para resgate Fauna", "Em Contratação", "Vigente"],
  [5, "3687 LT", "Ronaldo", "Fauna", "EQUIPE 01 LT", "Resgate", "Consominas", "Médico Veterinário Campo", "Luiz Fernando", "Vigente"],
  [6, "3687 LT", "Ronaldo", "Flora", "", "Resgate", "Consominas", "Analista Ambiental de Flora", "Ângela Reis", "Afastado INSS"],
  [7, "3648", "Jocenild", "Flora", "EQUIPE 01 - FLANCO SUL - TS", "Resgate", "Consominas", "Analista Ambiental de Flora", "", "Vigente"],
];
const DIVISAO = [
  ["ATIVIDADE", "EMPRESA", "EQUIPE", "NIVEL", "Cargo / Função", "NOME PROFISSIONAIS", "DIREÇÃO 4X4", "CARROS", "STATUS ATUAL"],
  ["FLANCO NORTE - EQUIPE 01", "Consominas", "Resgate", "Superior", "Médico Veterinário CETAS", "Suelen Leticia", "Sim", "VL 01", "Ativo"],
  ["", "Coopermoura/MRN", "Resgate", "NA", "Auxiliar", "", "", "", ""],
  ["", "Consominas", "Resgate", "Superior", "Biólogo de Fauna", "Tayane Cardoso", "Sim", "VL 02", ""],
  ["", "Consominas", "Afugentamento", "Superior", "Biólogo de Fauna", "Vago", "Sim", "", ""],
  ["", "Coopermoura/MRN", "Afugentamento", "NA", "Auxiliar", "Vago", "", "", ""],
];
const APOIO = [
  ["CONTRATO", "FUNÇÃO", "PROFISSIONAL", "LIBERAÇÃO PELA SEGURANÇA", "MOBILIZADO", "LAVRA", "MIGRAR PARA", "DATA DE TRANASIÇÃO"],
  ["4362 LT", "CONSULTOR AMBIENTAL", "EVA TESTE", "Sim", "Sim", "", "FELINOS", "Acaba LT 10/10"],
  ["4362 LT", "CONSULTOR AMBIENTAL", "TAYANE CARDOSO", "Sim", "Sim", "", "PMBA", "Acaba LT 10/10"],
];

test("Cadastro + divisão: hierarquia contrato -> equipe -> pessoa, cada pessoa uma vez, vaga aberta ≠ posição sem nome", () => {
  const r = lerPlanilhaEfetivos(xlsx({ "AFUG E RESG - SETEMBRO": CADASTRO, "DIVISÃO DE EQUIPES": DIVISAO, "EQUIPE DE LT PARA APOIO": APOIO }), { anoReferencia: 2026 });
  assert.equal(r.formato, "cruzado");
  // contratos: só os da primeira aba. O "4362 LT" da aba de apoio é o texto de onde a pessoa vem, não um contrato cadastrado
  assert.deepEqual(r.contratos.map((c) => [c.codigo, c.gestor]).sort(), [["3636 PNM", "Ronaldo"], ["3648", "Jocenild"], ["3687 LT", "Ronaldo"]]);

  // o contrato de Flora (3648) tem equipe: as posições sem nome da primeira aba viram a equipe, preenchidas sem nome informado
  const flora = r.equipes.find((e) => e.projeto === "3648")!;
  assert.equal(flora.nome, "EQUIPE 01 - FLANCO SUL - TS");
  assert.equal(flora.grupo, "Flora");
  const doFlora = r.vagas.filter((v) => v.equipeCodigo === flora.codigo);
  assert.equal(doFlora.length, 1);
  assert.deepEqual([doFlora[0].nome, doFlora[0].semNome, doFlora[0].status, doFlora[0].cargo], [null, true, "Vigente", "Analista Ambiental de Flora"]);

  // o contrato da equipe vem do nome da equipe na primeira aba ("FLANCO NORTE - EQUIPE 01" ~ "EQUIPE 01 - FLANCO NORTE - PTR")
  const eq = r.equipes.find((e) => e.nome === "FLANCO NORTE - EQUIPE 01")!;
  assert.equal(eq.projeto, "3636 PNM");
  assert.equal(eq.gestor, "Ronaldo");
  const doTime = r.vagas.filter((v) => v.equipeCodigo === eq.codigo);
  assert.equal(doTime.length, 5);
  // "Nicivaldo" só tinha nome no cadastro: entra na posição sem nome da mesma equipe (mesma empresa, função e atividade)
  assert.equal(doTime.filter((v) => v.nome).length, 3);
  assert.ok(doTime.some((v) => v.nome === "Nicivaldo De Jesus" && v.contrato === "3636 PNM"));
  assert.equal(doTime.filter((v) => !v.nome && v.semNome).length, 0);
  assert.equal(doTime.filter((v) => !v.nome && !v.semNome).length, 2); // "Vago" = vaga aberta

  // as pessoas ligadas ganham contrato e equipe do contrato; o nome fica como na equipe de campo (a mais recente)
  const suelen = doTime.find((v) => v.nome === "Suelen Leticia")!;
  assert.equal(suelen.contrato, "3636 PNM");
  assert.equal(suelen.equipeContrato, "EQUIPE 01 - FLANCO NORTE - PTR");

  // equipes que só existem no cadastro (o contrato LT) viram equipes de verdade, sob o contrato delas
  const lt = r.equipes.find((e) => e.nome === "EQUIPE 01 LT")!;
  assert.equal(lt.projeto, "3687 LT");
  const doLt = r.vagas.filter((v) => v.equipeCodigo === lt.codigo);
  assert.deepEqual(doLt.map((v) => v.nome).sort(), ["Luiz Fernando", "Ângela Reis"]);
  const angela = doLt.find((v) => v.nome === "Ângela Reis")!;
  assert.equal(angela.status, "Afastado"); // "Afastado INSS"
  assert.equal(angela.grupo, "Flora");
  // posição "Em Contratação" do cadastro não vira colaborador nem vaga extra (a divisão já traz as vagas abertas)
  assert.equal(r.vagas.filter((v) => /contrata/i.test(v.nome ?? "")).length, 0);

  // a mesma pessoa no apoio e na equipe de campo (TAYANE CARDOSO) não duplica: a posição dela ganha a data de liberação
  assert.equal(r.vagas.filter((v) => /tayane/i.test(v.nome ?? "")).length, 1);
  const tayane = doTime.find((v) => /tayane/i.test(v.nome ?? ""))!;
  assert.equal(tayane.contratoAtual, "4362 LT");
  assert.equal(tayane.disponivelAPartir, "2026-10-11");
  assert.equal(tayane.destino, "PMBA");
  // o apoio que não está em equipe nenhuma segue na reserva ("fora das equipes"), com a data
  const reserva = r.vagas.filter((v) => v.equipeCodigo === "APOIO");
  assert.deepEqual(reserva.map((v) => v.nome), ["EVA TESTE"]);
  assert.equal(reserva[0].disponivelAPartir, "2026-10-11");
  assert.equal(reserva[0].contrato ?? null, null); // sem contrato cadastrado: fica disponível
});

test("Contratos novos informados pelo João: 3686 (Felinos e Meliponário) e 3687 (Fauna Atropelada), diferentes de 3686 LAVRA e 3687 LT", () => {
  const div = [
    DIVISAO[0],
    ["EQUIPE DE FELINOS", "Consominas", "Resgate", "Superior", "Médico Veterinário", "Fulana Teste", "Sim", "VL 01", ""],
    ["", "Coopermoura/MRN", "Resgate", "NA", "Auxiliar", "", "", "", ""],
    ["FAUNA ATROPELADA", "Consominas", "Resgate", "Superior", "Biólogo de Fauna", "Ciclana Teste", "Sim", "VL 01", ""],
    ["MELIPONÁRIO", "Consominas", "Resgate", "Superior", "Biólogo de Fauna", "Beltrana Teste", "Sim", "VL 01", ""],
  ];
  const r = lerPlanilhaEfetivos(xlsx({ "AFUG E RESG - SETEMBRO": CADASTRO, "DIVISÃO DE EQUIPES": div }), { anoReferencia: 2026 });
  const contratoDe = (nome: string) => r.equipes.find((e) => e.nome === nome)?.projeto;
  assert.equal(contratoDe("EQUIPE DE FELINOS"), "3686");
  assert.equal(contratoDe("MELIPONÁRIO"), "3686");
  assert.equal(contratoDe("FAUNA ATROPELADA"), "3687");
  // são cadastrados como contratos novos, sem confundir com os da planilha
  const codigos = r.contratos.map((c) => c.codigo);
  assert.ok(codigos.includes("3686") && codigos.includes("3687"));
  assert.ok(codigos.includes("3687 LT") && !codigos.includes("3686 LAVRA")); // o 3686 LAVRA só existe se a planilha o traz (aqui não traz)
  // as posições da equipe herdam o contrato (também a que está sem nome)
  const felinos = r.equipes.find((e) => e.nome === "EQUIPE DE FELINOS")!;
  assert.ok(r.vagas.filter((v) => v.equipeCodigo === felinos.codigo).every((v) => v.contrato === "3686"));
});

test("Sem a primeira aba (ou oculta) continua valendo a divisão sozinha, sem contrato inventado", () => {
  const r = lerPlanilhaEfetivos(xlsx({ "DIVISÃO DE EQUIPES": DIVISAO }), { anoReferencia: 2026 });
  assert.equal(r.formato, "divisao");
  assert.ok(r.equipes.every((e) => e.projeto === "A definir"));
  assert.deepEqual(r.contratos, []);
});

const eqCampo: EquipeBase = { id: "e1", codigo: "EQ-01", nome: "Equipe", projeto: "A definir", gestor: null, grupo: "Fauna", status: "Ativa" };
const vg = (id: string, p: Partial<VagaBase>): VagaBase => ({ id, equipeId: "e1", nome: "Fulano", status: "Vigente", cargo: "Auxiliar", empresa: "X", atividade: "Resgate", ...p });

test("Motor: posição sem nome conta como preenchida (equipe completa), mas nunca como pessoa livre; vaga aberta continua aberta", () => {
  const idx = indexar({ ausencias: [], alocacoes: [] });
  const vagas = [vg("a", {}), vg("b", { nome: null, semNome: true }), vg("c", { nome: null })];
  assert.equal(estadoDaVaga(vagas[1], idx, "2026-11-01").situacao, "SEM_NOME");
  assert.equal(estadoDaVaga(vagas[2], idx, "2026-11-01").situacao, "VAGA_ABERTA");
  const l = avaliarEquipe(eqCampo, vagas, idx, "2026-11-01");
  assert.equal(l.preenchidas, 2);
  assert.equal(l.semNome, 1);
  assert.equal(l.situacaoRh, "COM VAGAS"); // ainda tem a vaga aberta
  assert.equal(avaliarEquipe(eqCampo, vagas.slice(0, 2), idx, "2026-11-01").situacaoRh, "COMPLETA");
  // quem escolhe gente para campanha só vê pessoas com nome
  const dados = { equipes: [eqCampo], vagas, ausencias: [], alocacoes: [] };
  assert.deepEqual(livresNoPeriodo(dados, "2026-11-01", "2026-11-10").livres.map((p) => p.id), ["a"]);
  const painel = montarPainel(dados, "2026-11-01");
  assert.deepEqual([painel.totais.pessoas.preenchidas, painel.totais.pessoas.semNome, painel.totais.pessoas.abertas], [1, 1, 1]);
});

test("Motor: ocupado em outro contrato SEM data de saída continua ocupado; com data, fica livre a partir dela", () => {
  const idx = indexar({ ausencias: [], alocacoes: [] });
  const semData = vg("lt", { contratoAtual: "3687 LT", disponivelAPartir: null });
  assert.equal(estadoDaVaga(semData, idx, "2027-06-01").situacao, "ALOCADA");
  assert.equal(estadoDaVaga(semData, idx, "2027-06-01").motivo, "Em 3687 LT");
  const b = bloqueiosNoPeriodo(semData, idx, "2026-11-01", "2026-11-30");
  assert.deepEqual(b.map((x) => [x.origem, x.tipo, x.inicio, x.fim]), [["outro_contrato", "Em 3687 LT", "2026-11-01", "2026-11-30"]]);
  const comData = vg("ap", { contratoAtual: "4362 LT", disponivelAPartir: "2026-10-11" });
  assert.equal(estadoDaVaga(comData, idx, "2026-10-10").situacao, "ALOCADA");
  assert.equal(estadoDaVaga(comData, idx, "2026-10-11").situacao, "LIVRE");
});
