// Cobertura de cada equipe semana a semana (para o quadro): quantas posições têm alguém presente, quem está ausente,
// quais vagas estão abertas e quem ainda está em outro contrato. Funções puras, sem tela.
import { intersecta, somarDias, temNome, type AusenciaBase, type Dia, type VagaBase } from "./disponibilidade";
import type { EquipeDoDia } from "./situacao";
import { ehReservaDeApoio } from "./situacao";

export type NivelSemana = "completa" | "vagas" | "ausencia" | "ambos" | "fora";

export type DetalheSemana = {
  seg: Dia;
  fim: Dia;
  total: number;
  /** com nome presentes + preenchidas sem nome informado */
  presentes: number;
  semNome: number;
  ausentes: { nome: string | null; cargo: string; tipo: string; de: Dia | null; ate: Dia | null }[];
  emOutroContrato: { nome: string | null; cargo: string; contrato: string; ate: Dia | null }[];
  abertas: { cargo: string; empresa: string; contratando: boolean }[];
  /** a equipe existe nesta semana (não começou depois nem terminou antes) */
  ativa: boolean;
  nota: string | null;
  nivel: NivelSemana;
};

export const fimDaSemana = (seg: Dia): Dia => somarDias(seg, 6);

/** Segundas-feiras de uma janela de `n` semanas. */
export const semanasDe = (inicio: Dia, n: number): Dia[] => Array.from({ length: n }, (_, k) => somarDias(inicio, k * 7));

export function detalheDaSemana(equipe: EquipeDoDia, vagas: VagaBase[], ausenciasPorVaga: Map<string, AusenciaBase[]>, seg: Dia): DetalheSemana {
  const fim = fimDaSemana(seg);
  const d: DetalheSemana = { seg, fim, total: 0, presentes: 0, semNome: 0, ausentes: [], emOutroContrato: [], abertas: [], ativa: true, nota: null, nivel: "completa" };
  if (ehReservaDeApoio(equipe)) return { ...d, ativa: false, nivel: "fora" };
  if (equipe.fim && seg > equipe.fim) return { ...d, ativa: false, nivel: "fora", nota: `Equipe encerrada em ${br(equipe.fim)}`, total: vagas.length };
  if (equipe.inicio && fim < equipe.inicio) return { ...d, ativa: false, nivel: "fora", nota: `Equipe começa em ${br(equipe.inicio)}`, total: vagas.length };
  if (equipe.inicio && equipe.inicio >= seg && equipe.inicio <= fim) d.nota = `Equipe começa em ${br(equipe.inicio)}`;
  if (equipe.fim && equipe.fim >= seg && equipe.fim <= fim) d.nota = `Equipe termina em ${br(equipe.fim)}`;
  for (const v of vagas) {
    if (v.status === "Desmobilizado") continue;
    d.total++;
    if (!temNome(v)) {
      if ((v as VagaBase & { semNome?: boolean }).semNome) {
        d.semNome++;
        d.presentes++;
      } else d.abertas.push({ cargo: v.cargo, empresa: v.empresa, contratando: v.status === "Em contratação" });
      continue;
    }
    if (v.status !== "Vigente") {
      d.ausentes.push({ nome: v.nome, cargo: v.cargo, tipo: v.status, de: null, ate: null });
      continue;
    }
    const aus = (ausenciasPorVaga.get(v.id) ?? []).find((a) => intersecta(a.inicio, a.fim, seg, fim));
    if (aus) {
      d.ausentes.push({ nome: v.nome, cargo: v.cargo, tipo: aus.tipo, de: aus.inicio, ate: aus.fim });
      continue;
    }
    if (v.contratoAtual && (!v.disponivelAPartir || seg < v.disponivelAPartir)) {
      d.emOutroContrato.push({ nome: v.nome, cargo: v.cargo, contrato: v.contratoAtual, ate: v.disponivelAPartir ? somarDias(v.disponivelAPartir, -1) : null });
      continue;
    }
    d.presentes++;
  }
  const faltam = d.ausentes.length + d.emOutroContrato.length;
  d.nivel = faltam > 0 && d.abertas.length > 0 ? "ambos" : faltam > 0 ? "ausencia" : d.abertas.length > 0 ? "vagas" : "completa";
  return d;
}

export function indexarAusencias(ausencias: AusenciaBase[]): Map<string, AusenciaBase[]> {
  const m = new Map<string, AusenciaBase[]>();
  for (const a of ausencias) {
    if (!m.has(a.vagaId)) m.set(a.vagaId, []);
    m.get(a.vagaId)!.push(a);
  }
  return m;
}

/** Soma várias equipes numa semana (para a linha do contrato e a geral). */
export function somarSemanas(lista: DetalheSemana[], seg: Dia): { seg: Dia; total: number; presentes: number; ausentes: number; abertas: number; equipes: number } {
  let total = 0;
  let presentes = 0;
  let ausentes = 0;
  let abertas = 0;
  let equipes = 0;
  for (const x of lista) {
    if (!x.ativa) continue;
    equipes++;
    total += x.total;
    presentes += x.presentes;
    ausentes += x.ausentes.length + x.emOutroContrato.length;
    abertas += x.abertas.length;
  }
  return { seg, total, presentes, ausentes, abertas, equipes };
}

function br(d: Dia) {
  return `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
}
