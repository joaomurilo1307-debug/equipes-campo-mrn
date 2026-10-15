// Leitura das planilhas do controle de efetivos (afugentamento / resgate) da MRN.
// Aceita os formatos que o Samuel usa:
//   A) "painel": aba "Profissionais" (ID VAGA, ID EQUIPE, PROJETO, ... STATUS ATUAL) + aba "Equipes" (status da equipe);
//   B) "original": uma aba so, uma linha por vaga, nome da equipe preenchido apenas na 1a linha de cada equipe;
//   C) "divisao" (semana 42): aba "DIVISÃO DE EQUIPES" (equipe, 4x4, viatura VL) + aba de apoio vindo de outro contrato.
// So le e devolve estruturas; quem grava (e so acrescenta) e a rota de importacao.

import * as XLSX from "xlsx";
import { dataValida, somarDias, type Dia } from "./disponibilidade";
import { cruzarCadastroComDivisao, type PessoaCadastro, type PosicaoCadastro } from "./cruzarAbas";

export type EquipeImportada = {
  codigo: string;
  projeto: string;
  // false = contrato deduzido ou ainda nao informado na planilha: o sistema pede confirmacao
  contratoConfirmado: boolean;
  gestor: string | null;
  grupo: string;
  nome: string;
  status: string;
  // so no formato "base" (a planilha-base do sistema)
  local?: string | null;
  observacao?: string | null;
  inicio?: Dia | null;
  fim?: Dia | null;
};
export type AusenciaImportada = { tipo: string; inicio: Dia; fim: Dia };
export type VagaImportada = {
  numero: number | null;
  equipeCodigo: string;
  atividade: string;
  empresa: string;
  cargo: string;
  nome: string | null;
  status: string;
  observacao: string | null;
  ausencia: AusenciaImportada | null;
  ausencias?: AusenciaImportada[];
  nivel?: string | null;
  direcao4x4?: boolean | null;
  contratoAtual?: string | null;
  disponivelAPartir?: Dia | null;
  destino?: string | null;
  // viatura em que a pessoa vai (a coluna CARROS da planilha, mesclada por subgrupo)
  carroRef?: string | null;
  // cadastro por contrato (primeira aba)
  contrato?: string | null;
  equipeContrato?: string | null;
  grupo?: string | null;
  // posicao preenchida, mas o nome nao foi informado (celula em branco; "Vago" e vaga aberta de verdade)
  semNome?: boolean;
  // de onde a posicao veio na planilha ("Aba 2 · linha 5 + Aba 1 · ID 3") e o que conferir, quando houver duvida
  origem?: string | null;
  conferir?: string | null;
};
export type ContratoImportado = { codigo: string; gestor: string | null; cliente: string | null; nome?: string | null; local?: string | null; observacao?: string | null };
// Viatura que a planilha cita para a equipe ("VL 01"); placa e contrato nao vem na planilha.
export type VeiculoImportado = { ref: string; identificacao: string; equipeCodigo: string; ocupantes: number; placa?: string | null; modelo?: string | null; tracao4x4?: boolean | null; status?: string | null };
export type ResultadoImportacao = {
  formato: "painel" | "divisao" | "original" | "cruzado" | "base";
  equipes: EquipeImportada[];
  vagas: VagaImportada[];
  veiculos: VeiculoImportado[];
  contratos: ContratoImportado[];
  avisos: string[];
  // so no formato cruzado: o que a conferencia precisa para provar de onde vem cada numero
  conferencia?: {
    linhasAba1: number;
    linhasAba2: number;
    linhasAba3: number;
    equipesAba1: number;
    equipesAba2: number;
    substituidas: { origem: string; descricao: string; equipe: string }[];
  };
};
export type OpcoesLeitura = { anoReferencia?: number };

export function normalizar(t: unknown): string {
  return String(t ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const texto = (v: unknown): string => String(v ?? "").replace(/\s+/g, " ").trim();
const textoOuNulo = (v: unknown): string | null => {
  const t = texto(v);
  return t === "" ? null : t;
};

/** Numero de serie do Excel, texto dd/mm/aaaa ou aaaa-mm-dd -> AAAA-MM-DD (ou null). */
export function paraDia(v: unknown): Dia | null {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) {
    const d = v.toISOString().slice(0, 10);
    return dataValida(d) ? d : null;
  }
  if (typeof v === "number") {
    if (!(v > 20000 && v < 80000)) return null;
    const dia = somarDias("1899-12-30", Math.floor(v));
    return dataValida(dia) ? dia : null;
  }
  const t = String(v).trim();
  const br = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  if (br) {
    const dia = `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
    return dataValida(dia) ? dia : null;
  }
  return dataValida(t.slice(0, 10)) ? t.slice(0, 10) : null;
}

const TIPOS_COM_PRAZO: Record<string, string> = { ferias: "Férias", atestado: "Atestado", folga: "Folga", treinamento: "Treinamento" };

/** Converte o texto de status da planilha para o status da vaga (+ ausencia datada quando houver prazo). */
export function interpretarStatus(
  bruto: unknown,
  inicio: Dia | null,
  fim: Dia | null
): { status: string; ausencia: AusenciaImportada | null; observacao: string | null; aviso: string | null } {
  const n = normalizar(bruto);
  const original = texto(bruto);
  if (n === "" || n === "vigente" || n === "ativo") return { status: "Vigente", ausencia: null, observacao: null, aviso: null };
  if (n.startsWith("apto") && n.includes("restri")) return { status: "Apto com restrição", ausencia: null, observacao: null, aviso: null };
  if (n.startsWith("afastad")) {
    return { status: "Afastado", ausencia: null, observacao: original === "Afastado" ? null : original, aviso: null };
  }
  if (n === "em contratacao") return { status: "Em contratação", ausencia: null, observacao: null, aviso: null };
  if (n.startsWith("desmobiliz")) return { status: "Desmobilizado", ausencia: null, observacao: null, aviso: null };
  const tipo = TIPOS_COM_PRAZO[n];
  if (tipo) {
    if (inicio && fim && inicio <= fim) return { status: "Vigente", ausencia: { tipo, inicio, fim }, observacao: null, aviso: null };
    return {
      status: "Afastado",
      ausencia: null,
      observacao: `Importado como "${original}" sem período informado`,
      aviso: `Status "${original}" sem datas de início e fim: ficou como Afastado até ser informado o período.`,
    };
  }
  return {
    status: "Afastado",
    ausencia: null,
    observacao: `Status importado: "${original}"`,
    aviso: `Status "${original}" não reconhecido: ficou como Afastado (indisponível) até ser conferido.`,
  };
}

type Cabecalho = Map<string, number>; // nome normalizado -> indice da coluna

function acharCabecalho(linhas: unknown[][], obrigatorias: string[]): { indice: number; cab: Cabecalho } | null {
  for (let i = 0; i < Math.min(linhas.length, 15); i++) {
    const cab: Cabecalho = new Map();
    linhas[i].forEach((c, j) => {
      const n = normalizar(c);
      if (n && !cab.has(n)) cab.set(n, j);
    });
    if (obrigatorias.every((o) => cab.has(o))) return { indice: i, cab };
  }
  return null;
}

function col(cab: Cabecalho, ...nomes: string[]): number {
  for (const n of nomes) if (cab.has(n)) return cab.get(n)!;
  return -1;
}

function codigoEquipe(n: number): string {
  return `EQ-${String(n).padStart(2, "0")}`;
}

function lerLinhas(ws: XLSX.WorkSheet): unknown[][] {
  return XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, blankrows: false, defval: "" });
}

/** As linhas da aba com o número da linha no Excel (para dizer, em cada posição, de onde ela veio). */
function lerLinhasNumeradas(ws: XLSX.WorkSheet): { linhas: unknown[][]; numero: number[] } {
  const ref = ws["!ref"];
  const primeira = ref ? XLSX.utils.decode_range(ref).s.r : 0;
  const linhas = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, blankrows: true, defval: "" });
  return { linhas, numero: linhas.map((_, i) => primeira + i + 1) };
}

function abaVisivel(wb: XLSX.WorkBook, nome: string): boolean {
  const info = wb.Workbook?.Sheets?.find((x) => x.name === nome);
  return !info || !info.Hidden;
}

export function lerPlanilhaEfetivos(dados: ArrayBuffer | Uint8Array | Buffer, opcoes: OpcoesLeitura = {}): ResultadoImportacao {
  const wb = XLSX.read(dados, { type: "buffer" });
  const avisos: string[] = [];

  // ---- formato "base": a planilha-base do proprio sistema (BASE + EQUIPES + CONTRATOS + VIATURAS)
  const abaBase = wb.SheetNames.find((n) => normalizar(n) === "base");
  if (abaBase && acharCabecalho(lerLinhas(wb.Sheets[abaBase]), ["cod. equipe", "profissional", "posicao"])) return lerBaseUnificada(wb, abaBase);

  // ---- formato A: painel com aba Profissionais
  const abaProf = wb.SheetNames.find((n) => normalizar(n) === "profissionais");
  if (abaProf) {
    const linhas = lerLinhas(wb.Sheets[abaProf]);
    const ch = acharCabecalho(linhas, ["id equipe", "projeto", "grupo"]);
    if (!ch) throw new Error('Aba "Profissionais" sem as colunas ID EQUIPE, PROJETO e GRUPO.');
    const c = ch.cab;
    const iNum = col(c, "id vaga", "id");
    const iEq = col(c, "id equipe");
    const iProj = col(c, "projeto");
    const iGestor = col(c, "gestor mrn");
    const iGrupo = col(c, "grupo");
    const iNome = col(c, "equipe");
    const iAtiv = col(c, "atividade base", "atividade");
    const iEmp = col(c, "empresa");
    const iCargo = col(c, "cargo / funcao", "cargo");
    const iProfis = col(c, "profissional", "profissionais");
    const iStatus = col(c, "status atual", "status");
    const iIni = col(c, "inicio condicao");
    const iFim = col(c, "fim condicao");
    const iObs = col(c, "observacao");

    const statusEquipe = new Map<string, string>();
    const abaEq = wb.SheetNames.find((n) => normalizar(n) === "equipes");
    if (abaEq) {
      const le = lerLinhas(wb.Sheets[abaEq]);
      const ce = acharCabecalho(le, ["id equipe", "status equipe"]);
      if (ce) {
        const iId = ce.cab.get("id equipe")!;
        const iSt = ce.cab.get("status equipe")!;
        for (const r of le.slice(ce.indice + 1)) {
          const id = texto(r[iId]);
          if (id) statusEquipe.set(id, texto(r[iSt]) || "Ativa");
        }
      }
    }

    const equipes = new Map<string, EquipeImportada>();
    const vagas: VagaImportada[] = [];
    for (const r of linhas.slice(ch.indice + 1)) {
      const eqCodigo = texto(r[iEq]);
      if (!eqCodigo) continue;
      if (!equipes.has(eqCodigo)) {
        equipes.set(eqCodigo, {
          codigo: eqCodigo,
          projeto: texto(r[iProj]),
          gestor: textoOuNulo(r[iGestor]),
          grupo: texto(r[iGrupo]),
          nome: texto(r[iNome]) || eqCodigo,
          contratoConfirmado: true,
          status: statusEquipe.get(eqCodigo) ?? "Ativa",
        });
      }
      const st = interpretarStatus(r[iStatus], iIni >= 0 ? paraDia(r[iIni]) : null, iFim >= 0 ? paraDia(r[iFim]) : null);
      if (st.aviso) avisos.push(`${eqCodigo} vaga ${texto(r[iNum])}: ${st.aviso}`);
      const obsPlanilha = iObs >= 0 ? textoOuNulo(r[iObs]) : null;
      const n = Number(r[iNum]);
      vagas.push({
        numero: Number.isFinite(n) && texto(r[iNum]) !== "" ? n : null,
        equipeCodigo: eqCodigo,
        atividade: texto(r[iAtiv]) || "Resgate",
        empresa: texto(r[iEmp]),
        cargo: texto(r[iCargo]),
        nome: textoOuNulo(r[iProfis]),
        status: st.status,
        observacao: [obsPlanilha, st.observacao].filter(Boolean).join(" | ") || null,
        ausencia: st.ausencia,
      });
    }
    if (vagas.length === 0) throw new Error('A aba "Profissionais" não tem nenhuma vaga.');
    return { formato: "painel", equipes: [...equipes.values()], vagas, veiculos: [], contratos: [], avisos };
  }

  // ---- formato C: "DIVISÃO DE EQUIPES" (semana 42): equipe na coluna ATIVIDADE, viaturas VL e direção 4x4
  const abaDivisao = wb.SheetNames.find((n) => normalizar(n) === "divisao de equipes");
  if (abaDivisao) {
    const divisao = lerDivisaoDeEquipes(wb, abaDivisao, opcoes);
    // com a primeira aba (cadastro por contrato) visivel, as duas visoes se cruzam: cada pessoa uma vez so
    const abaCadastro = wb.SheetNames.find((n) => n !== abaDivisao && abaVisivel(wb, n) && !!acharCabecalho(lerLinhas(wb.Sheets[n]), ["projeto", "grupo", "equipe / projeto"]));
    if (!abaCadastro) return divisao;
    const cadastro = lerCadastroPorContrato(wb.Sheets[abaCadastro]);
    const x = cruzarCadastroComDivisao(divisao, cadastro.pessoas, cadastro.contratos, cadastro.semPessoa);
    return {
      formato: "cruzado",
      equipes: x.equipes,
      vagas: x.vagas,
      veiculos: divisao.veiculos,
      contratos: x.contratos.map((c) => ({ ...c, cliente: c.gestor ? "MRN" : null })),
      conferencia: {
        linhasAba1: cadastro.pessoas.length + cadastro.semPessoa.length,
        linhasAba2: divisao.vagas.filter((v) => v.equipeCodigo !== CODIGO_RESERVA).length,
        linhasAba3: divisao.vagas.filter((v) => v.equipeCodigo === CODIGO_RESERVA).length,
        equipesAba1: new Set([...cadastro.pessoas.map((p) => p.bloco), ...cadastro.semPessoa.map((p) => p.bloco)]).size,
        equipesAba2: divisao.equipes.filter((e) => e.codigo !== CODIGO_RESERVA).length,
        substituidas: x.substituidas,
      },
      avisos: [
        ...divisao.avisos,
        `Cadastro por contrato: ${cadastro.pessoas.length} pessoas com nome; ${x.resumo.ligadas} ligadas pelo nome às equipes de campo, ${x.resumo.encaixadas} encaixadas pela posição, ${x.resumo.extrasNaEquipe} a mais em equipes existentes e ${x.resumo.equipesDoCadastro} equipes que só existem no cadastro.`,
      ],
    };
  }

  // ---- formato B: planilha original (primeira aba visivel com as colunas esperadas)
  const abaOriginal = wb.SheetNames.find((n) => abaVisivel(wb, n) && !!acharCabecalho(lerLinhas(wb.Sheets[n]), ["projeto", "grupo", "equipe / projeto"]));
  const ws = wb.Sheets[abaOriginal ?? wb.SheetNames[0]];
  const linhas = lerLinhas(ws);
  const ch = acharCabecalho(linhas, ["projeto", "grupo", "equipe / projeto"]);
  if (!ch) throw new Error("Não reconheci a planilha: esperava a aba Profissionais (painel) ou as colunas PROJETO, GRUPO e EQUIPE / PROJETO (original).");
  const c = ch.cab;
  const iNum = col(c, "id");
  const iProj = col(c, "projeto");
  const iGestor = col(c, "gestor mrn");
  const iGrupo = col(c, "grupo");
  const iNome = col(c, "equipe / projeto");
  const iAtiv = col(c, "resgate / afugentamento");
  const iEmp = col(c, "empresa");
  const iCargo = col(c, "carg / funcao", "cargo / funcao");
  const iProfis = col(c, "profissionais", "profissional");
  const iStatus = col(c, "status");

  // O nome da equipe so aparece na 1a linha de cada bloco; as linhas seguintes herdam o nome.
  // A equipe-base e identificada por projeto + nome + grupo (o mesmo nome de equipe tem
  // metade Fauna e metade Flora, e pode reaparecer em outro trecho da planilha), na
  // ordem em que aparece -- e assim que o painel do Samuel numera EQ-01...EQ-17.
  const equipes: EquipeImportada[] = [];
  const porChave = new Map<string, EquipeImportada>();
  const vagas: VagaImportada[] = [];
  let projetoAnterior = "";
  let nomeAtual = "";
  for (const r of linhas.slice(ch.indice + 1)) {
    const projeto = texto(r[iProj]);
    const cargo = texto(r[iCargo]);
    if (!projeto && !cargo) continue;
    if (projeto !== projetoAnterior) {
      projetoAnterior = projeto;
      nomeAtual = "";
    }
    const nomeLinha = texto(r[iNome]);
    if (nomeLinha !== "") nomeAtual = nomeLinha;
    const nome = nomeAtual || "(sem nome na planilha)";
    const grupo = texto(r[iGrupo]);
    const chave = `${projeto}|${nome}|${grupo}`;
    let eq = porChave.get(chave);
    if (!eq) {
      eq = {
        codigo: codigoEquipe(equipes.length + 1),
        projeto,
        gestor: textoOuNulo(r[iGestor]),
        grupo,
        nome,
        contratoConfirmado: true,
        status: "Ativa",
      };
      if (!nomeAtual) avisos.push(`${eq.codigo}: a planilha não traz o nome da equipe (projeto ${projeto}).`);
      porChave.set(chave, eq);
      equipes.push(eq);
    }
    const st = interpretarStatus(r[iStatus], null, null);
    const n = Number(r[iNum]);
    if (st.aviso) avisos.push(`${eq.codigo} vaga ${texto(r[iNum])}: ${st.aviso}`);
    vagas.push({
      numero: Number.isFinite(n) && texto(r[iNum]) !== "" ? n : null,
      equipeCodigo: eq.codigo,
      atividade: texto(r[iAtiv]) || "Resgate",
      empresa: texto(r[iEmp]),
      cargo,
      nome: textoOuNulo(r[iProfis]),
      status: st.status,
      observacao: st.observacao,
      ausencia: null,
    });
  }
  if (vagas.length === 0) throw new Error("A planilha não tem nenhuma vaga abaixo do cabeçalho.");
  return { formato: "original", equipes, vagas, veiculos: [], contratos: [], avisos };
}


// ---------------------------------------------------------------- cadastro por contrato (primeira aba)

const ATIVIDADE_DO_CADASTRO: Record<string, string> = { resgate: "Resgate", afugentamento: "Afugentamento", na: "Apoio" };

/** Primeira aba: contrato, gestor, grupo, equipe do contrato, atividade, empresa, função, profissional e status. So le quem tem nome. */
export function lerCadastroPorContrato(ws: XLSX.WorkSheet): { pessoas: PessoaCadastro[]; semPessoa: PosicaoCadastro[]; contratos: ContratoImportado[] } {
  const { linhas, numero } = lerLinhasNumeradas(ws);
  const ch = acharCabecalho(linhas, ["projeto", "grupo", "equipe / projeto"]);
  if (!ch) throw new Error("A primeira aba não tem as colunas PROJETO, GRUPO e EQUIPE / PROJETO.");
  const c = ch.cab;
  const iId = col(c, "id");
  const iProj = col(c, "projeto");
  const iGestor = col(c, "gestor mrn");
  const iGrupo = col(c, "grupo");
  const iEquipe = col(c, "equipe / projeto");
  const iAtiv = col(c, "resgate / afugentamento");
  const iEmp = col(c, "empresa");
  const iCargo = col(c, "carg / funcao", "cargo / funcao");
  const iProfis = col(c, "profissionais", "profissional");
  const iStatus = col(c, "status");
  const pessoas: PessoaCadastro[] = [];
  const semPessoa: PosicaoCadastro[] = [];
  let ordem = 0;
  const contratos = new Map<string, ContratoImportado>();
  let projetoAnterior = "";
  let equipeAtual = "";
  // cada celula de equipe (mesclada) abre um bloco: o mesmo nome pode se repetir em blocos diferentes e sao equipes diferentes
  let bloco = 0;
  for (let li = ch.indice + 1; li < linhas.length; li++) {
    const r = linhas[li];
    const projeto = texto(r[iProj]);
    const cargo = texto(r[iCargo]);
    if (!projeto && !cargo) continue;
    if (projeto) {
      const ja = contratos.get(projeto) ?? { codigo: projeto, gestor: null, cliente: null };
      if (!ja.gestor) ja.gestor = textoOuNulo(r[iGestor]);
      contratos.set(projeto, ja);
    }
    // o nome da equipe so vem na 1a linha de cada bloco; as linhas seguintes herdam
    if (projeto !== projetoAnterior) {
      projetoAnterior = projeto;
      equipeAtual = "";
      bloco++;
    }
    const nomeEquipe = texto(r[iEquipe]);
    if (nomeEquipe !== "") {
      equipeAtual = nomeEquipe;
      bloco++;
    }
    const id = iId >= 0 ? textoOuNulo(r[iId]) : null;
    const linha = numero[li];
    const bruto = texto(r[iProfis]);
    const n = normalizar(bruto);
    ordem++;
    if (n === "" || n === "em contratacao" || n === "vago" || n === "vaga") {
      // posicao sem pessoa: em contratacao = vaga aberta; em branco com status Vigente = preenchida sem nome informado
      const contratando = n === "em contratacao" || normalizar(r[iStatus]) === "em contratacao" || n === "vago" || n === "vaga";
      semPessoa.push({
        contrato: projeto,
        gestor: textoOuNulo(r[iGestor]),
        grupo: textoOuNulo(r[iGrupo]),
        equipeContrato: equipeAtual || null,
        atividade: ATIVIDADE_DO_CADASTRO[normalizar(r[iAtiv])] ?? (texto(r[iAtiv]) || "Resgate"),
        empresa: texto(r[iEmp]) || "—",
        cargo: cargo || "—",
        status: contratando ? "Em contratação" : interpretarStatus(r[iStatus], null, null).status,
        tipo: contratando ? "contratacao" : "branco",
        ordem,
        linha,
        id,
        bloco,
      });
      continue;
    }
    // "Marcelo (Férias)": o parentese e status, nao parte do nome
    const paren = /\(([^)]*)\)/.exec(bruto);
    const nome = bruto.replace(/\([^)]*\)/g, "").replace(/\s+/g, " ").trim();
    let st = interpretarStatus(r[iStatus], null, null);
    if (paren) {
      const dopar = interpretarStatus(paren[1], null, null);
      if (dopar.status !== "Vigente") st = { ...dopar, observacao: dopar.observacao ?? paren[1] };
    }
    const grupo = textoOuNulo(r[iGrupo]);
    const atividade = ATIVIDADE_DO_CADASTRO[normalizar(r[iAtiv])] ?? (texto(r[iAtiv]) || "Resgate");
    pessoas.push({
      nome,
      contrato: projeto,
      gestor: textoOuNulo(r[iGestor]),
      grupo,
      equipeContrato: equipeAtual || null,
      atividade,
      empresa: texto(r[iEmp]) || "—",
      cargo: cargo || "—",
      status: st.status,
      observacao: st.observacao,
      ordem,
      linha,
      id,
      bloco,
    });
  }
  return { pessoas, semPessoa, contratos: [...contratos.values()] };
}

// ---------------------------------------------------------------- planilha-base do sistema

const STATUS_CONHECIDOS = ["Vigente", "Apto com restrição", "Afastado", "Em contratação", "Desmobilizado"];

function lerBaseUnificada(wb: XLSX.WorkBook, nomeAba: string): ResultadoImportacao {
  const avisos: string[] = [];
  const linhas = lerLinhas(wb.Sheets[nomeAba]);
  const ch = acharCabecalho(linhas, ["cod. equipe", "profissional", "posicao"])!;
  const c = ch.cab;
  const iNum = col(c, "nº", "no", "n");
  const iContrato = col(c, "contrato");
  const iGestor = col(c, "gestor mrn");
  const iGrupo = col(c, "grupo");
  const iEquipe = col(c, "equipe");
  const iCod = col(c, "cod. equipe");
  const iAtiv = col(c, "atividade");
  const iEmp = col(c, "empresa");
  const iCargo = col(c, "cargo / funcao");
  const iNivel = col(c, "nivel");
  const iNome = col(c, "profissional");
  const iPos = col(c, "posicao");
  const iStatus = col(c, "status");
  const i4x4 = col(c, "direcao 4x4");
  const iViat = col(c, "viatura");
  const iCtPessoa = col(c, "contrato da pessoa");
  const iCtAtual = col(c, "contrato atual (outro)");
  const iDisp = col(c, "disponivel a partir de");
  const iDestino = col(c, "destino");
  const iObs = col(c, "observacao");
  const iOrigem = col(c, "origem");
  const iConf = col(c, "conferir");

  // equipes: a aba EQUIPES manda; na falta dela, a primeira linha de cada codigo
  const equipes = new Map<string, EquipeImportada>();
  const abaEq = wb.SheetNames.find((n) => normalizar(n) === "equipes");
  if (abaEq) {
    const le = lerLinhas(wb.Sheets[abaEq]);
    const ce = acharCabecalho(le, ["cod. equipe", "equipe"]);
    if (ce) {
      const k = ce.cab;
      for (const r of le.slice(ce.indice + 1)) {
        const cod = texto(r[col(k, "cod. equipe")]);
        if (!cod) continue;
        const grupo = texto(r[col(k, "grupo")]) || "Fauna";
        equipes.set(cod, {
          codigo: cod,
          nome: texto(r[col(k, "equipe")]) || cod,
          projeto: texto(r[col(k, "contrato")]) || PROJETO_A_DEFINIR,
          contratoConfirmado: true,
          gestor: textoOuNulo(r[col(k, "gestor mrn")]),
          grupo,
          status: texto(r[col(k, "status")]) || "Ativa",
          local: textoOuNulo(r[col(k, "local / frente")]),
          observacao: textoOuNulo(r[col(k, "observacao")]),
          inicio: paraDia(r[col(k, "inicio")]),
          fim: paraDia(r[col(k, "fim")]),
        });
      }
    }
  }

  const vagas: VagaImportada[] = [];
  const ocupantes = new Map<string, number>();
  const posicaoPorChave = new Map<string, VagaImportada>(); // codigo|nome -> vaga (para ligar as ausencias)
  for (const r of linhas.slice(ch.indice + 1)) {
    const cod = texto(r[iCod]);
    const cargo = texto(r[iCargo]);
    if (!cod || !cargo) continue;
    if (!equipes.has(cod)) {
      equipes.set(cod, {
        codigo: cod,
        nome: texto(r[iEquipe]) || cod,
        projeto: texto(r[iContrato]) || PROJETO_A_DEFINIR,
        contratoConfirmado: true,
        gestor: textoOuNulo(r[iGestor]),
        grupo: cod === CODIGO_RESERVA ? "Apoio" : texto(r[iGrupo]) || "Fauna",
        status: "Ativa",
      });
    }
    const posicao = normalizar(r[iPos]);
    let nome = textoOuNulo(r[iNome]);
    let semNome = posicao === "sem nome informado";
    if (posicao === "vaga aberta") {
      nome = null;
      semNome = false;
    }
    if (nome) semNome = false;
    if (!nome && posicao === "com nome") avisos.push(`${cod} (${cargo}): a posição diz "Com nome" mas o nome está em branco; ficou como vaga aberta.`);
    const statusBruto = texto(r[iStatus]);
    const status = STATUS_CONHECIDOS.includes(statusBruto) ? statusBruto : interpretarStatus(statusBruto, null, null).status;
    const dir = normalizar(r[i4x4]);
    const viatura = textoOuNulo(r[iViat]);
    const n = Number(r[iNum]);
    const v: VagaImportada = {
      numero: Number.isFinite(n) && texto(r[iNum]) !== "" ? n : null,
      equipeCodigo: cod,
      atividade: texto(r[iAtiv]) || "Resgate",
      empresa: texto(r[iEmp]),
      cargo,
      nome,
      status,
      observacao: textoOuNulo(r[iObs]),
      ausencia: null,
      nivel: textoOuNulo(r[iNivel]),
      direcao4x4: dir === "sim" ? true : dir === "nao" ? false : null,
      carroRef: viatura ? `${cod}#${viatura}` : null,
      contrato: textoOuNulo(r[iCtPessoa]),
      grupo: textoOuNulo(r[iGrupo]),
      contratoAtual: textoOuNulo(r[iCtAtual]),
      disponivelAPartir: paraDia(r[iDisp]),
      destino: textoOuNulo(r[iDestino]),
      semNome,
      origem: textoOuNulo(r[iOrigem]),
      conferir: textoOuNulo(r[iConf]),
    };
    vagas.push(v);
    if (viatura && nome) ocupantes.set(`${cod}#${viatura}`, (ocupantes.get(`${cod}#${viatura}`) ?? 0) + 1);
    if (nome) posicaoPorChave.set(`${cod}|${normalizar(nome)}`, v);
  }
  if (vagas.length === 0) throw new Error('A aba "BASE" não tem nenhuma posição.');

  // viaturas: a aba VIATURAS manda (placa, modelo, 4x4); na falta dela, as citadas na BASE
  const veiculos = new Map<string, VeiculoImportado>();
  const abaVt = wb.SheetNames.find((n) => normalizar(n) === "viaturas");
  if (abaVt) {
    const lv = lerLinhas(wb.Sheets[abaVt]);
    const cv = acharCabecalho(lv, ["cod. equipe", "viatura"]);
    if (cv) {
      const k = cv.cab;
      for (const r of lv.slice(cv.indice + 1)) {
        const cod = texto(r[col(k, "cod. equipe")]);
        const ident = texto(r[col(k, "viatura")]);
        if (!cod || !ident) continue;
        const d4 = normalizar(r[col(k, "4x4")]);
        veiculos.set(`${cod}#${ident}`, {
          ref: `${cod}#${ident}`,
          identificacao: ident,
          equipeCodigo: cod,
          ocupantes: ocupantes.get(`${cod}#${ident}`) ?? 0,
          placa: textoOuNulo(r[col(k, "placa")]),
          modelo: textoOuNulo(r[col(k, "modelo")]),
          tracao4x4: d4 === "sim" ? true : d4 === "nao" ? false : null,
          status: textoOuNulo(r[col(k, "status")]),
        });
      }
    }
  }
  for (const v of vagas) {
    if (v.carroRef && !veiculos.has(v.carroRef)) {
      const [cod, ident] = v.carroRef.split("#");
      veiculos.set(v.carroRef, { ref: v.carroRef, identificacao: ident, equipeCodigo: cod, ocupantes: ocupantes.get(v.carroRef) ?? 0 });
    }
  }

  // ausencias (ferias com datas...), ligadas pela equipe e pelo nome
  const abaAu = wb.SheetNames.find((n) => normalizar(n) === "ausencias");
  if (abaAu) {
    const la = lerLinhas(wb.Sheets[abaAu]);
    const ca = acharCabecalho(la, ["cod. equipe", "profissional", "tipo"]);
    if (ca) {
      const k = ca.cab;
      for (const r of la.slice(ca.indice + 1)) {
        const alvo = posicaoPorChave.get(`${texto(r[col(k, "cod. equipe")])}|${normalizar(r[col(k, "profissional")])}`);
        const ini = paraDia(r[col(k, "inicio")]);
        const fim = paraDia(r[col(k, "fim")]);
        const tipo = texto(r[col(k, "tipo")]);
        if (!alvo || !ini || !fim || !tipo || ini > fim) continue;
        (alvo.ausencias ??= []).push({ tipo, inicio: ini, fim });
      }
    }
  }

  // contratos
  const contratos = new Map<string, ContratoImportado>();
  const abaCt = wb.SheetNames.find((n) => normalizar(n) === "contratos");
  if (abaCt) {
    const lc = lerLinhas(wb.Sheets[abaCt]);
    const cc = acharCabecalho(lc, ["contrato", "gestor mrn"]);
    if (cc) {
      const k = cc.cab;
      for (const r of lc.slice(cc.indice + 1)) {
        const cod = texto(r[col(k, "contrato")]);
        if (!cod) continue;
        contratos.set(cod, { codigo: cod, gestor: textoOuNulo(r[col(k, "gestor mrn")]), cliente: textoOuNulo(r[col(k, "cliente")]), nome: textoOuNulo(r[col(k, "nome / descricao")]), local: textoOuNulo(r[col(k, "local")]), observacao: textoOuNulo(r[col(k, "observacao")]) });
      }
    }
  }
  for (const e of equipes.values()) if (e.projeto && e.projeto !== PROJETO_A_DEFINIR && e.codigo !== CODIGO_RESERVA && !contratos.has(e.projeto)) contratos.set(e.projeto, { codigo: e.projeto, gestor: e.gestor, cliente: null });

  return { formato: "base", equipes: [...equipes.values()], vagas, veiculos: [...veiculos.values()], contratos: [...contratos.values()], avisos };
}

// ---------------------------------------------------------------- formato "DIVISÃO DE EQUIPES"

const PROJETO_A_DEFINIR = "A definir";
/** Codigo da reserva de pessoas vindas de outro contrato; nao e uma equipe de campo. */
export const CODIGO_RESERVA = "APOIO";

/** Na aba da divisao, "Vago" e vaga aberta; celula em BRANCO e posicao preenchida cujo nome nao foi informado (auxiliares Coopermoura/MRN). */
function situacaoDoNome(v: unknown): { nome: string | null; semNome: boolean } {
  const n = normalizar(v);
  if (n === "vago" || n === "vaga") return { nome: null, semNome: false };
  if (n === "") return { nome: null, semNome: true };
  return { nome: texto(v), semNome: false };
}

/** "Acaba LT 10/10" -> data do ultimo dia (dd/mm do ano de referencia). */
export function ultimoDiaDeTexto(texto_: unknown, ano: number): Dia | null {
  const m = /(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/.exec(String(texto_ ?? ""));
  if (!m) return null;
  const a = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : ano;
  const dia = `${a}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return dataValida(dia) ? dia : null;
}

function lerDivisaoDeEquipes(wb: XLSX.WorkBook, aba: string, opcoes: OpcoesLeitura): ResultadoImportacao {
  const avisos: string[] = [];
  const { linhas, numero } = lerLinhasNumeradas(wb.Sheets[aba]);
  const ch = acharCabecalho(linhas, ["atividade", "empresa", "equipe", "cargo / funcao", "nome profissionais"]);
  if (!ch) throw new Error('Aba "DIVISÃO DE EQUIPES" sem as colunas ATIVIDADE, EMPRESA, EQUIPE, Cargo / Função e NOME PROFISSIONAIS.');
  const c = ch.cab;
  const iTime = col(c, "atividade");
  const iEmp = col(c, "empresa");
  const iAtiv = col(c, "equipe");
  const iNivel = col(c, "nivel");
  const iCargo = col(c, "cargo / funcao");
  const iNome = col(c, "nome profissionais");
  const i4x4 = col(c, "direcao 4x4");
  const iCarro = col(c, "carros");
  const iStatus = col(c, "status atual");

  const equipes: EquipeImportada[] = [];
  const vagas: VagaImportada[] = [];
  const veiculos: VeiculoImportado[] = [];
  const cargosPorEquipe = new Map<string, string[]>();
  let atual: EquipeImportada | null = null;
  let carroAtual: VeiculoImportado | null = null;
  for (let li = ch.indice + 1; li < linhas.length; li++) {
    const r = linhas[li];
    const cargo = texto(r[iCargo]);
    const nomeEquipe = texto(r[iTime]);
    if (!cargo && !nomeEquipe) continue;
    // a equipe (coluna ATIVIDADE) vem mesclada: so a 1a linha traz o nome
    if (nomeEquipe !== "" || !atual) {
      atual = {
        codigo: codigoEquipe(equipes.length + 1),
        projeto: PROJETO_A_DEFINIR,
        gestor: null,
        grupo: "Fauna",
        nome: nomeEquipe || "(sem nome na planilha)",
        contratoConfirmado: true,
        status: "Ativa",
      };
      equipes.push(atual);
      cargosPorEquipe.set(atual.codigo, []);
      carroAtual = null; // a viatura nunca atravessa de uma equipe para outra
    }
    // a viatura (coluna CARROS) tambem vem mesclada: vale ate a proxima viatura citada
    const placa = texto(r[iCarro]);
    if (placa !== "") {
      carroAtual = { ref: `${atual.codigo}#${veiculos.length + 1}`, identificacao: placa, equipeCodigo: atual.codigo, ocupantes: 0 };
      veiculos.push(carroAtual);
    }
    const { nome, semNome } = situacaoDoNome(r[iNome]);
    const st = interpretarStatus(r[iStatus], null, null);
    if (st.aviso) avisos.push(`${atual.nome} (${cargo}): ${st.aviso}`);
    const dir = normalizar(r[i4x4]);
    if (carroAtual && nome) carroAtual.ocupantes++;
    cargosPorEquipe.get(atual.codigo)!.push(cargo);
    vagas.push({
      numero: vagas.length + 1,
      equipeCodigo: atual.codigo,
      atividade: texto(r[iAtiv]) || "Resgate",
      empresa: texto(r[iEmp]),
      cargo,
      nome,
      status: st.status,
      observacao: st.observacao,
      ausencia: null,
      nivel: textoOuNulo(r[iNivel]),
      direcao4x4: dir === "sim" ? true : dir === "nao" ? false : null,
      carroRef: carroAtual?.ref ?? null,
      semNome,
      origem: `Aba 2 · linha ${numero[li]}`,
    });
  }
  if (vagas.length === 0) throw new Error('A aba "DIVISÃO DE EQUIPES" não tem nenhuma vaga.');

  // grupo: Flora so quando algum cargo da equipe for de flora; senao Fauna (todos os cargos desta planilha sao de fauna)
  for (const e of equipes) {
    if ((cargosPorEquipe.get(e.codigo) ?? []).some((x) => normalizar(x).includes("flora"))) e.grupo = "Flora";
  }

  // aba de apoio vindo de outro contrato (ex.: "EQUIPE DE LT PARA APOIO")
  const abaApoio = wb.SheetNames.find((n) => normalizar(n).includes("apoio"));
  if (abaApoio) {
    const { linhas: la, numero: numApoio } = lerLinhasNumeradas(wb.Sheets[abaApoio]);
    const ca = acharCabecalho(la, ["contrato", "funcao", "profissional"]);
    if (ca) {
      const k = ca.cab;
      const ano = opcoes.anoReferencia ?? new Date().getFullYear();
      // As pessoas desta aba NAO formam uma equipe (a planilha tem so as equipes da aba DIVISAO DE EQUIPES):
      // sao reforco de outro contrato que fica livre numa data. Ficam numa reserva unica, sem contrato.
      let reserva: EquipeImportada | undefined;
      for (let lj = ca.indice + 1; lj < la.length; lj++) {
        const r = la[lj];
        const contrato = texto(r[k.get("contrato")!]);
        const prof = textoOuNulo(r[k.get("profissional")!]);
        if (!contrato || !prof) continue;
        if (!reserva) {
          reserva = { codigo: CODIGO_RESERVA, projeto: PROJETO_A_DEFINIR, contratoConfirmado: true, gestor: null, grupo: "Apoio", nome: "FORA DAS EQUIPES DE CAMPO", status: "Ativa" };
          equipes.push(reserva);
        }
        const eq = reserva;
        const transicao = textoOuNulo(r[col(k, "data de tranasicao", "data de transicao")]);
        const ultimo = transicao ? ultimoDiaDeTexto(transicao, ano) : null;
        if (transicao && !ultimo) avisos.push(`Apoio ${contrato} (${prof}): não entendi a data "${transicao}"; ficou sem previsão de liberação.`);
        const partes = (
          [
            ["Liberação pela segurança", textoOuNulo(r[col(k, "liberacao pela seguranca")])],
            ["Mobilizado", textoOuNulo(r[col(k, "mobilizado")])],
            ["Lavra", textoOuNulo(r[col(k, "lavra")])],
            ["Transição", transicao],
          ] as [string, string | null][]
        )
          .filter(([, v]) => v)
          .map(([a, v]) => `${a}: ${v}`);
        vagas.push({
          numero: vagas.length + 1,
          equipeCodigo: eq.codigo,
          atividade: "Apoio",
          empresa: "A informar",
          cargo: texto(r[k.get("funcao")!]) || "A informar",
          nome: prof,
          status: "Vigente",
          observacao: partes.join(" · ") || null,
          ausencia: null,
          contratoAtual: contrato,
          disponivelAPartir: ultimo ? somarDias(ultimo, 1) : null,
          destino: textoOuNulo(r[col(k, "migrar para")]),
          origem: `Aba 3 · linha ${numApoio[lj]}`,
        });
      }
    }
  }
  return { formato: "divisao", equipes, vagas, veiculos, contratos: [], avisos };
}
