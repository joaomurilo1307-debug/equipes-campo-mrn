// Geometria do Quadro (Gantt): tudo em "dias desde o início da janela" x largura do dia.
import type { ReactNode } from "react";
import { diferencaDias, type Dia } from "@/lib/efetivos/disponibilidade";
import type { EstadoVisual } from "../comum";

export const ESQ = 296; // largura da coluna fixa da esquerda
export const ALTURA_FAIXA = 26; // altura de cada faixa de barras empilhadas

export type Barra = {
  id: string;
  inicio: Dia;
  fim: Dia;
  rotulo: string;
  cor: string;
  corTexto?: string;
  /** o que aparece quando o mouse passa: texto (a 1ª linha é o título) ou um bloco pronto */
  dica: string | ReactNode;
  listrada?: boolean;
  /** Passagem em aberto (sem data de saída): linha fina e discreta em vez de uma barra grossa até o fim. */
  fina?: boolean;
  onClick?: () => void;
};

/** Distribui barras em faixas para as que se sobrepõem ficarem uma embaixo da outra. */
export function distribuir(barras: Barra[]): { barra: Barra; faixa: number }[] {
  const ordenadas = [...barras].sort((a, b) => a.inicio.localeCompare(b.inicio) || a.fim.localeCompare(b.fim));
  const fimPorFaixa: string[] = [];
  return ordenadas.map((barra) => {
    let faixa = fimPorFaixa.findIndex((f) => f < barra.inicio);
    if (faixa === -1) faixa = fimPorFaixa.length;
    fimPorFaixa[faixa] = barra.fim;
    return { barra, faixa };
  });
}

/** Recorta a barra na janela visível; devolve posição e largura em dias (ou null se estiver fora). */
export function recortar(barra: { inicio: Dia; fim: Dia }, inicioJanela: Dia, fimJanela: Dia): { esq: number; larg: number; cortadaEsq: boolean; cortadaDir: boolean } | null {
  if (barra.fim < inicioJanela || barra.inicio > fimJanela) return null;
  const ini = barra.inicio < inicioJanela ? inicioJanela : barra.inicio;
  const fim = barra.fim > fimJanela ? fimJanela : barra.fim;
  return { esq: diferencaDias(inicioJanela, ini), larg: diferencaDias(ini, fim) + 1, cortadaEsq: barra.inicio < inicioJanela, cortadaDir: barra.fim > fimJanela };
}

/** Junta dias seguidos do mesmo estado em trechos [ini, n]. */
export function compactar(estados: EstadoVisual[]): { ini: number; n: number; estado: EstadoVisual }[] {
  const out: { ini: number; n: number; estado: EstadoVisual }[] = [];
  estados.forEach((e, i) => {
    const ult = out[out.length - 1];
    if (ult && ult.estado === e) ult.n++;
    else out.push({ ini: i, n: 1, estado: e });
  });
  return out;
}
