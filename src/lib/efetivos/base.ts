// A "base": uma linha por posição, com contrato, equipe, pessoa, viatura e de onde a linha veio nas planilhas.
// É a visão única (as duas abas juntas) que o sistema mostra na tela "Base" e que baixa/lê em Excel.
// Tudo que o sistema conta (Painel, Contratos...) é uma contagem de linhas desta base.
import * as XLSX from "xlsx";
import { temNome, type Dia, type Indice } from "./disponibilidade";
import { clienteDaEquipe } from "./clientes";
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
  veiculos: { id: string; codigo: string; identificacao: string; placa: string | null; modelo: string | null; tracao4x4: boolean | null; status: string; observacao: string | null; cliente?: string | null }[];
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
    return [clienteDaEquipe(e, d.contratos) ?? "", e.projeto === "A definir" ? "" : e.projeto, e.nome, fmtBr(e.inicio), fmtBr(e.fim), e.local ?? "", e.gestor ?? "", e.observacao ?? "", e.status, r?.posicoes ?? 0, r?.comNome ?? 0, r?.semNome ?? 0, r?.abertas ?? 0, viaturasPorEquipe.get(e.id)?.size ?? 0];
  });
  XLSX.utils.book_append_sheet(wb, aba([eqCab, ...eqDados], [9, 12, 44, 15, 15, 20, 14, 36, 10, 9, 9, 12, 12, 9]), "EQUIPES");

  // ---- VIATURAS: cada viatura UMA vez (a mesma caminhonete em várias equipes não se repete)
  const vtCab = ["Viatura", "Placa", "Modelo", "4x4", "Status", "Cliente", "Equipes que usam", "Nº de equipes", "Pessoas", "Observação"];
  const vtDados = d.veiculos
    .slice()
    .sort((a, b) => a.identificacao.localeCompare(b.identificacao, "pt-BR", { numeric: true }))
    .map((v) => {
      const eqs = [...(equipesPorViatura.get(v.id) ?? [])].map((id) => equipePorId.get(id)).filter((e): e is NonNullable<typeof e> => !!e);
      const cliente = v.cliente?.trim() || [...new Set(eqs.map((e) => clienteDaEquipe(e, d.contratos)).filter(Boolean))].join(", ");
      return [v.identificacao, v.placa ?? "", v.modelo ?? "", v.tracao4x4 === true ? "Sim" : v.tracao4x4 === false ? "Não" : "", v.status, cliente, eqs.map((e) => e.nome).join(" · "), eqs.length, pessoasPorViatura.get(v.id) ?? 0, v.observacao ?? ""];
    });
  XLSX.utils.book_append_sheet(wb, aba([vtCab, ...vtDados], [12, 12, 18, 6, 14, 9, 60, 10, 9, 36]), "VIATURAS");

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
    ["3. VIATURAS  Placa, Modelo, 4x4 e Status. Cada viatura aparece uma vez; \"Equipes que usam\" mostra onde ela está."],
    [""],
    ["Cliente: MRN e AGA ficam na mesma base. Para mudar alguém de equipe, de contrato ou de cliente, use o sistema (Pessoas > Mover) — a administração faz o movimento entre clientes."],
    ["Depois de preencher, envie em Base > Enviar planejamento preenchido: o sistema mostra o que vai mudar antes de aplicar. Só preenche; célula em branco não apaga nada."],
    [""],
    [`Conferência: ${emCampo.length} posições nas equipes${nomes.length ? ` (vindas de ${nomes.join(" e ")}; cada linha lida está em uma posição, sem repetir)` : ""}. A coluna Origem diz de qual planilha e linha veio cada uma; Conferir marca o que precisa de confirmação (só avisa, nunca muda o dado).`],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(leia), "LEIA-ME");
  wb.SheetNames = ["LEIA-ME", "PESSOAS", "EQUIPES", "VIATURAS"];

  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
