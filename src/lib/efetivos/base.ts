// A "base": uma linha por posição, com contrato, equipe, pessoa, viatura e de onde a linha veio nas planilhas.
// É a visão única (as duas abas juntas) que o sistema mostra na tela "Base" e que baixa/lê em Excel.
// Tudo que o sistema conta (Painel, Contratos...) é uma contagem de linhas desta base.
import * as XLSX from "xlsx";
import { temNome, type Dia, type Indice } from "./disponibilidade";
import { ROTULO_SITUACAO, ehReservaDeApoio, situacaoDaPosicao, type EquipeDoDia, type Situacao } from "./situacao";

export type DadosBase = {
  equipes: (EquipeDoDia & { gestor: string | null; local: string | null; observacao: string | null })[];
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
    veiculoId: string | null;
    contrato: string | null;
    grupo: string | null;
    semNome: boolean;
    observacao: string | null;
    origem?: string | null;
    conferir?: string | null;
  }[];
  veiculos: { id: string; codigo: string; identificacao: string; placa: string | null; modelo: string | null; tracao4x4: boolean | null; status: string; observacao: string | null }[];
  ausencias: { id: string; vagaId: string; tipo: string; inicio: Dia; fim: Dia; observacao: string | null }[];
  contratos: { codigo: string; nome: string | null; cliente: string | null; gestor: string | null; local: string | null; observacao: string | null; ativo: boolean }[];
  movimentos?: { veiculoId: string; inicio: Dia; fim: Dia | null; projeto: string; equipeId: string | null }[];
};

export type ConferenciaDaImportacao = {
  linhasAba1: number;
  linhasAba2: number;
  linhasAba3: number;
  equipesAba1: number;
  equipesAba2: number;
  substituidas: { origem: string; descricao: string; equipe: string }[];
};

export const COLUNAS_BASE = [
  "Nº",
  "Contrato",
  "Gestor MRN",
  "Grupo",
  "Equipe",
  "Cód. equipe",
  "Atividade",
  "Empresa",
  "Cargo / Função",
  "Nível",
  "Profissional",
  "Posição",
  "Status",
  "Direção 4x4",
  "Viatura",
  "Contrato da pessoa",
  "Contrato atual (outro)",
  "Disponível a partir de",
  "Destino",
  "Observação",
  "Situação hoje",
  "Origem",
  "Conferir",
] as const;

export type LinhaBase = {
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

export const fmtBr = (d: Dia | null | undefined) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "");

/** Uma linha por posição, na ordem das equipes (reserva por último). */
export function linhasDaBase(d: DadosBase, idx: Pick<Indice, "ausencias">, hoje: Dia): LinhaBase[] {
  const equipePorId = new Map(d.equipes.map((e) => [e.id, e]));
  const ordemEquipe = new Map(d.equipes.map((e, i) => [e.id, ehReservaDeApoio(e) ? 9999 : i]));
  const veiculoPorId = new Map(d.veiculos.map((v) => [v.id, v]));
  const linhas = d.vagas.map((v): LinhaBase => {
    const e = equipePorId.get(v.equipeId);
    const sit = situacaoDaPosicao(v, e, idx, hoje);
    const posicao: LinhaBase["posicao"] = temNome(v) ? "Com nome" : v.semNome ? "Sem nome informado" : "Vaga aberta";
    return {
      numero: v.numero,
      contrato: e && !ehReservaDeApoio(e) ? e.projeto : "",
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

/**
 * A planilha-base: BASE (uma linha por posição) + EQUIPES + CONTRATOS + VIATURAS + AUSÊNCIAS + CONFERÊNCIA.
 * É o mesmo formato que o sistema lê de volta ("Base unificada").
 */
export function montarPlanilhaBase(d: DadosBase, idx: Pick<Indice, "ausencias">, hoje: Dia, conferencia?: ConferenciaDaImportacao | null): Buffer {
  const linhas = linhasDaBase(d, idx, hoje);
  const campo = d.equipes.filter((e) => !ehReservaDeApoio(e));
  const equipePorId = new Map(d.equipes.map((e) => [e.id, e]));
  const veiculoPorId = new Map(d.veiculos.map((v) => [v.id, v]));
  const wb = XLSX.utils.book_new();

  // ---- BASE
  const cab = [...COLUNAS_BASE] as string[];
  const dados = linhas.map((l) => [
    l.numero ?? "",
    l.contrato,
    l.gestor,
    l.grupo,
    l.equipe,
    l.codigoEquipe,
    l.atividade,
    l.empresa,
    l.cargo,
    l.nivel,
    l.nome,
    l.posicao,
    l.status,
    l.direcao4x4,
    l.viatura,
    l.contratoDaPessoa,
    l.contratoAtual,
    l.disponivelAPartir,
    l.destino,
    l.observacao,
    l.situacaoHoje,
    l.origem,
    l.conferir,
  ]);
  XLSX.utils.book_append_sheet(wb, aba([cab, ...dados], [6, 12, 12, 8, 40, 9, 15, 17, 34, 10, 30, 18, 17, 10, 9, 14, 16, 16, 22, 36, 30, 46, 60]), "BASE");

  // ---- EQUIPES
  const porEquipe = new Map<string, { posicoes: number; comNome: number; semNome: number; abertas: number; ab1: Set<string>; ab2: Set<string> }>();
  for (const l of linhas) {
    const r = porEquipe.get(l.equipeId) ?? { posicoes: 0, comNome: 0, semNome: 0, abertas: 0, ab1: new Set<string>(), ab2: new Set<string>() };
    r.posicoes++;
    if (l.posicao === "Com nome") r.comNome++;
    else if (l.posicao === "Sem nome informado") r.semNome++;
    else r.abertas++;
    const o = origensDe(l.origem);
    o.aba1.forEach((x) => r.ab1.add(x));
    o.aba2.forEach((x) => r.ab2.add(x));
    porEquipe.set(l.equipeId, r);
  }
  const viaturasPorEquipe = new Map<string, Set<string>>();
  for (const v of d.vagas) {
    if (!v.veiculoId) continue;
    if (!viaturasPorEquipe.has(v.equipeId)) viaturasPorEquipe.set(v.equipeId, new Set());
    viaturasPorEquipe.get(v.equipeId)!.add(v.veiculoId);
  }
  const faixa = (s: Set<string>) => (s.size === 0 ? "" : `${[...s].map(Number).sort((a, b) => a - b)[0]}–${[...s].map(Number).sort((a, b) => a - b).slice(-1)[0]}`);
  const eqCab = ["Cód. equipe", "Equipe", "Contrato", "Gestor MRN", "Grupo", "Status", "Início", "Fim", "Local / frente", "Posições", "Com nome", "Sem nome informado", "Vagas abertas", "Viaturas", "Linhas na aba 2", "Linhas na aba 1", "Observação"];
  const eqDados = d.equipes.map((e) => {
    const r = porEquipe.get(e.id);
    return [e.codigo, e.nome, ehReservaDeApoio(e) ? "" : e.projeto, e.gestor ?? "", e.grupo, e.status, fmtBr(e.inicio), fmtBr(e.fim), e.local ?? "", r?.posicoes ?? 0, r?.comNome ?? 0, r?.semNome ?? 0, r?.abertas ?? 0, viaturasPorEquipe.get(e.id)?.size ?? 0, r ? faixa(r.ab2) : "", r ? faixa(r.ab1) : "", e.observacao ?? ""];
  });
  XLSX.utils.book_append_sheet(wb, aba([eqCab, ...eqDados], [11, 44, 12, 12, 8, 12, 11, 11, 20, 9, 9, 12, 12, 9, 14, 14, 36]), "EQUIPES");

  // ---- CONTRATOS
  const res = resumoPorContrato(linhas, new Map([...viaturasPorEquipe].map(([k, v]) => [k, v.size])));
  const ctCodigos = new Set([...d.contratos.filter((c) => c.ativo).map((c) => c.codigo), ...campo.map((e) => e.projeto).filter((p) => p && p !== "A definir")]);
  const ctCab = ["Contrato", "Nome / descrição", "Cliente", "Gestor MRN", "Local", "Equipes", "Posições", "Com nome", "Sem nome informado", "Vagas abertas", "Viaturas", "Observação"];
  const ctDados = [...ctCodigos]
    .sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }))
    .map((cod) => {
      const c = d.contratos.find((x) => x.codigo === cod);
      const r = res.get(cod);
      return [cod, c?.nome ?? "", c?.cliente ?? "", c?.gestor ?? "", c?.local ?? "", r?.equipes ?? 0, r?.posicoes ?? 0, r?.comNome ?? 0, r?.semNome ?? 0, r?.abertas ?? 0, r?.viaturas ?? 0, c?.observacao ?? ""];
    });
  XLSX.utils.book_append_sheet(wb, aba([ctCab, ...ctDados], [14, 28, 12, 14, 18, 9, 10, 10, 12, 12, 9, 36]), "CONTRATOS");

  // ---- VIATURAS
  const vtCab = ["Cód. equipe", "Equipe", "Viatura", "Placa", "Modelo", "4x4", "Status", "Pessoas na viatura", "Observação"];
  const vtDados: unknown[][] = [];
  for (const [equipeId, ids] of viaturasPorEquipe) {
    const e = equipePorId.get(equipeId);
    for (const vid of ids) {
      const v = veiculoPorId.get(vid);
      if (!v || !e) continue;
      const ocupantes = d.vagas.filter((x) => x.veiculoId === vid && x.equipeId === equipeId && temNome(x)).length;
      vtDados.push([e.codigo, e.nome, v.identificacao, v.placa ?? "", v.modelo ?? "", v.tracao4x4 === true ? "Sim" : v.tracao4x4 === false ? "Não" : "", v.status, ocupantes, v.observacao ?? ""]);
    }
  }
  XLSX.utils.book_append_sheet(wb, aba([vtCab, ...vtDados], [11, 44, 10, 12, 18, 6, 14, 12, 30]), "VIATURAS");

  // ---- AUSÊNCIAS
  const vagaPorId = new Map(d.vagas.map((v) => [v.id, v]));
  const auCab = ["Cód. equipe", "Equipe", "Profissional", "Tipo", "Início", "Fim", "Observação"];
  const auDados = d.ausencias
    .map((a) => ({ a, v: vagaPorId.get(a.vagaId) }))
    .filter((x) => !!x.v)
    .map(({ a, v }) => {
      const e = equipePorId.get(v!.equipeId);
      return [e?.codigo ?? "", e?.nome ?? "", v!.nome ?? "", a.tipo, fmtBr(a.inicio), fmtBr(a.fim), a.observacao ?? ""];
    });
  XLSX.utils.book_append_sheet(wb, aba([auCab, ...auDados], [11, 44, 30, 14, 11, 11, 36]), "AUSÊNCIAS");

  // ---- CONFERÊNCIA
  const conf: unknown[][] = [];
  const aba1Usadas = new Set<string>();
  const aba2Usadas = new Set<string>();
  const aba3Usadas = new Set<string>();
  let nas2 = 0;
  let soAba1 = 0;
  let soAba2 = 0;
  for (const l of linhas) {
    const o = origensDe(l.origem);
    o.aba1.forEach((x) => aba1Usadas.add(x));
    o.aba2.forEach((x) => aba2Usadas.add(x));
    o.aba3.forEach((x) => aba3Usadas.add(x));
    if (!l.contrato) continue;
    if (o.aba1.length && o.aba2.length) nas2++;
    else if (o.aba1.length) soAba1++;
    else if (o.aba2.length) soAba2++;
  }
  const emCampo = linhas.filter((l) => l.contrato);
  conf.push(["CONFERÊNCIA DA BASE", `gerada em ${fmtBr(hoje)}`]);
  conf.push([]);
  conf.push(["De onde vêm os números", "Quantidade", "Observação"]);
  if (conferencia) {
    conf.push(["Linhas na aba 1 (cadastro por contrato)", conferencia.linhasAba1, `${conferencia.equipesAba1} equipes (cada célula mesclada de equipe é uma)`]);
    conf.push(["Linhas na aba 2 (divisão de equipes)", conferencia.linhasAba2, `${conferencia.equipesAba2} equipes`]);
    conf.push(["Linhas na aba 3 (apoio de outro contrato)", conferencia.linhasAba3, "pessoas liberadas de outro contrato"]);
  }
  conf.push(["Linhas da aba 1 usadas nas posições desta base", aba1Usadas.size, conferencia ? `+ ${conferencia.substituidas.length} da aba 1 sem posição equivalente (lista abaixo) = ${aba1Usadas.size + conferencia.substituidas.length}` : ""]);
  conf.push(["Linhas da aba 2 usadas nas posições desta base", aba2Usadas.size, conferencia ? (aba2Usadas.size === conferencia.linhasAba2 ? "todas as linhas da aba 2 estão na base" : "ATENÇÃO: falta linha da aba 2") : ""]);
  conf.push(["Linhas da aba 3 usadas", aba3Usadas.size, ""]);
  conf.push([]);
  conf.push(["Posições das equipes de campo", emCampo.length, `${emCampo.filter((l) => l.posicao === "Com nome").length} com nome · ${emCampo.filter((l) => l.posicao === "Sem nome informado").length} sem nome informado · ${emCampo.filter((l) => l.posicao === "Vaga aberta").length} vagas abertas`]);
  conf.push(["  nas duas abas (a pessoa/posição aparece nas duas)", nas2, "a posição vale como está na aba 2 (a divisão mais recente)"]);
  conf.push(["  só na aba 2", soAba2, "equipes e posições que o cadastro por contrato não tem"]);
  conf.push(["  só na aba 1", soAba1, "pessoas e posições que a divisão de equipes não tem: conferir"]);
  conf.push(["Pessoas na reserva (fora das equipes de campo)", linhas.filter((l) => !l.contrato && l.codigoEquipe === "APOIO").length, "aba 3 + quem sai de uma equipe"]);
  conf.push([]);
  const paraConferir = linhas.filter((l) => l.conferir);
  conf.push([`Para conferir (${paraConferir.length})`, "Equipe", "Profissional / posição", "Origem", "O que conferir"]);
  for (const l of paraConferir) conf.push(["", l.equipe, l.nome || `${l.cargo} (${l.posicao.toLowerCase()})`, l.origem, l.conferir]);
  if (conferencia && conferencia.substituidas.length) {
    conf.push([]);
    conf.push([`Linhas da aba 1 sem posição equivalente (${conferencia.substituidas.length})`, "Equipe", "O que era", "Origem", "Por que ficou de fora"]);
    for (const s of conferencia.substituidas) conf.push(["", s.equipe, s.descricao, s.origem, "As vagas abertas desta equipe vêm da aba 2 (a divisão mais recente)"]);
  }
  XLSX.utils.book_append_sheet(wb, aba(conf, [52, 40, 40, 44, 70], false), "CONFERÊNCIA");

  // ---- LEIA-ME
  const leia = [
    ["BASE ÚNICA DAS EQUIPES DE CAMPO"],
    [""],
    ["Uma linha por posição (vaga) das equipes. Contrato -> equipe -> posição -> pessoa."],
    ["Esta planilha junta as duas abas da planilha do Samuel (cadastro por contrato + divisão de equipes) e a aba de apoio."],
    [""],
    ["Posição"],
    ["  Com nome: a posição tem uma pessoa identificada."],
    ["  Sem nome informado: a posição está preenchida, mas o nome não foi informado (ex.: auxiliares da Coopermoura/MRN)."],
    ["  Vaga aberta: a planilha diz \"Vago\" ou \"Em contratação\". É o que precisa ser preenchido."],
    [""],
    ["Situação hoje (calculada)"],
    ["  Em equipe: a pessoa está numa equipe de campo ativa."],
    ["  Disponível: a pessoa está fora de equipe (reserva) ou a equipe dela terminou."],
    ["  Ausente: férias, afastamento INSS ou restrição; continua na equipe."],
    ["  Em outro contrato: ainda ocupada em outro contrato até a data informada."],
    [""],
    ["Coluna Origem: de onde a linha veio (aba e linha da planilha original). Coluna Conferir: o que precisa de confirmação."],
    ["Para editar: altere as células e carregue de volta em Base > Importar, ou edite direto no sistema e baixe de novo."],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(leia), "LEIA-ME");
  wb.SheetNames = ["LEIA-ME", "BASE", "EQUIPES", "CONTRATOS", "VIATURAS", "AUSÊNCIAS", "CONFERÊNCIA"];

  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
