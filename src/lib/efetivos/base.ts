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
    previsaoInicio?: Dia | null;
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
  "Nº",
  "Contrato",
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
  // a partir daqui: colunas para PREENCHER (ficam em branco; as planilhas não trazem)
  "Previsão de entrada",
  "Contrato atual (outro)",
  "Disponível a partir de",
  "Destino",
  "Observação",
  // o que o sistema calcula e de onde veio cada linha
  "Situação hoje",
  "Origem",
  "Conferir",
  "Contrato da pessoa",
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

  // ---- BASE: o que as planilhas dizem (esquerda) + colunas para PREENCHER (datas e planejamento) + o que o sistema calcula (direita)
  const cab = [...COLUNAS_BASE] as string[];
  const dados = linhas.map((l) => [
    l.numero ?? "",
    l.contrato,
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
    l.previsaoEntrada,
    l.contratoAtual,
    l.disponivelAPartir,
    l.destino,
    l.observacao,
    l.situacaoHoje,
    l.origem,
    l.conferir,
    l.contratoDaPessoa,
  ]);
  XLSX.utils.book_append_sheet(wb, aba([cab, ...dados], [6, 12, 40, 9, 17, 17, 34, 10, 30, 18, 17, 10, 9, 15, 16, 16, 22, 36, 30, 46, 60, 14]), "BASE");

  // ---- EQUIPES: aqui entra o planejamento (início e fim de cada equipe)
  const porEquipe = new Map<string, { posicoes: number; comNome: number; semNome: number; abertas: number; fontes: Map<string, Set<string>> }>();
  for (const l of linhas) {
    const r = porEquipe.get(l.equipeId) ?? { posicoes: 0, comNome: 0, semNome: 0, abertas: 0, fontes: new Map<string, Set<string>>() };
    r.posicoes++;
    if (l.posicao === "Com nome") r.comNome++;
    else if (l.posicao === "Sem nome informado") r.semNome++;
    else r.abertas++;
    for (const { fonte, linha } of origensPorFonte(l.origem)) {
      if (!r.fontes.has(fonte)) r.fontes.set(fonte, new Set());
      r.fontes.get(fonte)!.add(linha);
    }
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
  const faixa = (s: Set<string>) => (s.size === 0 ? "" : `${[...s].map(Number).sort((a, b) => a - b)[0]}–${[...s].map(Number).sort((a, b) => a - b).slice(-1)[0]}`);
  const eqCab = ["Cód. equipe", "Contrato", "Equipe", "Início da equipe", "Fim da equipe", "Local / frente", "Gestor MRN", "Observação", "Status", "Posições", "Com nome", "Sem nome informado", "Vagas abertas", "Viaturas", "Linhas na planilha de origem"];
  const eqDados = d.equipes.map((e) => {
    const r = porEquipe.get(e.id);
    return [
      e.codigo,
      ehReservaDeApoio(e) ? "" : e.projeto,
      e.nome,
      fmtBr(e.inicio),
      fmtBr(e.fim),
      e.local ?? "",
      e.gestor ?? "",
      e.observacao ?? "",
      e.status,
      r?.posicoes ?? 0,
      r?.comNome ?? 0,
      r?.semNome ?? 0,
      r?.abertas ?? 0,
      viaturasPorEquipe.get(e.id)?.size ?? 0,
      r ? [...r.fontes].map(([f, ls]) => `${f} ${faixa(ls)}`).join(" · ") : "",
    ];
  });
  XLSX.utils.book_append_sheet(wb, aba([eqCab, ...eqDados], [11, 12, 44, 15, 15, 20, 14, 36, 10, 9, 9, 12, 12, 9, 34]), "EQUIPES");

  // ---- CONTRATOS
  const res = resumoPorContrato(linhas, new Map([...viaturasPorEquipe].map(([k, v]) => [k, v.size])));
  const ctCodigos = new Set([...d.contratos.filter((c) => c.ativo).map((c) => c.codigo), ...campo.map((e) => e.projeto).filter((p) => p && p !== "A definir")]);
  const ctCab = ["Contrato", "Nome / descrição", "Cliente", "Gestor MRN", "Local", "Equipes", "Posições", "Com nome", "Sem nome informado", "Vagas abertas", "Viaturas", "Observação"];
  const viaturasDoContrato = (cod: string) => {
    const ids = new Set<string>();
    for (const e of campo.filter((x) => x.projeto === cod)) for (const id of viaturasPorEquipe.get(e.id) ?? []) ids.add(id);
    return ids.size;
  };
  const ctDados = [...ctCodigos]
    .sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }))
    .map((cod) => {
      const c = d.contratos.find((x) => x.codigo === cod);
      const r = res.get(cod);
      return [cod, c?.nome ?? "", c?.cliente ?? "", c?.gestor ?? "", c?.local ?? "", r?.equipes ?? 0, r?.posicoes ?? 0, r?.comNome ?? 0, r?.semNome ?? 0, r?.abertas ?? 0, viaturasDoContrato(cod), c?.observacao ?? ""];
    });
  XLSX.utils.book_append_sheet(wb, aba([ctCab, ...ctDados], [14, 28, 12, 14, 18, 9, 10, 10, 12, 12, 9, 36]), "CONTRATOS");

  // ---- VIATURAS: cada viatura UMA vez (a mesma caminhonete em várias equipes não se repete)
  const equipePorCodigoId = new Map(d.equipes.map((e) => [e.id, e]));
  const vtCab = ["Viatura", "Placa", "Modelo", "4x4", "Status", "Observação", "Equipes que usam", "Nº de equipes", "Pessoas"];
  const vtDados = d.veiculos
    .filter((v) => (equipesPorViatura.get(v.id)?.size ?? 0) > 0)
    .sort((a, b) => a.identificacao.localeCompare(b.identificacao, "pt-BR", { numeric: true }))
    .map((v) => {
      const eqs = [...(equipesPorViatura.get(v.id) ?? [])].map((id) => equipePorCodigoId.get(id)?.codigo ?? "").filter(Boolean).sort();
      return [v.identificacao, v.placa ?? "", v.modelo ?? "", v.tracao4x4 === true ? "Sim" : v.tracao4x4 === false ? "Não" : "", v.status, v.observacao ?? "", eqs.join(", "), eqs.length, pessoasPorViatura.get(v.id) ?? 0];
    });
  XLSX.utils.book_append_sheet(wb, aba([vtCab, ...vtDados], [12, 12, 18, 6, 14, 36, 40, 10, 9]), "VIATURAS");

  // ---- AUSÊNCIAS: as com data (que o sistema já tem) + quem a planilha diz que está fora, para preencher o período
  const vagaPorId = new Map(d.vagas.map((v) => [v.id, v]));
  const auCab = ["Cód. equipe", "Equipe", "Profissional", "Tipo", "Início", "Fim", "Observação"];
  const auDados: unknown[][] = d.ausencias
    .map((a) => ({ a, v: vagaPorId.get(a.vagaId) }))
    .filter((x) => !!x.v)
    .map(({ a, v }) => {
      const e = equipePorCodigoId.get(v!.equipeId);
      return [e?.codigo ?? "", e?.nome ?? "", v!.nome ?? "", a.tipo, fmtBr(a.inicio), fmtBr(a.fim), a.observacao ?? ""];
    });
  const comDatas = new Set(d.ausencias.map((a) => a.vagaId));
  for (const l of linhas) {
    // quem a planilha diz que está de férias/afastado e ainda não tem período: a linha já vem com a pessoa e o tipo, falta a data
    if (l.situacao !== "AUSENTE" || !l.nome || comDatas.has(l.vagaId)) continue;
    if (!/f[eé]rias|afastad|restri/i.test(l.status)) continue;
    auDados.push([l.codigoEquipe, l.equipe, l.nome, l.status, "", "", l.observacao]);
  }
  XLSX.utils.book_append_sheet(wb, aba([auCab, ...auDados], [11, 44, 30, 14, 12, 12, 36]), "AUSÊNCIAS");

  // ---- CONFERÊNCIA
  const conf: unknown[][] = [];
  const aba1Usadas = new Set<string>();
  const aba2Usadas = new Set<string>();
  const aba3Usadas = new Set<string>();
  const usadasPorFonte = new Map<string, Set<string>>();
  let nas2 = 0;
  let soAba1 = 0;
  let soAba2 = 0;
  for (const l of linhas) {
    const o = origensDe(l.origem);
    o.aba1.forEach((x) => aba1Usadas.add(x));
    o.aba2.forEach((x) => aba2Usadas.add(x));
    o.aba3.forEach((x) => aba3Usadas.add(x));
    for (const { fonte, linha } of origensPorFonte(l.origem)) {
      if (!usadasPorFonte.has(fonte)) usadasPorFonte.set(fonte, new Set());
      usadasPorFonte.get(fonte)!.add(linha);
    }
    if (!l.contrato) continue;
    if (o.aba1.length && o.aba2.length) nas2++;
    else if (o.aba1.length) soAba1++;
    else if (o.aba2.length) soAba2++;
  }
  const emCampo = linhas.filter((l) => l.contrato);
  conf.push(["CONFERÊNCIA DA BASE", `gerada em ${fmtBr(hoje)}`]);
  conf.push([]);
  if (conferencia?.fontes) {
    // planilhas por contrato: cada linha lida tem de aparecer em exatamente uma posição desta base
    conf.push(["De onde vêm os números (planilha / aba)", "Linhas lidas", "Linhas que estão nesta base", "Situação"]);
    let lidas = 0;
    let naBase = 0;
    for (const f of conferencia.fontes) {
      const usadas = usadasPorFonte.get(f.nome)?.size ?? 0;
      lidas += f.linhas;
      naBase += usadas;
      conf.push([f.nome, f.linhas, usadas, usadas === f.linhas ? "todas as linhas estão na base" : `ATENÇÃO: ${f.linhas - usadas} linha(s) não estão na base`]);
    }
    conf.push(["Total", lidas, naBase, naBase === lidas ? "nenhuma linha ficou de fora" : "ATENÇÃO: confira as linhas que faltam"]);
    if (conferencia.fontes.some((f) => normalizar(f.nome).includes("apoio"))) {
      conf.push(["", "", "", "A aba de apoio que se repete nas planilhas vale uma vez (a origem da posição cita as duas linhas); quem está no apoio e numa equipe é uma pessoa só."]);
    }
  } else {
    conf.push(["De onde vêm os números", "Quantidade", "Observação"]);
    if (conferencia) {
      conf.push(["Linhas na aba 1 (cadastro por contrato)", conferencia.linhasAba1, `${conferencia.equipesAba1} equipes (cada célula mesclada de equipe é uma)`]);
      conf.push(["Linhas na aba 2 (divisão de equipes)", conferencia.linhasAba2, `${conferencia.equipesAba2} equipes`]);
      conf.push(["Linhas na aba 3 (apoio de outro contrato)", conferencia.linhasAba3, "pessoas liberadas de outro contrato"]);
    }
    conf.push(["Linhas da aba 1 usadas nas posições desta base", aba1Usadas.size, conferencia ? `+ ${conferencia.substituidas.length} da aba 1 sem posição equivalente (lista abaixo) = ${aba1Usadas.size + conferencia.substituidas.length}` : ""]);
    conf.push(["Linhas da aba 2 usadas nas posições desta base", aba2Usadas.size, conferencia ? (aba2Usadas.size === conferencia.linhasAba2 ? "todas as linhas da aba 2 estão na base" : "ATENÇÃO: falta linha da aba 2") : ""]);
    conf.push(["Linhas da aba 3 usadas", aba3Usadas.size, ""]);
  }
  conf.push([]);
  conf.push(["Posições das equipes de campo", emCampo.length, `${emCampo.filter((l) => l.posicao === "Com nome").length} com nome · ${emCampo.filter((l) => l.posicao === "Sem nome informado").length} sem nome informado · ${emCampo.filter((l) => l.posicao === "Vaga aberta").length} vagas abertas`]);
  if (!conferencia?.fontes) {
    conf.push(["  nas duas abas (a pessoa/posição aparece nas duas)", nas2, "a posição vale como está na aba 2 (a divisão mais recente)"]);
    conf.push(["  só na aba 2", soAba2, "equipes e posições que o cadastro por contrato não tem"]);
    conf.push(["  só na aba 1", soAba1, "pessoas e posições que a divisão de equipes não tem: conferir"]);
  }
  const equipesCampo = d.equipes.filter((e) => !ehReservaDeApoio(e));
  const comPeriodo = equipesCampo.filter((e) => e.inicio && e.fim).length;
  const semFim = equipesCampo.filter((e) => !e.fim).length;
  conf.push(["Planejamento: equipes com início e fim preenchidos", comPeriodo, `de ${equipesCampo.length} equipes`]);
  conf.push(["Planejamento: equipes sem fim previsto", semFim, "sem o fim o sistema não sabe quando as pessoas da equipe ficam livres: preencher em EQUIPES"]);
  conf.push(["Planejamento: posições com previsão de entrada", emCampo.filter((l) => l.previsaoEntrada).length, `de ${emCampo.filter((l) => l.posicao === "Vaga aberta" || /contrata|mobiliza/i.test(l.status)).length} vagas abertas ou em contratação/mobilização`]);
  conf.push(["Pessoas na reserva (fora das equipes de campo)", linhas.filter((l) => !l.contrato && l.codigoEquipe === "APOIO").length, conferencia?.fontes ? "quem a aba de apoio cita e não está em nenhuma equipe" : "aba 3 + quem sai de uma equipe"]);
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
    [conferencia?.fontes ? `Esta planilha junta as planilhas de acompanhamento por contrato (${[...new Set(conferencia.fontes.map((f) => f.nome.split(" › ")[0]))].join(", ")})${conferencia.fontes.some((f) => normalizar(f.nome).includes("apoio")) ? " e a aba de apoio" : ""}. Só entram dados que estão escritos nas planilhas.` : "Esta planilha junta, numa só, as planilhas de acompanhamento das equipes (cadastro por contrato, divisão de equipes e apoio)."],
    [""],
    ["Posição"],
    ["  Com nome: a posição tem uma pessoa identificada."],
    ["  Sem nome informado: a posição está preenchida, mas o nome não foi informado (ex.: auxiliares da Coopermoura/MRN)."],
    ["  Vaga aberta: a planilha diz \"Vago\" ou \"Em contratação\". É o que precisa ser preenchido."],
    [""],
    ["Situação hoje (calculada)"],
    ["  Em equipe: a pessoa está numa equipe de campo ativa."],
    ["  Disponível: a pessoa está fora de equipe (reserva) ou a equipe dela terminou."],
    ["  Ausente: férias, afastamento INSS, em contratação/mobilização ou restrição; continua na equipe."],
    ["  Em outro contrato: ainda ocupada em outro contrato até a data informada."],
    [""],
    ["Coluna Origem: de onde a linha veio (planilha/aba e linha). Coluna Conferir: o que precisa de confirmação (nunca muda o dado, só avisa)."],
    [""],
    ["O QUE PREENCHER (colunas em amarelo, em branco de propósito: as planilhas não trazem estes dados)"],
    ["  EQUIPES: Início da equipe e Fim da equipe (dd/mm/aaaa), Local / frente, Gestor MRN, Observação. Sem o fim, o sistema não sabe quando as pessoas da equipe ficam livres."],
    ["  BASE: Previsão de entrada (vaga aberta, em contratação ou em mobilização: quando o profissional entra); Contrato atual (outro) + Disponível a partir de (pessoa ainda em outro contrato até a data); Destino; Observação."],
    ["  VIATURAS: Placa, Modelo, 4x4 e Status. Cada viatura aparece uma vez; \"Equipes que usam\" mostra as equipes em que ela está."],
    ["  AUSÊNCIAS: Início e Fim das férias/afastamentos (a lista já traz quem a planilha diz que está fora)."],
    ["Para editar: altere as células e carregue de volta em Base > Importar, ou edite direto no sistema e baixe de novo."],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(leia), "LEIA-ME");
  wb.SheetNames = ["LEIA-ME", "BASE", "EQUIPES", "CONTRATOS", "VIATURAS", "AUSÊNCIAS", "CONFERÊNCIA"];

  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
