// Tipos, formatadores, cores e chamadas de API compartilhados pelas telas.
import { GRUPO_RESERVA, diferencaDias, somarDias, type Dia, type LinhaEquipe } from "@/lib/efetivos/disponibilidade";

export type Equipe = {
  id: string;
  codigo: string;
  nome: string;
  projeto: string;
  gestor: string | null;
  grupo: string;
  local: string | null;
  observacao: string | null;
  status: string;
  inicio: Dia | null;
  fim: Dia | null;
  campanhaId: string | null;
};
export type Contrato = { id: string; codigo: string; nome: string | null; cliente: string | null; gestor: string | null; local: string | null; observacao: string | null; ativo: boolean };
export type Vaga = {
  id: string;
  numero: number | null;
  equipeId: string;
  nome: string | null;
  status: string;
  cargo: string;
  empresa: string;
  atividade: string;
  previsaoInicio: Dia | null;
  nivel: string | null;
  direcao4x4: boolean | null;
  contratoAtual: string | null;
  disponivelAPartir: Dia | null;
  destino: string | null;
  veiculoId: string | null;
  contrato: string | null;
  equipeContrato: string | null;
  grupo: string | null;
  semNome: boolean;
  observacao: string | null;
  origem: string | null;
  conferir: string | null;
};
export type Ausencia = { id: string; vagaId: string; tipo: string; inicio: Dia; fim: Dia; observacao: string | null };
export type Campanha = {
  id: string;
  codigo: string;
  recebidaEm: Dia | null;
  solicitante: string | null;
  projeto: string;
  grupo: string;
  atividade: string;
  local: string | null;
  equipeNome: string | null;
  necessidade: { cargo: string; qtd: number }[];
  inicio: Dia;
  fim: Dia;
  qtdEquipes: number;
  prioridade: string;
  status: string;
  observacao: string | null;
};
export type Alocacao = { id: string; campanhaId: string; vagaId: string; inicio: Dia; fim: Dia };
export type Veiculo = {
  id: string;
  codigo: string;
  identificacao: string;
  placa: string | null;
  modelo: string | null;
  tracao4x4: boolean | null;
  status: string;
  observacao: string | null;
};
export type Movimento = {
  id: string;
  veiculoId: string;
  inicio: Dia;
  fim: Dia | null;
  projeto: string;
  equipeId: string | null;
  campanhaId: string | null;
  local: string | null;
  observacao: string | null;
};
/** Onde a equipe está (ou esteve): contrato e frente, por período. fim vazio = continua. */
export type MovimentoEquipe = { id: string; equipeId: string; inicio: Dia; fim: Dia | null; projeto: string; local: string | null; observacao: string | null };
export type DadosTela = {
  nivel: "ADMIN" | "EDITOR" | "DASHBOARD";
  podeEditar: boolean;
  equipes: Equipe[];
  vagas: Vaga[];
  ausencias: Ausencia[];
  campanhas: Campanha[];
  alocacoes: Alocacao[];
  veiculos: Veiculo[];
  movimentos: Movimento[];
  contratos: Contrato[];
  movimentosEquipe: MovimentoEquipe[];
};

export const A_DEFINIR = "A definir";

/** A reserva de apoio guarda pessoas vindas de outro contrato; nao e uma equipe de campo (a planilha tem 11). */
export const ehReserva = (e: { grupo: string }) => e.grupo === GRUPO_RESERVA;
export const rotuloEquipe = (e: { codigo: string; nome: string; grupo: string }) => (ehReserva(e) ? "Reserva de apoio" : `${e.codigo} · ${e.nome}`);

/** Nome da equipe montada para a campanha (a equipe sempre pertence a uma campanha). */
export const nomeDaEquipeDaCampanha = (c: { codigo: string; equipeNome: string | null }) => c.equipeNome?.trim() || `Equipe ${c.codigo}`;

// ---------------------------------------------------------------- datas

export const fmtDia = (d: Dia | null | undefined) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "—");
export const fmtDiaCurto = (d: Dia) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
export const mesCurto = (d: Dia) => MESES_CURTOS[Number(d.slice(5, 7)) - 1];
const DIAS_SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
export const diaDaSemana = (d: Dia) => DIAS_SEMANA[new Date(`${d}T00:00:00.000Z`).getUTCDay()];
export const ehFimDeSemana = (d: Dia) => {
  const w = new Date(`${d}T00:00:00.000Z`).getUTCDay();
  return w === 0 || w === 6;
};

export function hojeBr(): Dia {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" })
      .formatToParts(new Date())
      .map((x) => [x.type, x.value])
  );
  return `${p.year}-${p.month}-${p.day}`;
}

export function segundaDaSemana(dia: Dia): Dia {
  const dow = new Date(`${dia}T00:00:00.000Z`).getUTCDay(); // 0 = domingo
  return somarDias(dia, -((dow + 6) % 7));
}

/** Numero da semana ISO (S42...). */
export function semanaIso(dia: Dia): number {
  const d = new Date(`${dia}T00:00:00.000Z`);
  const dow = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dow + 3);
  const primeira = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((d.getTime() - primeira.getTime()) / 86400000 - 3 + ((primeira.getUTCDay() + 6) % 7)) / 7);
}

export { diferencaDias, somarDias };

// ---------------------------------------------------------------- cores

// Cada contrato tem sempre a mesma cor, em todas as telas.
const PALETA_CONTRATOS = ["#0A9E7F", "#2F6FDE", "#7C5CD6", "#D9910A", "#E4572E", "#6B8E23", "#C13C8A", "#5B7083"];
export function corDoContrato(projeto: string): string {
  if (!projeto || projeto === A_DEFINIR) return "#9AA8A1";
  let h = 0;
  for (const c of projeto) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETA_CONTRATOS[h % PALETA_CONTRATOS.length];
}

export const SEM_CONTRATO = "Sem contrato";
export const rotuloContrato = (projeto: string) => (!projeto || projeto === A_DEFINIR ? SEM_CONTRATO : projeto);

export type EstadoVisual = "disponivel" | "alocada" | "incompleta" | "ausencia" | "inativa";

/** Estado da equipe num dia, em cinco cores (a planilha so tem disponivel/alocada/indisponivel). */
export function estadoVisual(l: Pick<LinhaEquipe, "disponibilidade" | "situacaoRh">): EstadoVisual {
  if (l.disponibilidade === "DISPONÍVEL") return "disponivel";
  if (l.disponibilidade === "ALOCADA") return "alocada";
  if (l.situacaoRh === "COM VAGAS") return "incompleta";
  if (l.situacaoRh === "COM AUSÊNCIA") return "ausencia";
  return "inativa";
}

export const ESTADO_VISUAL: Record<EstadoVisual, { rotulo: string; cor: string; chip: string; dica: string }> = {
  disponivel: { rotulo: "Disponível", cor: "#0E8F63", chip: "chip-ok", dica: "Completa, sem ausência e sem campanha" },
  alocada: { rotulo: "Alocada", cor: "#1D6FB8", chip: "chip-info", dica: "Já escalada em campanha" },
  incompleta: { rotulo: "Incompleta", cor: "#E0A100", chip: "chip-warn", dica: "Tem vagas sem profissional" },
  ausencia: { rotulo: "Com ausência", cor: "#E63329", chip: "chip-bad", dica: "Alguém da equipe está ausente" },
  inativa: { rotulo: "Inativa", cor: "#9AA8A1", chip: "chip-mute", dica: "Equipe não ativa" },
};

export const CHIP_STATUS_CAMPANHA: Record<string, string> = {
  Nova: "chip-warn",
  "Em análise": "chip-warn",
  Planejada: "chip-info",
  Confirmada: "chip-ok",
  "Em execução": "chip-ok",
  Concluída: "chip-mute",
  Cancelada: "chip-mute",
};
export const COR_STATUS_CAMPANHA: Record<string, string> = {
  Nova: "#B86E00",
  "Em análise": "#B86E00",
  Planejada: "#1D6FB8",
  Confirmada: "#0E8F63",
  "Em execução": "#077A62",
  Concluída: "#9AA8A1",
  Cancelada: "#CBD4CE",
};
export const CHIP_ATENDIMENTO: Record<string, string> = {
  "CAPACIDADE SUFICIENTE": "chip-ok",
  "ATENDIMENTO PARCIAL": "chip-warn",
  "SEM EQUIPE DISPONÍVEL": "chip-bad",
};
export const CHIP_VEICULO: Record<string, string> = {
  "Em operação": "chip-ok",
  Disponível: "chip-info",
  "Em manutenção": "chip-warn",
  Parado: "chip-bad",
  Devolvido: "chip-mute",
};

export const MOTIVO_CONFLITO: Record<string, string> = {
  INEXISTENTE: "não existe mais",
  SEM_PROFISSIONAL: "vaga sem profissional",
  EQUIPE_INATIVA: "equipe inativa",
  AUSENTE: "ausente no período",
  ALOCADA: "já está ocupado no período",
  PERIODO_INVALIDO: "trecho fora do período da campanha",
};

// ---------------------------------------------------------------- chamadas

export async function chamar<T = any>(
  metodo: string,
  url: string,
  corpo?: unknown
): Promise<{ ok: boolean; status: number; dados: T & { error?: string; conflitos?: any[] } }> {
  try {
    const r = await fetch(url, {
      method: metodo,
      headers: corpo instanceof FormData || corpo === undefined ? undefined : { "Content-Type": "application/json" },
      body: corpo === undefined ? undefined : corpo instanceof FormData ? corpo : JSON.stringify(corpo),
    });
    const dados = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, dados };
  } catch {
    return { ok: false, status: 0, dados: { error: "Sem conexão com o servidor. Tente de novo." } as any };
  }
}

export function descreverConflitos(dados: { error?: string; conflitos?: any[] }): string {
  const lista = dados.conflitos?.length ? ` (${dados.conflitos.map((x: any) => `${x.nome ?? "?"}: ${MOTIVO_CONFLITO[x.motivo] ?? x.motivo}`).join("; ")})` : "";
  return `${dados.error ?? "Não foi possível salvar"}${lista}`;
}

// ---------------------------------------------------------------- retornos das rotas (datas em ISO completo -> aaaa-mm-dd)

const dia10 = (v: unknown): Dia | null => (typeof v === "string" && v.length >= 10 ? v.slice(0, 10) : null);

export function campanhaDeApi(c: any): Campanha {
  return {
    id: c.id,
    codigo: c.codigo,
    recebidaEm: dia10(c.recebidaEm),
    solicitante: c.solicitante ?? null,
    projeto: c.projeto,
    grupo: c.grupo,
    atividade: c.atividade,
    local: c.local ?? null,
    equipeNome: c.equipeNome ?? null,
    necessidade: Array.isArray(c.necessidade) ? c.necessidade : [],
    inicio: dia10(c.inicio)!,
    fim: dia10(c.fim)!,
    qtdEquipes: c.qtdEquipes,
    prioridade: c.prioridade,
    status: c.status,
    observacao: c.observacao ?? null,
  };
}

/** Cargos/empresas/atividades já usados, para sugerir nos formulários sem digitar tudo de novo. */
export function valoresUsados(vagas: Vaga[], campo: "cargo" | "empresa" | "atividade"): string[] {
  return Array.from(new Set(vagas.map((v) => v[campo]).filter(Boolean))).sort((a, b) => a.localeCompare(b, "pt-BR"));
}

// ---------------------------------------------------------------- ausencias

export const COR_AUSENCIA: Record<string, string> = {
  Férias: "#2F6FDE",
  Atestado: "#E4572E",
  Afastado: "#8A4B4B",
  Folga: "#7C5CD6",
  Treinamento: "#D9910A",
  Outro: "#6F7E77",
  Ausente: "#6F7E77",
};
export const corDaAusencia = (tipo: string) => COR_AUSENCIA[tipo] ?? "#6F7E77";

export type SituacaoAusencia = "em curso" | "futura" | "encerrada";
export function situacaoDaAusencia(a: { inicio: Dia; fim: Dia }, hoje: Dia): SituacaoAusencia {
  return a.fim < hoje ? "encerrada" : a.inicio > hoje ? "futura" : "em curso";
}

/** Dias corridos de um periodo fechado. */
export const diasDoPeriodo = (inicio: Dia, fim: Dia) => diferencaDias(inicio, fim) + 1;

/** Todos os contratos conhecidos: os cadastrados e os que ja aparecem em equipes, campanhas ou passagens de veiculo. */
export function contratosConhecidos(d: Pick<DadosTela, "contratos" | "equipes" | "campanhas" | "movimentos">): string[] {
  const s = new Set<string>();
  for (const c of d.contratos) if (c.ativo) s.add(c.codigo);
  for (const e of d.equipes) if (e.projeto && e.projeto !== A_DEFINIR) s.add(e.projeto);
  for (const c of d.campanhas) if (c.projeto && c.projeto !== A_DEFINIR) s.add(c.projeto);
  for (const m of d.movimentos) if (m.projeto && m.projeto !== A_DEFINIR) s.add(m.projeto);
  return [...s].sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }));
}
