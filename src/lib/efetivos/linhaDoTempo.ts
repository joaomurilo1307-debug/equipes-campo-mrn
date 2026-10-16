// Linha do tempo das equipes: regras puras (sem tela) de escala, janela e posição das barras. Datas "AAAA-MM-DD".
// A escala é macro (trimestre ou mês) ou semanal; cada escala tem um tamanho fixo de pixel por dia, então a barra de uma equipe
// de 6 meses tem sempre o mesmo comprimento e dá para comparar equipes só olhando.
import { diferencaDias, somarDias, type Dia } from "./disponibilidade";

export type Escala = "trimestre" | "mes" | "semana";

export const ROTULO_ESCALA: Record<Escala, string> = { trimestre: "Trimestres", mes: "Meses", semana: "Semanas" };

/** Pixels (CSS) de cada dia em cada escala. */
export const PX_POR_DIA: Record<Escala, number> = { trimestre: 1.5, mes: 3.4, semana: 11 };

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const MESES_LONGOS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

export const nomeDoMes = (mes: number, longo = false) => (longo ? MESES_LONGOS : MESES)[mes - 1];

export const primeiroDiaDoMes = (d: Dia): Dia => `${d.slice(0, 7)}-01`;
export function ultimoDiaDoMes(d: Dia): Dia {
  const y = Number(d.slice(0, 4));
  const m = Number(d.slice(5, 7));
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}
/** Somar meses a um mês "AAAA-MM". */
export function somarMeses(mes: string, n: number): string {
  const y = Number(mes.slice(0, 4));
  const m = Number(mes.slice(5, 7)) - 1 + n;
  const d = new Date(Date.UTC(y, m, 1));
  return d.toISOString().slice(0, 7);
}
export const mesDe = (d: Dia) => d.slice(0, 7);
/** Os meses de "AAAA-MM" a "AAAA-MM", inclusive. */
export function mesesEntre(de: string, ate: string): string[] {
  const out: string[] = [];
  for (let m = de; m <= ate && out.length < 600; m = somarMeses(m, 1)) out.push(m);
  return out;
}
/** Segunda-feira da semana do dia. */
export function inicioDaSemana(d: Dia): Dia {
  const dow = new Date(`${d}T00:00:00.000Z`).getUTCDay(); // 0 = domingo
  return somarDias(d, -((dow + 6) % 7));
}
const inicioDoTrimestre = (d: Dia): Dia => {
  const m = Number(d.slice(5, 7));
  const q = Math.floor((m - 1) / 3) * 3 + 1;
  return `${d.slice(0, 4)}-${String(q).padStart(2, "0")}-01`;
};

export type ColunaTempo = {
  inicio: Dia;
  fim: Dia;
  dias: number;
  /** o que aparece na coluna: "out", "S42", "T4" */
  rotulo: string;
  /** o agrupador de cima: o ano (meses/trimestres) ou o mês (semanas) */
  superior: string;
  /** muda quando o agrupador de cima muda */
  chave: string;
};

/** As colunas da escala que cobrem de `de` a `ate` (as pontas são levadas para o começo/fim da coluna). */
export function colunasDaEscala(escala: Escala, de: Dia, ate: Dia): ColunaTempo[] {
  const out: ColunaTempo[] = [];
  if (ate < de) return out;
  if (escala === "mes") {
    for (const m of mesesEntre(mesDe(de), mesDe(ate))) {
      const ini = `${m}-01`;
      const fim = ultimoDiaDoMes(ini);
      out.push({ inicio: ini, fim, dias: diferencaDias(ini, fim) + 1, rotulo: nomeDoMes(Number(m.slice(5, 7))), superior: m.slice(0, 4), chave: m.slice(0, 4) });
    }
  } else if (escala === "trimestre") {
    for (let ini = inicioDoTrimestre(de); ini <= ate && out.length < 200; ) {
      const fim = ultimoDiaDoMes(`${somarMeses(mesDe(ini), 2)}-01`);
      out.push({ inicio: ini, fim, dias: diferencaDias(ini, fim) + 1, rotulo: `T${Math.floor((Number(ini.slice(5, 7)) - 1) / 3) + 1}`, superior: ini.slice(0, 4), chave: ini.slice(0, 4) });
      ini = somarDias(fim, 1);
    }
  } else {
    for (let ini = inicioDaSemana(de); ini <= ate && out.length < 400; ini = somarDias(ini, 7)) {
      // o mês de cima é o do meio da semana (quinta-feira), como o calendário ISO
      const quinta = somarDias(ini, 3);
      out.push({ inicio: ini, fim: somarDias(ini, 6), dias: 7, rotulo: ini.slice(8, 10), superior: `${nomeDoMes(Number(quinta.slice(5, 7)), true)} de ${quinta.slice(0, 4)}`, chave: quinta.slice(0, 7) });
    }
  }
  return out;
}

export type Janela = { de: Dia; ate: Dia };

/**
 * A janela que vale olhar por padrão: do menor entre "um mês atrás" e o início da primeira equipe até o maior entre
 * "oito meses à frente" e o fim da última equipe; no máximo 30 meses, sempre com pelo menos 10.
 */
export function janelaPadrao(equipes: { inicio?: Dia | null; fim?: Dia | null }[], hoje: Dia): Janela {
  const minimo = primeiroDiaDoMes(`${somarMeses(mesDe(hoje), -1)}-01`);
  const maximo = ultimoDiaDoMes(`${somarMeses(mesDe(hoje), 8)}-01`);
  let de = minimo;
  let ate = maximo;
  for (const e of equipes) {
    if (e.inicio && e.inicio < de) de = primeiroDiaDoMes(e.inicio);
    if (e.fim && e.fim > ate) ate = ultimoDiaDoMes(e.fim);
    if (e.inicio && e.inicio > ate) ate = ultimoDiaDoMes(e.inicio);
  }
  // não deixa uma data errada (ano 2099) esticar a tela
  const teto = ultimoDiaDoMes(`${somarMeses(mesDe(de), 29)}-01`);
  if (ate > teto) ate = teto;
  return { de, ate };
}

export type PosicaoBarra = {
  /** pixels da esquerda da janela */
  esquerda: number;
  largura: number;
  /** o lado não tem data: a barra vai até a borda e some */
  abertoEsq: boolean;
  abertoDir: boolean;
  /** a barra está fora da janela */
  fora: boolean;
};

/** Onde desenhar o período [inicio, fim] numa janela. Lado sem data vai até a borda da janela (e marca "aberto"). */
export function posicaoNaJanela(inicio: Dia | null, fim: Dia | null, janela: Janela, pxPorDia: number): PosicaoBarra {
  const ini = inicio ?? janela.de;
  const f = fim ?? janela.ate;
  const fora = f < janela.de || ini > janela.ate;
  const iniVis = ini < janela.de ? janela.de : ini;
  const fimVis = f > janela.ate ? janela.ate : f;
  const esquerda = diferencaDias(janela.de, iniVis) * pxPorDia;
  const largura = Math.max(0, (diferencaDias(iniVis, fimVis) + 1) * pxPorDia);
  return { esquerda, largura, abertoEsq: !inicio, abertoDir: !fim, fora };
}

export const larguraDaJanela = (janela: Janela, pxPorDia: number) => (diferencaDias(janela.de, janela.ate) + 1) * pxPorDia;

/** "5 meses", "3 semanas", "12 dias": o tamanho do período, para escrever dentro da barra. */
export function duracaoTexto(inicio: Dia | null, fim: Dia | null): string {
  if (!inicio || !fim || fim < inicio) return "";
  const dias = diferencaDias(inicio, fim) + 1;
  if (dias >= 60) {
    const meses = dias / 30.4;
    return meses >= 10 ? `${Math.round(meses)} meses` : `${(Math.round(meses * 10) / 10).toString().replace(".", ",")} meses`;
  }
  if (dias >= 14) return `${Math.round(dias / 7)} semanas`;
  return `${dias} dia${dias === 1 ? "" : "s"}`;
}

export type FaseDaEquipe = "futura" | "andamento" | "encerrada" | "sem_datas" | "sem_fim" | "sem_inicio";

/** Em que momento da vida a equipe está no dia. */
export function faseDaEquipe(e: { inicio?: Dia | null; fim?: Dia | null }, dia: Dia): FaseDaEquipe {
  if (!e.inicio && !e.fim) return "sem_datas";
  if (e.inicio && dia < e.inicio) return "futura";
  if (e.fim && dia > e.fim) return "encerrada";
  if (!e.fim) return "sem_fim";
  if (!e.inicio) return "sem_inicio";
  return "andamento";
}

/** A equipe tem alguma parte do período dentro de [de, ate]? Equipe sem nenhuma data conta como ativa. */
export function equipeNoPeriodo(e: { inicio?: Dia | null; fim?: Dia | null }, de: Dia, ate: Dia): boolean {
  if (e.inicio && e.inicio > ate) return false;
  if (e.fim && e.fim < de) return false;
  return true;
}

/** A equipe está ativa no dia? Lado sem data é aberto. */
export const equipeAtivaNoDia = (e: { inicio?: Dia | null; fim?: Dia | null }, dia: Dia) => (!e.inicio || e.inicio <= dia) && (!e.fim || dia <= e.fim);
