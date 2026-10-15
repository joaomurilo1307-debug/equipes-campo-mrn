import { test } from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { lerPlanilhaEfetivos } from "../src/lib/efetivos/importarPlanilha";
import { combinarResultados, lerPlanilhasEfetivos } from "../src/lib/efetivos/combinarPlanilhas";
import { montarPlanilhaBase, origensPorFonte, type DadosBase } from "../src/lib/efetivos/base";
import { indexar } from "../src/lib/efetivos/disponibilidade";

function xlsx(abas: Record<string, unknown[][]>, ocultas: string[] = []): Buffer {
  const wb = XLSX.utils.book_new();
  for (const [nome, linhas] of Object.entries(abas)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(linhas), nome);
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
const P3686 = () =>
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
    ["EQUIPE DE LT PARA APOIO"]
  );

// Planilha do contrato 3687 LT: STATUS DE ATIVIDADE é a pessoa e STATUS ATUAL é o recado da viatura
const CAB_LT = ["ATIVIDADE", "CONTRATO", "EMPRESA", "EQUIPE", "NIVEL", "Cargo / Função", "NOME PROFISSIONAIS", "STATUS DE ATIVIDADE", "DIREÇÃO 4X4", "CARROS", "STATUS ATUAL"];
const PLT = () =>
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
    ["EQUIPE DE LT PARA APOIO"]
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
  assert.equal(mobil.status, "Em contratação");
  assert.match(mobil.observacao ?? "", /mobilização/);

  const dupla = r.vagas.find((v) => v.nome?.includes("/"))!;
  assert.match(dupla.conferir ?? "", /Dois nomes na mesma célula/);
  assert.match(dupla.conferir ?? "", /Férias/); // férias sem período vira Afastado e fica para conferir
  assert.equal(dupla.status, "Afastado");
  assert.match(dupla.origem ?? "", /^3686_PNM · linha 8$/);
});

test("Planilha por contrato (3687 LT): STATUS DE ATIVIDADE é a pessoa, STATUS ATUAL é a viatura, equipe de gestão e equipe mista", () => {
  const r = lerPlanilhaEfetivos(PLT(), { anoReferencia: 2026 });
  assert.equal(r.formato, "contratos");
  const porNome = new Map(r.equipes.map((e) => [e.nome, e]));
  assert.equal(porNome.get("GESTÃO")?.grupo, "Gestão");
  assert.equal(porNome.get("EQUIPE 01 - FAUNA E FLORA LT")?.grupo, "Fauna e Flora");
  assert.equal(porNome.get("EQUIPE 05 - EMERGENCIAL")?.grupo, "Fauna");
  const cns52 = r.veiculos.find((v) => v.identificacao === "CNS-52")!;
  assert.equal(cns52.observacao, "Será substituida pela CNS-102");
  assert.equal(r.veiculos.find((v) => v.identificacao === "CNS-83")?.observacao, "Camionete Backup");
  // status "Delisgar" não é reconhecido: indisponível e marcado
  const magson = r.vagas.find((v) => v.nome === "Magson Lopes")!;
  assert.equal(magson.status, "Afastado");
  assert.match(magson.conferir ?? "", /Delisgar/);
  // atividade x cargo que não combinam (fauna x flora) ficam marcados
  assert.match(r.vagas.find((v) => v.nome === "Jonas")!.conferir ?? "", /não combinam/);
  assert.equal(r.vagas.find((v) => v.nome === "Ana Flavia")!.conferir, null);
  // atividade em branco não vira "Resgate" por palpite
  assert.equal(r.vagas.find((v) => v.empresa === "Cooperativa")!.atividade, "A informar");
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
    ["EQUIPE DE LT PARA APOIO"]
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

test("Base das planilhas por contrato: a conferência prova que nenhuma linha ficou de fora e a base lê de volta igual", () => {
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
  const conf = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets["CONFERÊNCIA"], { header: 1 }).map((l) => (l as unknown[]).join(" | "));
  assert.ok(conf.some((l) => /^Total \| 22 \| 22 \| nenhuma linha ficou de fora/.test(l)), conf.join("\n"));
  assert.ok(conf.some((l) => /^3687 LT › EQUIPE DE LT PARA APOIO \| 3 \| 3 \| todas as linhas estão na base/.test(l)));

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
