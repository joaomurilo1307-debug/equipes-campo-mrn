// A "base": uma linha por posição, com contrato, equipe, pessoa, viatura e de onde a linha veio nas planilhas.
// É a visão única (as duas abas juntas) que o sistema mostra na tela "Base" e que baixa/lê em Excel.
// Tudo que o sistema conta (Painel, Contratos...) é uma contagem de linhas desta base.
import * as XLSX from "xlsx";
import { temNome, type Dia, type Indice } from "./disponibilidade";
import { clienteDaEquipe } from "./clientes";
import { conferirUso } from "./usosVeiculo";
import { ROTULO_SITUACAO, ehReservaDeApoio, situacaoDaPosicao, type EquipeDoDia, type Situacao } from "./situacao";

export type DadosBase = {
  equipes: (EquipeDoDia & { gestor: string | null; local: string | null; observacao: string | null; cliente?: string | null })[];
  vagas: {
    id: string;
    numero: number | null;
    equipeId: string;
    nome: string | null;
    status: string;
    cargo: string;
    empresa: string;
    atividade: string;
    nivel: string | null;
    direcao4x4: boolean | null;
    contratoAtual: string | null;
    disponivelAPartir: Dia | null;
    destino: string | null;
    previsaoInicio?: Dia | null;
    veiculoId: string | null;
    contrato: string | null;
    grupo: string | null;
    semNome: boolean;
    observacao: string | null;
    origem?: string | null;
    conferir?: string | null;
  }[];
  veiculos: { id: string; codigo: string; identificacao: string; placa: string | null; modelo: string | null; tracao4x4: boolean | null; status: string; observacao: string | null; cliente?: string | null; substituidoPorId?: string | null; trocaEm?: Dia | null }[];
  /** a viatura em cada equipe e por quanto tempo (a que só aparece nas pessoas entra sem datas) */
  usos?: { veiculoId: string; equipeId: string; inicio: Dia | null; fim: Dia | null }[];
  ausencias: { id: string; vagaId: string; tipo: string; inicio: Dia; fim: Dia; observacao: string | null }[];
  contratos: { codigo: string; nome: string | null; cliente: string | null; gestor: string | null; local: string | null; observacao: string | null; ativo: boolean }[];
  movimentos?: { veiculoId: string; inicio: Dia; fim: Dia | null; projeto: string; equipeId: string | null }[];
};

export type ConferenciaDaImportacao = {
  // formato cruzado (duas abas de uma mesma planilha)
  linhasAba1?: number;
  linhasAba2?: number;
  linhasAba3?: number;
  equipesAba1?: number;
  equipesAba2?: number;
  // formato por contrato (uma planilha por contrato): cada aba lida e quantas linhas ela trouxe
  fontes?: { nome: string; linhas: number }[];
  substituidas: { origem: string; descricao: string; equipe: string }[];
};

export const COLUNAS_BASE = [
  "Cliente",
  "Contrato",
  "Equipe",
  "Profissional",
  "Empresa",
  "Função",
  "Nível",
  "Atividade",
  "Direção 4x4",
  "Viatura",
  // a partir daqui: o que se PREENCHE (em branco; as planilhas não trazem)
  "Status",
  "Status: início",
  "Status: fim",
  "Previsão de entrada",
  "Contrato atual (outro)",
  "Disponível a partir de",
  "Destino",
  "Observação",
  // o que o sistema calcula e de onde veio cada linha
  "Situação hoje",
  "Posição",
  "Origem",
  "Conferir",
  "Nº",
] as const;

export type LinhaBase = {
  cliente: string;
  /** posição da reserva (pessoa fora de qualquer equipe) */
  reserva: boolean;
  /** o status como aparece no Excel: o da ausência em vigor (ou a próxima), senão o status da pessoa */
  statusExibido: string;
  statusInicio: string;
  statusFim: string;
  numero: number | null;
  contrato: string;
  gestor: string;
  grupo: string;
  equipe: string;
  codigoEquipe: string;
  atividade: string;
  empresa: string;
  cargo: string;
  nivel: string;
  nome: string;
  posicao: "Com nome" | "Sem nome informado" | "Vaga aberta";
  status: string;
  direcao4x4: string;
  viatura: string;
  contratoDaPessoa: string;
  contratoAtual: string;
  disponivelAPartir: string;
  destino: string;
  previsaoEntrada: string;
  observacao: string;
  situacaoHoje: string;
  /** a mesma situação como código, para filtrar */
  situacao: Situacao;
  origem: string;
  conferir: string;
  /** só para a tela: ids para abrir/editar */
  vagaId: string;
  equipeId: string;
};

const normalizar = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export const fmtBr = (d: Dia | null | undefined) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "");

/** Uma linha por posição, na ordem das equipes (reserva por último). */
export function linhasDaBase(d: DadosBase, idx: Pick<Indice, "ausencias">, hoje: Dia): LinhaBase[] {
  const equipePorId = new Map(d.equipes.map((e) => [e.id, e]));
  const ordemEquipe = new Map(d.equipes.map((e, i) => [e.id, ehReservaDeApoio(e) ? 9999 : i]));
  const veiculoPorId = new Map(d.veiculos.map((v) => [v.id, v]));
  const ausenciasDaVaga = new Map<string, DadosBase["ausencias"]>();
  for (const a of d.ausencias) ausenciasDaVaga.set(a.vagaId, [...(ausenciasDaVaga.get(a.vagaId) ?? []), a]);
  // a ausência que vale para mostrar: a de hoje; senão a próxima; ausência que já passou não aparece
  const ausenciaEmFoco = (vagaId: string) => {
    const l = (ausenciasDaVaga.get(vagaId) ?? []).filter((a) => a.fim >= hoje).sort((x, y) => x.inicio.localeCompare(y.inicio));
    return l.find((a) => a.inicio <= hoje) ?? l[0] ?? null;
  };
  const linhas = d.vagas.map((v): LinhaBase => {
    const e = equipePorId.get(v.equipeId);
    const foco = ausenciaEmFoco(v.id);
    const sit = situacaoDaPosicao(v, e, idx, hoje);
    const posicao: LinhaBase["posicao"] = temNome(v) ? "Com nome" : v.semNome ? "Sem nome informado" : "Vaga aberta";
    return {
      cliente: e ? clienteDaEquipe(e, d.contratos) ?? "" : "",
      reserva: !e || ehReservaDeApoio(e),
      statusExibido: foco ? foco.tipo : v.status,
      statusInicio: foco ? fmtBr(foco.inicio) : "",
      statusFim: foco ? fmtBr(foco.fim) : "",
      numero: v.numero,
      contrato: e && !ehReservaDeApoio(e) && e.projeto !== "A definir" ? e.projeto : "",
      gestor: e?.gestor ?? "",
      grupo: v.grupo ?? e?.grupo ?? "",
      equipe: e ? (ehReservaDeApoio(e) ? "Reserva (fora das equipes de campo)" : e.nome) : "",
      codigoEquipe: e?.codigo ?? "",
      atividade: v.atividade,
      empresa: v.empresa,
      cargo: v.cargo,
      nivel: v.nivel ?? "",
      nome: v.nome ?? "",
      posicao,
      status: v.status,
      direcao4x4: v.direcao4x4 === true ? "Sim" : v.direcao4x4 === false ? "Não" : "",
      viatura: v.veiculoId ? veiculoPorId.get(v.veiculoId)?.identificacao ?? "" : "",
      contratoDaPessoa: v.contrato ?? "",
      contratoAtual: v.contratoAtual ?? "",
      disponivelAPartir: fmtBr(v.disponivelAPartir),
      destino: v.destino ?? "",
      previsaoEntrada: fmtBr(v.previsaoInicio),
      observacao: v.observacao ?? "",
      situacaoHoje: sit.motivo && sit.situacao !== "VAGA_ABERTA" && sit.situacao !== "SEM_NOME" ? `${ROTULO_SITUACAO[sit.situacao]} · ${sit.motivo}` : ROTULO_SITUACAO[sit.situacao],
      situacao: sit.situacao,
      origem: v.origem ?? "",
      conferir: v.conferir ?? "",
      vagaId: v.id,
      equipeId: v.equipeId,
    };
  });
  const posVaga = new Map(d.vagas.map((v, i) => [v.id, i]));
  return linhas.sort((a, b) => (ordemEquipe.get(a.equipeId) ?? 0) - (ordemEquipe.get(b.equipeId) ?? 0) || (posVaga.get(a.vagaId) ?? 0) - (posVaga.get(b.vagaId) ?? 0));
}

// ---------------------------------------------------------------- origem (quais linhas das abas viraram quais posições)

/** "Aba 2 · linha 5 + Aba 1 · ID 3 (linha 5): Isabelle" -> { aba1: ["3"], aba2: ["5"], aba3: [] } */
export function origensDe(texto: string): { aba1: string[]; aba2: string[]; aba3: string[] } {
  const out = { aba1: [] as string[], aba2: [] as string[], aba3: [] as string[] };
  for (const parte of texto.split(" + ")) {
    const m1 = /^Aba 1 · ID (\S+) \(linha (\d+)\)/.exec(parte.trim());
    if (m1) out.aba1.push(m1[2]);
    const m2 = /^Aba 2 · linha (\d+)/.exec(parte.trim());
    if (m2) out.aba2.push(m2[1]);
    const m3 = /^Aba 3 · linha (\d+)/.exec(parte.trim());
    if (m3) out.aba3.push(m3[1]);
  }
  return out;
}

/** Cada parte da origem como fonte + linha: "3686_PNM · linha 5" -> 3686_PNM / 5; "Aba 1 · ID 3 (linha 7)" -> Aba 1 / 7. */
export function origensPorFonte(texto: string): { fonte: string; linha: string }[] {
  const out: { fonte: string; linha: string }[] = [];
  for (const parte of texto.split(" + ")) {
    const t = parte.trim();
    const m1 = /^(Aba \d) · ID \S+ \(linha (\d+)\)/.exec(t);
    if (m1) {
      out.push({ fonte: m1[1], linha: m1[2] });
      continue;
    }
    const m = /^(.+?) · linha (\d+)/.exec(t);
    if (m) out.push({ fonte: m[1], linha: m[2] });
  }
  return out;
}

export type ResumoBase = {
  equipes: number;
  posicoes: number;
  comNome: number;
  semNome: number;
  abertas: number;
  viaturas: number;
};

export function resumoPorContrato(linhas: LinhaBase[], veiculosPorEquipe: Map<string, number>): Map<string, ResumoBase & { equipesIds: Set<string> }> {
  const m = new Map<string, ResumoBase & { equipesIds: Set<string> }>();
  for (const l of linhas) {
    if (!l.contrato) continue;
    const r = m.get(l.contrato) ?? { equipes: 0, posicoes: 0, comNome: 0, semNome: 0, abertas: 0, viaturas: 0, equipesIds: new Set<string>() };
    r.posicoes++;
    if (l.posicao === "Com nome") r.comNome++;
    else if (l.posicao === "Sem nome informado") r.semNome++;
    else r.abertas++;
    r.equipesIds.add(l.equipeId);
    m.set(l.contrato, r);
  }
  for (const r of m.values()) {
    r.equipes = r.equipesIds.size;
    r.viaturas = [...r.equipesIds].reduce((s, id) => s + (veiculosPorEquipe.get(id) ?? 0), 0);
  }
  return m;
}

// ---------------------------------------------------------------- Excel

const larguras = (cols: number[]) => cols.map((wch) => ({ wch }));

function aba(linhas: unknown[][], largs: number[], filtro = true): XLSX.WorkSheet {
  const ws = XLSX.utils.aoa_to_sheet(linhas);
  ws["!cols"] = larguras(largs);
  if (filtro && linhas.length > 1) ws["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: linhas.length - 1, c: linhas[0].length - 1 } }) };
  return ws;
}

export const COLUNAS_MOVIMENTACOES = ["Equipe", "Contrato", "Função", "Profissional", "Situação hoje", "Viatura", "Ação", "Equipe destino", "Novo status", "Até (férias, afastamento)", "A partir de", "Observação", "Conferência"] as const;
export const ACOES_MOVIMENTACAO = ["Mover para outra equipe", "Liberar para outra equipe", "Desmobilizar (desligar)", "Mudar status"] as const;
export const TITULO_MOVIMENTACOES = "MOVIMENTAÇÕES · mover, liberar, desmobilizar ou mudar o status das pessoas";
export const AJUDA_MOVIMENTACOES = "Na linha da pessoa, escolha a Ação. Mover: escolha também a Equipe destino. Mudar status: escolha o Novo status (para férias e afastamento, preencha também A partir de e Até). Depois envie a planilha em Base > Enviar planejamento preenchido.";

/** A aba MOVIMENTAÇÕES: as pessoas de cada equipe, uma equipe depois da outra, com as colunas amarelas para mexer em quem for. */
function abaMovimentacoes(d: DadosBase, linhas: LinhaBase[]): XLSX.WorkSheet {
  const larg = COLUNAS_MOVIMENTACOES.length;
  const vazio = () => Array.from({ length: larg }, () => "" as string | number);
  const linhasDaAba: unknown[][] = [[TITULO_MOVIMENTACOES], [AJUDA_MOVIMENTACOES], [""], [...COLUNAS_MOVIMENTACOES]];
  const porEquipe = new Map<string, LinhaBase[]>();
  for (const l of linhas) porEquipe.set(l.equipeId, [...(porEquipe.get(l.equipeId) ?? []), l]);
  const blocos: { nome: string; contrato: string; periodo: string; equipeId: string; reserva: boolean }[] = [];
  for (const e of d.equipes.filter((x) => !ehReservaDeApoio(x))) {
    blocos.push({ nome: e.nome, contrato: e.projeto === "A definir" ? "" : e.projeto, periodo: e.inicio || e.fim ? `${e.inicio ? fmtBr(e.inicio) : "?"} a ${e.fim ? fmtBr(e.fim) : "sem fim"}` : "sem datas", equipeId: e.id, reserva: false });
  }
  for (const e of d.equipes.filter((x) => ehReservaDeApoio(x))) blocos.push({ nome: "FORA DAS EQUIPES (disponíveis)", contrato: "", periodo: "", equipeId: e.id, reserva: true });
  for (const b of blocos) {
    const doBloco = porEquipe.get(b.equipeId) ?? [];
    if (b.reserva && doBloco.length === 0) continue;
    const comNome = doBloco.filter((l) => l.posicao === "Com nome").length;
    const abertas = doBloco.filter((l) => l.posicao === "Vaga aberta").length;
    const banner = vazio();
    banner[0] = b.nome;
    banner[1] = b.contrato;
    banner[2] = b.periodo;
    banner[4] = `${comNome} pessoas${abertas ? ` · ${abertas} ${abertas === 1 ? "vaga aberta" : "vagas abertas"}` : ""}`;
    linhasDaAba.push(banner);
    for (const l of doBloco) {
      const r = vazio();
      r[0] = b.reserva ? "(reserva)" : b.nome;
      r[1] = b.contrato;
      r[2] = l.cargo;
      r[3] = l.nome;
      r[4] = l.posicao === "Com nome" ? l.situacaoHoje : l.posicao;
      r[5] = l.viatura;
      linhasDaAba.push(r);
    }
  }
  const ws = XLSX.utils.aoa_to_sheet(linhasDaAba);
  ws["!cols"] = larguras([36, 12, 30, 30, 26, 10, 26, 36, 16, 14, 13, 32, 30]);
  ws["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 3, c: 0 }, e: { r: Math.max(4, linhasDaAba.length - 1), c: larg - 1 } }) };
  return ws;
}

/**
 * A planilha-base, o mínimo de abas para concentrar o preenchimento:
 *   PESSOAS  — uma linha por posição: cadastro geral (cliente, contrato, equipe, pessoa), status e planejamento da pessoa;
 *   EQUIPES  — contrato, início e fim de cada equipe;
 *   VIATURAS — cada viatura uma vez (placa, modelo, quem usa).
 * As colunas em branco que se preenchem (datas, previsões, placas) ficam à vista; o que o sistema calcula vai à direita.
 * É o mesmo formato que o sistema lê de volta.
 */
export function montarPlanilhaBase(d: DadosBase, idx: Pick<Indice, "ausencias">, hoje: Dia, conferencia?: ConferenciaDaImportacao | null): Buffer {
  const linhas = linhasDaBase(d, idx, hoje);
  const campo = d.equipes.filter((e) => !ehReservaDeApoio(e));
  const equipePorId = new Map(d.equipes.map((e) => [e.id, e]));
  const wb = XLSX.utils.book_new();

  // ---- PESSOAS
  const dados = linhas.map((l) => [
    l.cliente,
    l.contrato,
    l.reserva ? "" : l.equipe,
    l.nome,
    l.empresa,
    l.cargo,
    l.nivel,
    l.atividade,
    l.direcao4x4,
    l.viatura,
    l.statusExibido,
    l.statusInicio,
    l.statusFim,
    l.previsaoEntrada,
    l.contratoAtual,
    l.disponivelAPartir,
    l.destino,
    l.observacao,
    l.situacaoHoje,
    l.posicao,
    l.origem,
    l.conferir,
    l.numero ?? "",
  ]);
  XLSX.utils.book_append_sheet(wb, aba([[...COLUNAS_BASE] as string[], ...dados], [9, 12, 40, 30, 17, 34, 10, 17, 10, 9, 17, 12, 12, 14, 16, 16, 22, 36, 30, 18, 46, 60, 6]), "PESSOAS");

  // ---- EQUIPES
  const porEquipe = new Map<string, { posicoes: number; comNome: number; semNome: number; abertas: number }>();
  for (const l of linhas) {
    const r = porEquipe.get(l.equipeId) ?? { posicoes: 0, comNome: 0, semNome: 0, abertas: 0 };
    r.posicoes++;
    if (l.posicao === "Com nome") r.comNome++;
    else if (l.posicao === "Sem nome informado") r.semNome++;
    else r.abertas++;
    porEquipe.set(l.equipeId, r);
  }
  const viaturasPorEquipe = new Map<string, Set<string>>();
  const equipesPorViatura = new Map<string, Set<string>>();
  const pessoasPorViatura = new Map<string, number>();
  for (const v of d.vagas) {
    if (!v.veiculoId) continue;
    if (!viaturasPorEquipe.has(v.equipeId)) viaturasPorEquipe.set(v.equipeId, new Set());
    viaturasPorEquipe.get(v.equipeId)!.add(v.veiculoId);
    if (!equipesPorViatura.has(v.veiculoId)) equipesPorViatura.set(v.veiculoId, new Set());
    equipesPorViatura.get(v.veiculoId)!.add(v.equipeId);
    if (temNome(v)) pessoasPorViatura.set(v.veiculoId, (pessoasPorViatura.get(v.veiculoId) ?? 0) + 1);
  }
  const eqCab = ["Cliente", "Contrato", "Equipe", "Início da equipe", "Fim da equipe", "Local / frente", "Gestor", "Observação", "Status", "Posições", "Com nome", "Sem nome informado", "Vagas abertas", "Viaturas"];
  const eqDados = campo.map((e) => {
    const r = porEquipe.get(e.id);
    return [clienteDaEquipe(e, d.contratos) ?? "", e.projeto === "A definir" ? "" : e.projeto, e.nome, fmtBr(e.inicio), fmtBr(e.fim), e.local ?? "", e.gestor ?? "", e.observacao ?? "", e.status, r?.posicoes ?? 0, r?.comNome ?? 0, r?.semNome ?? 0, r?.abertas ?? 0, new Set([...(d.usos ?? []).filter((u) => u.equipeId === e.id).map((u) => u.veiculoId), ...d.vagas.filter((v) => v.equipeId === e.id && v.veiculoId).map((v) => v.veiculoId!)]).size];
  });
  XLSX.utils.book_append_sheet(wb, aba([eqCab, ...eqDados], [9, 12, 44, 15, 15, 20, 14, 36, 10, 9, 9, 12, 12, 9]), "EQUIPES");

  // ---- VIATURAS: uma linha por viatura e equipe (a mesma viatura pode servir a várias, em momentos diferentes).
  // O cadastro (placa, modelo, 4x4, status, troca) fica na PRIMEIRA linha de cada viatura; o período e a conferência, em cada linha.
  const veiculoPorId = new Map(d.veiculos.map((v) => [v.id, v]));
  const usosDe = new Map<string, { equipeId: string; inicio: Dia | null; fim: Dia | null }[]>();
  const poe = (veiculoId: string, equipeId: string, inicio: Dia | null, fim: Dia | null) => {
    const l = usosDe.get(veiculoId) ?? [];
    const ja = l.find((x) => x.equipeId === equipeId);
    if (ja) {
      ja.inicio ??= inicio;
      ja.fim ??= fim;
    } else l.push({ equipeId, inicio, fim });
    usosDe.set(veiculoId, l);
  };
  for (const u of d.usos ?? []) if (veiculoPorId.has(u.veiculoId) && equipePorId.has(u.equipeId)) poe(u.veiculoId, u.equipeId, u.inicio, u.fim);
  for (const v of d.vagas) if (v.veiculoId && equipePorId.has(v.equipeId) && !ehReservaDeApoio(equipePorId.get(v.equipeId))) poe(v.veiculoId, v.equipeId, null, null);
  const ordemEquipeId = new Map(d.equipes.map((e, i) => [e.id, i]));
  const vtCab = ["Viatura", "Placa", "Modelo", "4x4", "Status", "Cliente", "Equipe que usa", "Contrato", "Início na equipe", "Fim na equipe", "Equipe: início", "Equipe: fim", "Confere com a equipe?", "Pessoas", "Será substituída por", "Troca em", "Observação"];
  const vtDados: unknown[][] = [];
  const notasVt: { linha: number; texto: string }[] = [];
  const substitutaDe = new Map<string, string>(); // viatura prevista -> a que ela vai substituir
  for (const v of d.veiculos) if (v.substituidoPorId) substitutaDe.set(v.substituidoPorId, v.identificacao);
  for (const v of d.veiculos.slice().sort((a, b) => a.identificacao.localeCompare(b.identificacao, "pt-BR", { numeric: true }))) {
    const lista = (usosDe.get(v.id) ?? []).sort((a, b) => (ordemEquipeId.get(a.equipeId) ?? 0) - (ordemEquipeId.get(b.equipeId) ?? 0));
    const substituta = v.substituidoPorId ? veiculoPorId.get(v.substituidoPorId) : null;
    const cliente = v.cliente?.trim() || [...new Set(lista.map((x) => clienteDaEquipe(equipePorId.get(x.equipeId)!, d.contratos)).filter(Boolean))].join(", ");
    const linhasDaViatura = lista.length ? lista : [null];
    linhasDaViatura.forEach((u, i) => {
      const e = u ? equipePorId.get(u.equipeId) : undefined;
      const conf = u && e ? conferirUso(u, { inicio: e.inicio ?? null, fim: e.fim ?? null }).texto : "";
      const primeira = i === 0;
      vtDados.push([
        v.identificacao,
        primeira ? v.placa ?? "" : "",
        primeira ? v.modelo ?? "" : "",
        primeira ? (v.tracao4x4 === true ? "Sim" : v.tracao4x4 === false ? "Não" : "") : "",
        primeira ? v.status : "",
        primeira ? cliente : "",
        e?.nome ?? "",
        e && e.projeto !== "A definir" ? e.projeto : "",
        u ? fmtBr(u.inicio) : "",
        u ? fmtBr(u.fim) : "",
        e ? fmtBr(e.inicio) : "",
        e ? fmtBr(e.fim) : "",
        conf,
        u ? d.vagas.filter((x) => x.veiculoId === v.id && x.equipeId === u.equipeId && temNome(x)).length : 0,
        primeira ? substituta?.identificacao ?? "" : "",
        primeira ? fmtBr(v.trocaEm) : "",
        primeira ? v.observacao ?? "" : "",
      ]);
      if (primeira) {
        // a troca e o comentário da planilha ficam como comentário na célula da viatura (e continuam no sistema)
        const partes: string[] = [];
        if (substituta) partes.push(`Será substituída pela ${substituta.identificacao}${v.trocaEm ? ` a partir de ${fmtBr(v.trocaEm)}` : ""}.`);
        if (substitutaDe.has(v.id)) partes.push(`Vai substituir a ${substitutaDe.get(v.id)}.`);
        if (v.observacao) partes.push(v.observacao);
        if (partes.length) notasVt.push({ linha: vtDados.length, texto: partes.join(" ") });
      }
    });
  }
  const wsVt = aba([vtCab, ...vtDados], [12, 12, 18, 6, 14, 9, 44, 12, 14, 14, 13, 13, 34, 8, 16, 12, 30]);
  for (const n of notasVt) {
    const ref = XLSX.utils.encode_cell({ r: n.linha, c: 0 });
    if (wsVt[ref]) (wsVt[ref] as XLSX.CellObject).c = [{ a: "Sistema", t: n.texto, T: false } as XLSX.Comments[number]];
  }
  XLSX.utils.book_append_sheet(wb, wsVt, "VIATURAS");

  // ---- MOVIMENTAÇÕES: as pessoas por equipe, para mover, liberar, desmobilizar ou mudar o status
  XLSX.utils.book_append_sheet(wb, abaMovimentacoes(d, linhas), "MOVIMENTAÇÕES");

  // ---- LEIA-ME: a sequência em poucas linhas
  const emCampo = linhas.filter((l) => !l.reserva);
  const nomes = (conferencia?.fontes ?? []).filter((f) => !/apoio/i.test(f.nome)).map((f) => f.nome);
  const leia = [
    ["BASE DAS EQUIPES DE CAMPO"],
    [""],
    ["Três abas concentram tudo. Preencha só as colunas em amarelo; o resto o sistema calcula."],
    [""],
    ["1. EQUIPES   Início da equipe e Fim da equipe (dd/mm/aaaa). Sem o fim, o sistema não sabe quando as pessoas ficam livres. Também: Local / frente, Gestor, Observação."],
    ["2. PESSOAS   Status (Vigente, Férias, Afastado, Em contratação, Em mobilização...), e o período do status (Status: início / Status: fim) para férias e afastamentos."],
    ["              Previsão de entrada (vaga aberta ou em contratação), Contrato atual (outro) + Disponível a partir de (pessoa ainda em outro contrato), Destino, Observação."],
    ["4. MOVIMENTAÇÕES  As pessoas de cada equipe, uma equipe depois da outra. Na linha da pessoa escolha a Ação (Mover para outra equipe, Liberar, Desmobilizar, Mudar status), a Equipe destino e a data."],
    ["3. VIATURAS  Placa, Modelo, 4x4 e Status (na primeira linha de cada viatura). Uma linha por viatura e equipe: Início na equipe e Fim na equipe dizem por quanto tempo ela fica lá, e a coluna \"Confere com a equipe?\" compara com o período da equipe."],
    ["              Troca de viatura: \"Será substituída por\" + \"Troca em\". A viatura que vai chegar aparece como Prevista e depois é movimentada no sistema (Viaturas > Trocar)."],
    [""],
    ["Cliente: MRN e AGA ficam na mesma base. Para mudar alguém de equipe, de contrato ou de cliente, use o sistema (Pessoas > Mover) — a administração faz o movimento entre clientes."],
    ["Depois de preencher, envie em Base > Enviar planejamento preenchido: o sistema mostra o que vai mudar antes de aplicar. Só preenche; célula em branco não apaga nada."],
    [""],
    [`Conferência: ${emCampo.length} posições nas equipes${nomes.length ? ` (vindas de ${nomes.join(" e ")}; cada linha lida está em uma posição, sem repetir)` : ""}. A coluna Origem diz de qual planilha e linha veio cada uma; Conferir marca o que precisa de confirmação (só avisa, nunca muda o dado).`],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(leia), "LEIA-ME");
  wb.SheetNames = ["LEIA-ME", "MOVIMENTAÇÕES", "PESSOAS", "EQUIPES", "VIATURAS"];

  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

/**
 * A base EM BRANCO de um cliente (ex.: AGA) para preencher do zero. Tem as mesmas três abas da base e o mesmo formato que o sistema
 * lê; o Cliente já vem escrito em todas as linhas. Linha sem Função (em PESSOAS) ou sem Equipe/Viatura é ignorada.
 */
export function montarModeloEmBranco(cliente: string, linhas = { pessoas: 300, equipes: 40, viaturas: 100 }): Buffer {
  const wb = XLSX.utils.book_new();
  const brancas = (n: number, colunas: number) => Array.from({ length: n }, () => [cliente, ...Array.from({ length: colunas - 1 }, () => null)]);

  const peCab = ["Cliente", "Contrato", "Equipe", "Profissional", "Empresa", "Função", "Nível", "Atividade", "Direção 4x4", "Viatura", "Posição", "Status", "Status: início", "Status: fim", "Previsão de entrada", "Contrato atual (outro)", "Disponível a partir de", "Destino", "Observação"];
  XLSX.utils.book_append_sheet(wb, aba([peCab, ...brancas(linhas.pessoas, peCab.length)], [9, 12, 40, 30, 17, 34, 10, 17, 10, 12, 18, 17, 12, 12, 14, 16, 16, 22, 36]), "PESSOAS");

  const eqCab = ["Cliente", "Contrato", "Equipe", "Início da equipe", "Fim da equipe", "Local / frente", "Gestor", "Observação", "Status", "Posições", "Com nome", "Sem nome informado", "Vagas abertas", "Viaturas"];
  XLSX.utils.book_append_sheet(wb, aba([eqCab, ...brancas(linhas.equipes, eqCab.length)], [9, 12, 44, 15, 15, 20, 14, 36, 10, 9, 9, 12, 12, 9]), "EQUIPES");

  const vtCab = ["Viatura", "Placa", "Modelo", "4x4", "Status", "Cliente", "Equipe que usa", "Contrato", "Início na equipe", "Fim na equipe", "Equipe: início", "Equipe: fim", "Confere com a equipe?", "Pessoas", "Será substituída por", "Troca em", "Observação"];
  const vtLinhas = Array.from({ length: linhas.viaturas }, () => vtCab.map((c) => (c === "Cliente" ? cliente : null)));
  XLSX.utils.book_append_sheet(wb, aba([vtCab, ...vtLinhas], [12, 12, 18, 6, 14, 9, 44, 12, 14, 14, 13, 13, 34, 8, 16, 12, 30]), "VIATURAS");

  const movVazias = Array.from({ length: 150 }, () => COLUNAS_MOVIMENTACOES.map(() => null));
  const wsMov = XLSX.utils.aoa_to_sheet([[TITULO_MOVIMENTACOES], [AJUDA_MOVIMENTACOES], [""], [...COLUNAS_MOVIMENTACOES], ...movVazias]);
  wsMov["!cols"] = larguras([36, 12, 30, 30, 26, 10, 26, 36, 16, 14, 13, 32, 30]);
  wsMov["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 3, c: 0 }, e: { r: 153, c: COLUNAS_MOVIMENTACOES.length - 1 } }) };
  XLSX.utils.book_append_sheet(wb, wsMov, "MOVIMENTAÇÕES");

  const leia = [
    [`BASE DAS EQUIPES DE CAMPO — ${cliente} (EM BRANCO, PARA PREENCHER)`],
    [""],
    ["Três abas concentram tudo. Preencha na ordem: EQUIPES, depois PESSOAS, depois VIATURAS. As colunas em amarelo são as que você preenche; as cinzas o Excel calcula sozinho."],
    [""],
    ["1. EQUIPES   Uma linha por equipe: Contrato, Equipe (o nome que vai valer nas outras abas), Início da equipe e Fim da equipe (dd/mm/aaaa), Local / frente, Gestor."],
    ["              Sem o início e o fim, o sistema não consegue desenhar a linha do tempo nem o histograma, e não sabe quando as pessoas e as viaturas ficam livres."],
    ["2. PESSOAS   Uma linha por posição na equipe. Equipe: escolha na lista (vem da aba EQUIPES). Função é obrigatória (linha sem Função é ignorada)."],
    ["              Profissional em branco com Posição = Vaga aberta é uma vaga a preencher; Posição = Sem nome informado é um lugar já ocupado cujo nome ainda não se sabe."],
    ["              Status: Vigente, Férias, Afastado, Em contratação, Em mobilização... Para férias/afastamento preencha também Status: início e Status: fim."],
    ["              Previsão de entrada (vaga em contratação), Contrato atual (outro) + Disponível a partir de (pessoa que ainda está em outro contrato)."],
    ["              Viatura: o nome da viatura que a pessoa usa (o mesmo escrito na aba VIATURAS)."],
    ["3. VIATURAS  Uma linha por viatura e equipe que a usa. Placa, Modelo, 4x4 e Status só na primeira linha de cada viatura."],
    ["              Início na equipe e Fim na equipe: por quanto tempo a viatura fica naquela equipe. A coluna \"Confere com a equipe?\" compara com o início e o fim da equipe e avisa quando não bate."],
    ["              Troca: se a viatura vai ser trocada, escreva em \"Será substituída por\" o nome da nova e em \"Troca em\" a data. A nova pode ser listada em outra linha como Prevista. Comentários vão na célula (botão direito > Inserir comentário)."],
    [""],
    [`Para enviar: um administrador entra no sistema em Base > Importar planilha, escolhe esta planilha e marca \"Conferir antes de importar\"; o sistema mostra o que vai entrar antes de gravar. O Cliente (${cliente}) já está escrito em todas as linhas — não apague.`],
    ["Depois da primeira carga, quem tem acesso do cliente atualiza pelo sistema (ou baixa a base, preenche as colunas amarelas e envia em Base > Enviar planejamento preenchido). Célula em branco nunca apaga o que já está no sistema."],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(leia), "LEIA-ME");
  wb.SheetNames = ["LEIA-ME", "MOVIMENTAÇÕES", "PESSOAS", "EQUIPES", "VIATURAS"];
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
