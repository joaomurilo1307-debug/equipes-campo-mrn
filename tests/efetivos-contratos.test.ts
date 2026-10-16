import { test } from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { lerPlanilhaEfetivos, veiculosUnicos } from "../src/lib/efetivos/importarPlanilha";
import { combinarResultados, lerPlanilhasEfetivos } from "../src/lib/efetivos/combinarPlanilhas";
import { montarPlanilhaBase, origensPorFonte, type DadosBase } from "../src/lib/efetivos/base";
import { indexar } from "../src/lib/efetivos/disponibilidade";
import { planejarAtualizacao, totalDeMudancas, type Atuais } from "../src/lib/efetivos/planejamento";

function xlsx(abas: Record<string, unknown[][]>, ocultas: string[] = [], mesclas: Record<string, string[]> = {}): Buffer {
  const wb = XLSX.utils.book_new();
  for (const [nome, linhas] of Object.entries(abas)) {
    const ws = XLSX.utils.aoa_to_sheet(linhas);
    if (mesclas[nome]) ws["!merges"] = mesclas[nome].map((r) => XLSX.utils.decode_range(r));
    XLSX.utils.book_append_sheet(wb, ws, nome);
  }
  wb.Workbook = { Sheets: Object.keys(abas).map((name) => ({ name, Hidden: ocultas.includes(name) ? 1 : 0 })) };
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

const APOIO = (extra: unknown[][] = []) => [
  ["CONTRATO", "FUNÇÃO", "PROFISSIONAL", "LIBERAÇÃO PELA SEGURANÇA", "MOBILIZADO", "LAVRA", "MIGRAR PARA", "DATA DE TRANASIÇÃO"],
  ["4362 LT", "CONSULTOR AMBIENTAL", "LEANDRO MOURÃO BRANCO", "Sim", "Sim", "Treinamento dia 29/09", "FAUNA ATROPELADA", "Acaba LT 10/10"],
  ["4362 LT", "CONSULTOR AMBIENTAL", "BIANCA CALIXTO", "Sim", "Sim", "Treinamento dia 29/09", "FELINOS", "Acaba LT 10/10"],
  ["4362 LT", "CONSULTOR AMBIENTAL", "CLAUDIO DIAS DE SOUZA", "Sim", "Sim", "Treinamento dia 29/09", "PMRE", "Acaba LT 10/10"],
  ...extra,
];

// Planilha do contrato 3686: STATUS ATUAL é o status da pessoa (não há STATUS DE ATIVIDADE); CARROS mesclado + IDEM
const CAB_3686 = ["ATIVIDADE", "CONTRATO", "EMPRESA", "EQUIPE", "NIVEL", "Cargo / Função", "NOME PROFISSIONAIS", "DIREÇÃO 4X4", "CARROS", "STATUS ATUAL"];
const P3686 = (apoioVisivel = true) =>
  xlsx(
    {
      "3686_PNM": [
        CAB_3686,
        ["FLANCO NORTE - EQUIPE 01", "3686 PNM", "Consominas", "Resgate", "Superior", "Médico Veterinário CETAS", "Isabele Macedo", "Sim", "VL 01", "Ativo"],
        ["", "3686 PNM", "Coopermoura/MRN", "Resgate", "NA", "Auxiliar", "", "", "", ""],
        ["", "3686 PNM", "Consominas", "Afugentamento", "Superior", "Biólogo de Fauna", "Vago", "Sim", "VL 02", ""],
        ["", "3686 PNM", "Consominas", "Afugentamento", "Superior", "Médico Veterinário CETAS", "Luis Fernando (em mobilização)", "Sim", "", ""],
        ["FAUNA ATROPELADA", "3687", "Consominas", "Fauna atropelada", "Superior", "Biólogo de Fauna", "Lais Barbosa", "Sim", "VL 02", ""],
        ["", "3687", "Consominas", "Fauna atropelada", "Superior", "Biólogo de Fauna", "Vago", "Sim", "IDEM", ""],
        ["EQUIPE DE FELINOS", "3686", "Consominas", "Afugentamento", "Superior", "Biólogo de Fauna", "Matheus Vander / Bianca Calixto", "Sim", "VL 02", "Férias"],
      ],
      "EQUIPE DE LT PARA APOIO": APOIO(),
    },
    apoioVisivel ? [] : ["EQUIPE DE LT PARA APOIO"]
  );

// Planilha do contrato 3687 LT: STATUS DE ATIVIDADE é a pessoa e STATUS ATUAL é o recado da viatura
const CAB_LT = ["ATIVIDADE", "CONTRATO", "EMPRESA", "EQUIPE", "NIVEL", "Cargo / Função", "NOME PROFISSIONAIS", "STATUS DE ATIVIDADE", "DIREÇÃO 4X4", "CARROS", "STATUS ATUAL"];
const PLT = (apoioVisivel = true) =>
  xlsx(
    {
      "3687 LT": [
        CAB_LT,
        ["GESTÃO", "3687 LT", "Consominas", "Gestor do Contrato", "Superior", "Gestor do Contrato", "Samuel Garcia", "Vigente", "Sim", "CNS-52", "Será substituida pela CNS-102"],
        ["", "3687 LT", "Consominas", "Coordenador", "Superior", "Coordenador", "Daniel Lira", "Vigente", "Não", "", ""],
        ["EQUIPE 01 - FAUNA E FLORA LT", "3687 LT", "Consominas", "Afugentamento e Resgate de Fauna", "Superior", "Medico Veterinário", "Luiz Fernando", "Vigente", "Sim", "CNS-101", ""],
        ["", "3687 LT", "Consominas", "Resgate de Flora", "Superior", "Analista Ambiental de Flora", "Ana Flavia", "Vigente", "Não", "", ""],
        ["", "3687 LT", "Consominas", "Resgate de Flora", "Superior", "Auxiliar fauna", "Jonas", "Vigente", "Não", "", ""],
        ["", "3687 LT", "Consominas", "Afugentamento e Resgate de Fauna", "", "Auxiliar fauna", "Magson Lopes", "Delisgar", "Não", "", ""],
        ["", "3687 LT", "Consominas", "Resgate de Flora", "Superior", "Analista Ambiental de Flora", "Vago", "", "", "CNS-83", "Camionete Backup"],
        ["EQUIPE 05 - EMERGENCIAL", "3687 LT", "Consominas", "Afugentamento e Resgate de Fauna", "Superior", "Biólogo de Fauna", "Leandro Mourão", "Em contratação", "Sim", "CNS-107", ""],
        ["", "3687 LT", "Cooperativa", "", "NA", "Auxiliar de campo", "", "", "", "", ""],
      ],
      "EQUIPE DE LT PARA APOIO": APOIO(),
    },
    apoioVisivel ? [] : ["EQUIPE DE LT PARA APOIO"]
  );

// ---------------------------------------------------------------- uma planilha por contrato

test("Planilha por contrato (3686): contrato da coluna CONTRATO, 'IDEM' repete a viatura, anotação ao lado do nome, dois nomes na célula", () => {
  const r = lerPlanilhaEfetivos(P3686(), { anoReferencia: 2026 });
  assert.equal(r.formato, "contratos");
  const campo = r.equipes.filter((e) => e.codigo !== "APOIO");
  assert.deepEqual(campo.map((e) => [e.nome, e.projeto]), [["FLANCO NORTE - EQUIPE 01", "3686 PNM"], ["FAUNA ATROPELADA", "3687"], ["EQUIPE DE FELINOS", "3686"]]);
  assert.deepEqual(r.contratos.map((c) => c.codigo).sort(), ["3686", "3686 PNM", "3687"]);
  // o contrato "3687" (Fauna atropelada) não é o "3687 LT": são contratos diferentes
  assert.ok(!r.contratos.some((c) => c.codigo === "3687 LT"));

  const fauna = r.vagas.filter((v) => v.equipeCodigo === campo[1].codigo);
  assert.equal(fauna.length, 2);
  assert.equal(r.veiculos.filter((v) => v.equipeCodigo === campo[1].codigo).length, 1, "IDEM não cria outra viatura");
  assert.equal(fauna[0].carroRef, fauna[1].carroRef);

  const norte = r.vagas.filter((v) => v.equipeCodigo === campo[0].codigo);
  assert.equal(norte[1].semNome, true); // célula em branco: preenchida, nome não informado
  assert.equal(norte[2].nome, null);
  assert.equal(norte[2].semNome, false); // "Vago" = vaga aberta
  const mobil = norte[3];
  assert.equal(mobil.nome, "Luis Fernando");
  // o status é o que a planilha escreve ao lado do nome: "em mobilização"; nada vira "Em contratação" por dedução
  assert.equal(mobil.status, "Em mobilização");
  assert.equal(mobil.observacao, null);

  const dupla = r.vagas.find((v) => v.nome?.includes("/"))!;
  assert.match(dupla.conferir ?? "", /Dois nomes na mesma célula/);
  assert.match(dupla.conferir ?? "", /Férias/); // férias sem período: o status fica "Férias" e o período fica para preencher
  assert.equal(dupla.status, "Férias");
  // a planilha não traz grupo: nenhuma equipe ganha "Fauna"/"Flora" por dedução
  assert.ok(campo.every((e) => e.grupo === ""));
  assert.match(dupla.origem ?? "", /^3686_PNM · linha 8$/);
});

test("Planilha por contrato (3687 LT): STATUS DE ATIVIDADE é a pessoa, STATUS ATUAL é a viatura, equipe de gestão e equipe mista", () => {
  const r = lerPlanilhaEfetivos(PLT(), { anoReferencia: 2026 });
  assert.equal(r.formato, "contratos");
  const porNome = new Map(r.equipes.map((e) => [e.nome, e]));
  assert.ok([...porNome.values()].filter((e) => e.codigo !== "APOIO").every((e) => e.grupo === ""), "a planilha não traz grupo");
  const cns52 = r.veiculos.find((v) => v.identificacao === "CNS-52")!;
  assert.equal(cns52.observacao, "Será substituida pela CNS-102");
  assert.equal(r.veiculos.find((v) => v.identificacao === "CNS-83")?.observacao, "Camionete Backup");
  // status "Delisgar" não é reconhecido: guardado como está escrito (conta como ausente) e marcado
  const magson = r.vagas.find((v) => v.nome === "Magson Lopes")!;
  assert.equal(magson.status, "Delisgar");
  assert.match(magson.conferir ?? "", /Delisgar/);
  // atividade x cargo que não combinam (fauna x flora) ficam marcados
  assert.match(r.vagas.find((v) => v.nome === "Jonas")!.conferir ?? "", /não combinam/);
  assert.equal(r.vagas.find((v) => v.nome === "Ana Flavia")!.conferir, null);
  // atividade em branco fica em branco: nada de "Resgate" nem "A informar" inventado
  assert.equal(r.vagas.find((v) => v.empresa === "Cooperativa")!.atividade, "");
  assert.equal(r.vagas.find((v) => v.nome === "Leandro Mourão")!.status, "Em contratação");
});

// ---------------------------------------------------------------- juntar as planilhas

test("Juntar as duas planilhas: cada linha de origem aparece uma vez, o apoio repetido vale uma vez e quem está no apoio e numa equipe é uma pessoa só", () => {
  const r = lerPlanilhasEfetivos([P3686(), PLT()], { anoReferencia: 2026 });
  assert.equal(r.formato, "contratos");
  const campo = r.equipes.filter((e) => e.codigo !== "APOIO");
  assert.deepEqual(campo.map((e) => e.codigo), ["EQ-01", "EQ-02", "EQ-03", "EQ-04", "EQ-05", "EQ-06"]);
  assert.equal(r.equipes.filter((e) => e.codigo === "APOIO").length, 1);
  assert.deepEqual(r.contratos.map((c) => c.codigo).sort(), ["3686", "3686 PNM", "3687", "3687 LT"]);

  // linhas: 6 + 3 (apoio) da primeira e 9 + 3 da segunda = 21 lidas. O apoio repetido (3) vale uma vez; Leandro e Bianca já estão em equipes
  const fontes = r.conferencia!.fontes!;
  assert.deepEqual(fontes.map((f) => f.linhas), [7, 3, 9, 3]);
  assert.equal(r.vagas.length, 7 + 9 + 1, "16 posições de equipes + só o Claudio na reserva");
  const reserva = r.vagas.filter((v) => v.equipeCodigo === "APOIO");
  assert.deepEqual(reserva.map((v) => v.nome), ["CLAUDIO DIAS DE SOUZA"]);
  assert.equal(reserva[0].disponivelAPartir, "2026-10-11");
  assert.equal(reserva[0].destino, "PMRE");

  // conservação: cada linha lida aparece em exatamente uma posição
  const contagem = new Map<string, number>();
  for (const v of r.vagas) for (const { fonte, linha } of origensPorFonte(v.origem ?? "")) contagem.set(`${fonte}|${linha}`, (contagem.get(`${fonte}|${linha}`) ?? 0) + 1);
  assert.equal(contagem.size, 7 + 3 + 9 + 3);
  assert.ok([...contagem.values()].every((n) => n === 1), "linha usada em mais de uma posição");

  // Leandro: uma pessoa só (na equipe emergencial), com a nota do apoio e o destino divergente para conferir
  const leandro = r.vagas.filter((v) => /leandro/i.test(v.nome ?? ""));
  assert.equal(leandro.length, 1);
  assert.match(leandro[0].observacao ?? "", /Aba de apoio .*contrato 4362 LT/);
  assert.match(leandro[0].conferir ?? "", /FAUNA ATROPELADA/);
  // Bianca: o destino FELINOS bate com a equipe, então não gera aviso de destino
  const dupla = r.vagas.find((v) => v.nome?.includes("Bianca"))!;
  assert.match(dupla.observacao ?? "", /destino indicado: FELINOS/);
  assert.doesNotMatch(dupla.conferir ?? "", /manda BIANCA/);
  assert.equal(r.vagas.filter((v) => /bianca/i.test(v.nome ?? "")).length, 1);
});

test("Juntar: nome parecido em outra equipe/contrato não é juntado, só marcado nos dois lados", () => {
  const r = lerPlanilhasEfetivos([P3686(), PLT()], { anoReferencia: 2026 });
  const luis = r.vagas.find((v) => v.nome === "Luis Fernando")!;
  const luiz = r.vagas.find((v) => v.nome === "Luiz Fernando")!;
  assert.notEqual(luis.equipeCodigo, luiz.equipeCodigo);
  assert.match(luis.conferir ?? "", /Luiz Fernando/);
  assert.match(luiz.conferir ?? "", /Luis Fernando/);
});

test("Juntar: viaturas e equipes mantêm a ligação depois de renumerar", () => {
  const r = lerPlanilhasEfetivos([P3686(), PLT()], { anoReferencia: 2026 });
  const refs = new Set(r.veiculos.map((v) => v.ref));
  assert.equal(refs.size, r.veiculos.length, "ref de viatura repetida");
  for (const v of r.vagas) if (v.carroRef) assert.ok(refs.has(v.carroRef), `viatura ${v.carroRef} não existe`);
  const cns107 = r.veiculos.find((v) => v.identificacao === "CNS-107")!;
  const emergencial = r.equipes.find((e) => e.nome === "EQUIPE 05 - EMERGENCIAL")!;
  assert.equal(cns107.equipeCodigo, emergencial.codigo);
});

test("Juntar: aba de apoio repetida mas com dados diferentes mantém a primeira e avisa", () => {
  const diferente = xlsx(
    {
      "3687 LT": [CAB_LT, ["GESTÃO", "3687 LT", "Consominas", "Gestor do Contrato", "Superior", "Gestor do Contrato", "Samuel Garcia", "Vigente", "Sim", "CNS-52", ""]],
      "EQUIPE DE LT PARA APOIO": [
        ["CONTRATO", "FUNÇÃO", "PROFISSIONAL", "MIGRAR PARA", "DATA DE TRANASIÇÃO"],
        ["4362 LT", "CONSULTOR AMBIENTAL", "CLAUDIO DIAS DE SOUZA", "PMBA", "Acaba LT 20/10"],
      ],
    },
    []
  );
  const r = lerPlanilhasEfetivos([P3686(), diferente], { anoReferencia: 2026 });
  const claudio = r.vagas.filter((v) => /claudio/i.test(v.nome ?? ""));
  assert.equal(claudio.length, 1);
  assert.equal(claudio[0].destino, "PMRE", "vale a primeira planilha");
  assert.match(claudio[0].conferir ?? "", /dados diferentes/);
  assert.ok(r.avisos.some((a) => /dados diferentes/.test(a)));
});

// ---------------------------------------------------------------- falhas

test("Falhas: sem planilha, planilha de outro tipo e mistura de tipos dão erro claro", () => {
  assert.throws(() => lerPlanilhasEfetivos([]), /Nenhuma planilha/);
  assert.throws(() => lerPlanilhaEfetivos(xlsx({ Qualquer: [["a", "b"], [1, 2]] })), /Não reconheci a planilha/);
  const antiga = xlsx({
    "DIVISÃO DE EQUIPES": [
      ["ATIVIDADE", "EMPRESA", "EQUIPE", "NIVEL", "Cargo / Função", "NOME PROFISSIONAIS", "DIREÇÃO 4X4", "CARROS", "STATUS ATUAL"],
      ["EQUIPE A", "Consominas", "Resgate", "Superior", "Biólogo de Fauna", "Fulano", "Sim", "VL 01", "Vigente"],
    ],
  });
  assert.equal(lerPlanilhaEfetivos(antiga).formato, "divisao");
  assert.throws(() => lerPlanilhasEfetivos([P3686(), antiga]), /uma planilha por contrato/);
});

test("Falha: a planilha por contrato sem nenhuma posição abaixo do cabeçalho é recusada", () => {
  assert.throws(() => lerPlanilhaEfetivos(xlsx({ "3687 LT": [CAB_LT] })), /não tem nenhuma vaga/);
});

// ---------------------------------------------------------------- base em Excel

test("Base das planilhas por contrato: 3 abas, e a base lê de volta igual", () => {
  const original = lerPlanilhasEfetivos([P3686(), PLT()], { anoReferencia: 2026 });
  const dados: DadosBase = {
    equipes: original.equipes.map((e) => ({ id: e.codigo, codigo: e.codigo, nome: e.nome, projeto: e.projeto, gestor: e.gestor, grupo: e.grupo, local: null, observacao: null, status: e.status, inicio: null, fim: null })),
    vagas: original.vagas.map((v, i) => ({
      id: `v${i}`,
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
    veiculos: original.veiculos.map((v, i) => ({ id: v.ref, codigo: `VEI-${i + 1}`, identificacao: v.identificacao, placa: null, modelo: null, tracao4x4: null, status: "Em operação", observacao: v.observacao ?? null })),
    ausencias: [],
    contratos: original.contratos.map((c) => ({ codigo: c.codigo, nome: null, cliente: null, gestor: null, local: null, observacao: null, ativo: true })),
  };
  const buf = montarPlanilhaBase(dados, indexar({ ausencias: [], alocacoes: [] }), "2026-10-15", original.conferencia ?? null);
  const wb = XLSX.read(buf, { type: "buffer" });
  assert.deepEqual(wb.SheetNames, ["LEIA-ME", "PESSOAS", "EQUIPES", "VIATURAS"]);
  const leia = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets["LEIA-ME"], { header: 1 }).map((l) => (l as unknown[]).join(" "));
  assert.ok(leia.some((l) => /Conferência: 16 posições nas equipes/.test(l)), leia.join("\n"));

  const volta = lerPlanilhaEfetivos(buf, { anoReferencia: 2026 });
  assert.equal(volta.formato, "base");
  assert.equal(volta.equipes.length, original.equipes.length);
  assert.equal(volta.vagas.length, original.vagas.length);
  assert.equal(volta.veiculos.length, original.veiculos.length);
  assert.equal(volta.veiculos.find((v) => v.identificacao === "CNS-83")?.observacao, "Camionete Backup");
  const chave = (v: { equipeCodigo: string; nome: string | null; cargo: string; status: string; origem?: string | null; conferir?: string | null; observacao: string | null }) => [v.equipeCodigo, v.nome ?? "", v.cargo, v.status, v.origem ?? "", v.conferir ?? "", v.observacao ?? ""].join("|");
  assert.deepEqual(volta.vagas.map(chave).sort(), original.vagas.map(chave).sort());
});

test("combinarResultados com um único resultado não perde nada", () => {
  const um = lerPlanilhaEfetivos(PLT(), { anoReferencia: 2026 });
  const igual = combinarResultados([um]);
  assert.equal(igual.vagas.length, um.vagas.length - 1, "só o Leandro, que também está numa equipe, sai da reserva");
  assert.equal(igual.equipes.filter((e) => e.codigo !== "APOIO").length, um.equipes.filter((e) => e.codigo !== "APOIO").length);
});

// ---------------------------------------------------------------- só o que está nas planilhas

test("Aba de apoio OCULTA não é lida: só entra o que está visível na planilha", () => {
  const r = lerPlanilhaEfetivos(P3686(false), { anoReferencia: 2026 });
  assert.equal(r.equipes.some((e) => e.codigo === "APOIO"), false);
  assert.equal(r.vagas.length, 7);
  assert.ok(r.avisos.some((a) => /aba oculta/.test(a)));
  const junto = lerPlanilhasEfetivos([P3686(false), PLT(false)], { anoReferencia: 2026 });
  assert.equal(junto.vagas.length, 7 + 9);
  assert.equal(junto.vagas.some((v) => /claudio/i.test(v.nome ?? "")), false);
  // visível, a mesma aba entra
  assert.equal(lerPlanilhaEfetivos(P3686(true), { anoReferencia: 2026 }).vagas.length, 7 + 3);
});

test("Viatura vale só onde a célula mesclada cobre; viatura repetida em várias equipes é UMA", () => {
  const arq = xlsx(
    {
      "3686_PNM": [
        CAB_3686,
        ["EQUIPE A", "3686 PNM", "Consominas", "Resgate", "Superior", "Biólogo", "Ana Souza", "Sim", "VL 01", "Ativo"],
        ["", "3686 PNM", "Coopermoura/MRN", "Resgate", "NA", "Auxiliar", "", "", "", ""],
        ["", "3686 PNM", "Consominas", "Resgate", "Superior", "Biólogo", "Bia Lima", "Sim", "VL 02", ""],
        ["", "3686 PNM", "Coopermoura/MRN", "Resgate", "NA", "Auxiliar", "", "", "", ""],
        ["EQUIPE B", "3686 PNM", "Consominas", "Resgate", "Superior", "Biólogo", "Caio Reis", "Sim", "vl 01 ", ""],
        ["", "3686 PNM", "Consominas", "Resgate", "Superior", "Biólogo", "Duda Alves", "Sim", "", ""],
      ],
    },
    [],
    // VL 01 da equipe A cobre as 2 linhas (2 e 3); VL 02 não é mesclada (só a linha 4); na equipe B nada é mesclado
    { "3686_PNM": ["I2:I3"] }
  );
  const r = lerPlanilhaEfetivos(arq, { anoReferencia: 2026 });
  const porNome = new Map(r.vagas.map((v) => [v.nome ?? `(${v.cargo}#${v.numero})`, v]));
  const ref = (n: string) => porNome.get(n)!.carroRef;
  assert.ok(ref("Ana Souza"));
  assert.equal(r.vagas[1].carroRef, ref("Ana Souza"), "a linha coberta pela mescla vai na mesma viatura");
  assert.ok(ref("Bia Lima"));
  assert.equal(r.vagas[3].carroRef, null, "a linha 5 não é coberta por nenhuma viatura: não se estende por dedução");
  assert.equal(ref("Duda Alves"), null);
  // "VL 01" nas duas equipes (maiúsculas e espaços diferentes) é uma viatura só
  const unicos = veiculosUnicos(r.veiculos);
  assert.equal(r.veiculos.length, 3);
  assert.equal(unicos.length, 2);
  const vl1 = unicos.find((u) => u.chave === "vl 01")!;
  assert.equal(vl1.equipes.length, 2);
  assert.equal(vl1.refs.length, 2);
});

// ---------------------------------------------------------------- base com colunas para preencher

function baseDe(r: ReturnType<typeof lerPlanilhasEfetivos>): Buffer {
  const unicos = veiculosUnicos(r.veiculos);
  const dados: DadosBase = {
    equipes: r.equipes.map((e) => ({ id: e.codigo, codigo: e.codigo, nome: e.nome, projeto: e.projeto, gestor: e.gestor, grupo: e.grupo, local: e.local ?? null, observacao: e.observacao ?? null, status: e.status, inicio: e.inicio ?? null, fim: e.fim ?? null, cliente: e.cliente ?? null })),
    vagas: r.vagas.map((v, i) => ({
      id: `v${i}`,
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
      previsaoInicio: v.previsaoInicio ?? null,
      veiculoId: v.carroRef ? String(unicos.findIndex((u) => u.refs.includes(v.carroRef!))) : null,
      contrato: v.contrato ?? null,
      grupo: v.grupo ?? null,
      semNome: !!v.semNome && !v.nome,
      observacao: v.observacao,
      origem: v.origem ?? null,
      conferir: v.conferir ?? null,
    })),
    veiculos: unicos.map((u, i) => ({ id: `${i}`, codigo: `VEI-${i + 1}`, identificacao: u.identificacao, placa: u.placa, modelo: u.modelo, tracao4x4: u.tracao4x4, status: u.status || "Em operação", observacao: u.observacao, cliente: u.cliente })),
    ausencias: r.vagas.flatMap((v, i) => [...(v.ausencia ? [v.ausencia] : []), ...(v.ausencias ?? [])].map((a, k) => ({ id: `a${i}-${k}`, vagaId: `v${i}`, tipo: a.tipo, inicio: a.inicio, fim: a.fim, observacao: null }))),
    contratos: r.contratos.map((c) => ({ codigo: c.codigo, nome: null, cliente: c.cliente, gestor: c.gestor, local: null, observacao: null, ativo: true })),
  };
  return montarPlanilhaBase(dados, indexar({ ausencias: [], alocacoes: [] }), "2026-10-15", r.conferencia ?? null);
}

/** Preenche uma célula pelo nome da coluna, como a pessoa faria no Excel. */
function preencher(buf: Buffer, aba: string, linhaDe: (r: Record<string, string>) => boolean, valores: Record<string, string>): Buffer {
  const wb = XLSX.read(buf, { type: "buffer" });
  const ws = wb.Sheets[aba];
  const linhas = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: "" });
  const cab = linhas[0].map(String);
  for (let i = 1; i < linhas.length; i++) {
    const reg = Object.fromEntries(cab.map((c, j) => [c, String(linhas[i][j] ?? "")]));
    if (!linhaDe(reg)) continue;
    for (const [col, v] of Object.entries(valores)) ws[XLSX.utils.encode_cell({ r: i, c: cab.indexOf(col) })] = { t: "s", v };
  }
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

test("Base de 3 abas: o planejamento sai em branco e, preenchido no Excel (datas das equipes, status com período, previsão de entrada), entra no sistema", () => {
  const r = lerPlanilhasEfetivos([P3686(false), PLT(false)], { anoReferencia: 2026, cliente: "MRN" });
  const buf = baseDe(r);
  const wb = XLSX.read(buf, { type: "buffer" });
  assert.deepEqual(wb.SheetNames, ["LEIA-ME", "PESSOAS", "EQUIPES", "VIATURAS"]);
  // equipes: cliente MRN, sem datas (as planilhas não trazem)
  const eqs = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets["EQUIPES"]);
  assert.ok(eqs.length >= 5);
  assert.ok(eqs.every((e) => e["Cliente"] === "MRN" && !e["Início da equipe"] && !e["Fim da equipe"]));
  // pessoas: tudo que se preenche está na mesma aba, ao lado do status
  const cab = (XLSX.utils.sheet_to_json<string[]>(wb.Sheets["PESSOAS"], { header: 1 })[0] as string[]).map(String);
  for (const c of ["Cliente", "Contrato", "Equipe", "Profissional", "Status", "Status: início", "Status: fim", "Previsão de entrada", "Contrato atual (outro)", "Disponível a partir de", "Destino", "Observação", "Situação hoje"]) assert.ok(cab.includes(c), c);
  assert.ok(!cab.includes("Grupo") && !cab.includes("Gestor MRN"), "grupo e gestor não vêm das planilhas");
  const pes = XLSX.utils.sheet_to_json<Record<string, string>>(wb.Sheets["PESSOAS"]);
  const ferias = pes.find((x) => String(x["Profissional"]).includes("Matheus"))!;
  assert.equal(ferias["Status"], "Férias", "o status é o que a planilha escreve");
  assert.ok(!ferias["Status: início"] && !ferias["Status: fim"], "o período fica em branco para preencher");

  // a pessoa preenche no Excel
  let f = preencher(buf, "EQUIPES", (x) => x["Equipe"] === "EQUIPE DE FELINOS", { "Início da equipe": "01/11/2026", "Fim da equipe": "30/11/2026" });
  f = preencher(f, "EQUIPES", (x) => x["Equipe"] === "EQUIPE 01 - FAUNA E FLORA LT", { "Início da equipe": "05/10/2026" }); // só início: sem fim
  f = preencher(f, "PESSOAS", (x) => x["Profissional"] === "Leandro Mourão", { "Previsão de entrada": "20/10/2026" });
  f = preencher(f, "PESSOAS", (x) => String(x["Profissional"]).includes("Matheus"), { "Status: início": "10/11/2026", "Status: fim": "29/11/2026" });
  const volta = lerPlanilhaEfetivos(f, { anoReferencia: 2026 });
  assert.equal(volta.formato, "base");
  const felinos = volta.equipes.find((e) => e.nome === "EQUIPE DE FELINOS")!;
  assert.equal(felinos.cliente, "MRN");
  assert.equal(felinos.inicio, "2026-11-01");
  assert.equal(felinos.fim, "2026-11-30");
  const lt1 = volta.equipes.find((e) => e.nome === "EQUIPE 01 - FAUNA E FLORA LT")!;
  assert.equal(lt1.inicio, "2026-10-05");
  assert.equal(lt1.fim ?? null, null);
  assert.equal(volta.vagas.find((v) => v.nome === "Leandro Mourão")!.previsaoInicio, "2026-10-20");
  // férias com período: a pessoa segue Vigente e a ausência tem data
  const m = volta.vagas.find((v) => v.nome?.includes("Matheus"))!;
  assert.equal(m.status, "Vigente");
  assert.deepEqual(m.ausencias, [{ tipo: "Férias", inicio: "2026-11-10", fim: "2026-11-29" }]);
  // o que não foi preenchido continua sem data, e o status literal ("Delisgar") volta igual
  assert.equal(volta.vagas.find((v) => v.nome === "Luiz Fernando")!.previsaoInicio ?? null, null);
  assert.equal(volta.vagas.find((v) => v.nome === "Magson Lopes")!.status, "Delisgar");
  assert.equal(volta.vagas.length, r.vagas.length);
  assert.deepEqual(volta.contratos.map((c) => [c.codigo, c.cliente]).sort(), r.contratos.map((c) => [c.codigo, "MRN"]).sort());
});

test("Base: a pessoa fora de qualquer equipe fica na reserva do cliente dela, e cada cliente tem a sua", () => {
  const r = lerPlanilhasEfetivos([P3686(false)], { anoReferencia: 2026, cliente: "MRN" });
  const buf = baseDe(r);
  // acrescenta, na aba PESSOAS, uma pessoa sem equipe da AGA e outra da MRN
  const wb = XLSX.read(buf, { type: "buffer" });
  const ws = wb.Sheets["PESSOAS"];
  const cab = (XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: "" })[0] as string[]).map(String);
  const n = XLSX.utils.sheet_to_json(ws, { header: 1 }).length;
  const poe = (linha: number, v: Record<string, string>) => Object.entries(v).forEach(([c, x]) => (ws[XLSX.utils.encode_cell({ r: linha, c: cab.indexOf(c) })] = { t: "s", v: x }));
  poe(n, { Cliente: "AGA", "Profissional": "Pedro Alves", Empresa: "Consominas", Função: "Biólogo de Fauna", Status: "Vigente" });
  poe(n + 1, { Cliente: "MRN", "Profissional": "Rita Souza", Empresa: "Consominas", Função: "Biólogo de Fauna", Status: "Vigente" });
  ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: n + 1, c: cab.length - 1 } });
  const volta = lerPlanilhaEfetivos(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer, { anoReferencia: 2026 });
  const reservas = volta.equipes.filter((e) => e.grupo === "Apoio");
  assert.deepEqual(reservas.map((e) => [e.codigo, e.cliente]).sort(), [["APOIO-AGA", "AGA"], ["APOIO-MRN", "MRN"]]);
  const pedro = volta.vagas.find((v) => v.nome === "Pedro Alves")!;
  assert.equal(pedro.equipeCodigo, "APOIO-AGA");
});

test("Base: cada viatura aparece uma vez em VIATURAS, com as equipes que usam", () => {
  const arq = xlsx({
    "3686_PNM": [
      CAB_3686,
      ["EQUIPE A", "3686 PNM", "Consominas", "Resgate", "Superior", "Biólogo", "Ana Souza", "Sim", "VL 01", "Ativo"],
      ["EQUIPE B", "3686 PNM", "Consominas", "Resgate", "Superior", "Biólogo", "Caio Reis", "Sim", "VL 01", ""],
      ["EQUIPE C", "3686 PNM", "Consominas", "Resgate", "Superior", "Biólogo", "Eva Dias", "Sim", "VL 02", ""],
    ],
  });
  const r = lerPlanilhaEfetivos(arq, { anoReferencia: 2026, cliente: "MRN" });
  const wb = XLSX.read(baseDe(r), { type: "buffer" });
  const vt = XLSX.utils.sheet_to_json<Record<string, string | number>>(wb.Sheets["VIATURAS"]);
  assert.equal(vt.length, 2);
  const vl1 = vt.find((x) => x["Viatura"] === "VL 01")!;
  assert.equal(vl1["Nº de equipes"], 2);
  assert.equal(vl1["Equipes que usam"], "EQUIPE A · EQUIPE B");
  assert.equal(vl1["Cliente"], "MRN");
  assert.equal(vl1["Placa"], "");
});

// ---------------------------------------------------------------- enviar o planejamento preenchido

test("Planejamento preenchido: só preenche; em branco nunca apaga; datas erradas, linhas sem par e status inventado são recusados", () => {
  const r = lerPlanilhasEfetivos([P3686(false), PLT(false)], { anoReferencia: 2026, cliente: "MRN" });
  const base = baseDe(r);
  const atual: Atuais = {
    equipes: r.equipes.map((e) => ({ id: e.codigo, codigo: e.codigo, nome: e.nome, projeto: e.projeto, inicio: null, fim: e.nome === "EQUIPE DE FELINOS" ? "2026-12-31" : null, local: null, gestor: null, observacao: null })),
    vagas: r.vagas.map((v) => ({ id: v.origem!, equipeId: v.equipeCodigo, numero: v.numero, origem: v.origem ?? null, nome: v.nome, cargo: v.cargo, status: v.status, previsaoInicio: null, contratoAtual: null, disponivelAPartir: null, destino: null, observacao: v.observacao })),
    veiculos: veiculosUnicos(r.veiculos).map((u, i) => ({ id: `veic${i}`, identificacao: u.identificacao, placa: null, modelo: null, tracao4x4: null, status: "Em operação", observacao: u.observacao })),
    contratos: r.contratos.map((c) => ({ codigo: c.codigo, nome: null, cliente: "MRN", gestor: null, local: null, observacao: null })),
    ausencias: [],
  };
  // base em branco: nada muda
  assert.equal(totalDeMudancas(planejarAtualizacao(lerPlanilhaEfetivos(base, { anoReferencia: 2026 }), atual)), 0);

  let f = preencher(base, "EQUIPES", (x) => x["Equipe"] === "EQUIPE DE FELINOS", { "Início da equipe": "01/11/2026" }); // fim em branco: o fim que o sistema já tem fica
  f = preencher(f, "EQUIPES", (x) => x["Equipe"] === "EQUIPE 01 - FAUNA E FLORA LT", { "Início da equipe": "05/10/2026", "Fim da equipe": "25/10/2026" });
  f = preencher(f, "EQUIPES", (x) => x["Equipe"] === "EQUIPE 05 - EMERGENCIAL", { "Início da equipe": "10/10/2026", "Fim da equipe": "01/10/2026" }); // fim antes do início
  f = preencher(f, "PESSOAS", (x) => x["Profissional"] === "Leandro Mourão", { "Previsão de entrada": "20/10/2026" });
  f = preencher(f, "PESSOAS", (x) => String(x["Profissional"]).includes("Matheus"), { "Status: início": "10/11/2026", "Status: fim": "29/11/2026" }); // as férias ganham período
  f = preencher(f, "PESSOAS", (x) => x["Profissional"] === "Jonas", { Status: "Em mobilização" }); // muda o status escrito
  f = preencher(f, "PESSOAS", (x) => x["Profissional"] === "Magson Lopes", { Status: "" }); // em branco: não muda nada
  f = preencher(f, "VIATURAS", (x) => x["Viatura"] === "VL 01", { Placa: "ABC1D23", Status: "Voando" }); // status que não existe
  const plano = planejarAtualizacao(lerPlanilhaEfetivos(f, { anoReferencia: 2026 }), atual);

  const felinos = plano.equipes.find((x) => x.rotulo === "EQUIPE DE FELINOS")!;
  assert.deepEqual(felinos.mudancas, { inicio: "2026-11-01" }, "o fim já cadastrado não é apagado");
  assert.deepEqual(plano.equipes.find((x) => x.rotulo === "EQUIPE 01 - FAUNA E FLORA LT")!.mudancas, { inicio: "2026-10-05", fim: "2026-10-25" });
  assert.equal(plano.equipes.some((x) => x.rotulo === "EQUIPE 05 - EMERGENCIAL"), false);
  assert.ok(plano.avisos.some((a) => /EQUIPE 05 - EMERGENCIAL.*antes do início/.test(a)));
  const porNome = new Map(plano.vagas.map((x) => [x.rotulo.split(" (")[0], x.mudancas]));
  assert.deepEqual(porNome.get("Leandro Mourão"), { previsaoInicio: "2026-10-20" });
  assert.deepEqual(porNome.get("Jonas"), { status: "Em mobilização" });
  assert.equal(porNome.has("Magson Lopes"), false, "status em branco não muda o que está no sistema");
  // férias que ganharam período: a pessoa passa a Vigente e a ausência tem data
  assert.deepEqual(porNome.get("Matheus Vander / Bianca Calixto"), { status: "Vigente" });
  assert.equal(plano.ausencias.length, 1);
  assert.equal(plano.ausencias[0].tipo, "Férias");
  assert.deepEqual(plano.veiculos.map((x) => [x.rotulo, x.mudancas]), [["VL 01", { placa: "ABC1D23" }]]);
  assert.ok(plano.avisos.some((a) => /VL 01.*Voando/.test(a)));

  // equipe do Excel que o sistema não conhece: ignorada com aviso
  const semFelinos = { ...atual, equipes: atual.equipes.filter((e) => e.nome !== "EQUIPE DE FELINOS") };
  assert.ok(planejarAtualizacao(lerPlanilhaEfetivos(f, { anoReferencia: 2026 }), semFelinos).avisos.some((a) => /EQUIPE DE FELINOS.*não existe no sistema/.test(a)));
});
