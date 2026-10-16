// Frota mês a mês: quantas viaturas estão EM USO, quantas estão LIVRES (operacionais e sem equipe), quantas indisponíveis
// (manutenção, paradas) e quantas PREVISTAS (ainda não chegaram). Regras puras (sem tela). Cada mês é a média dos dias.
// O status da viatura (manutenção, parada...) é o de hoje: o sistema não guarda o histórico dele.
import type { Dia } from "./disponibilidade";
import { equipeAtivaNoDia, mesesEntre } from "./linhaDoTempo";
import { diasDoMes } from "./histograma";
import { ehReservaDeApoio, type EquipeDoDia } from "./situacao";
import { usoCobreDia, type UsoDeViatura } from "./usosVeiculo";

export type VeiculoDaFrota = { id: string; status: string; substituidoPorId?: string | null; trocaEm?: Dia | null };

export type EntradaFrota = {
  equipes: EquipeDoDia[];
  vagas: { equipeId: string; veiculoId: string | null }[];
  usos: UsoDeViatura[];
  veiculos: VeiculoDaFrota[];
};

export type SituacaoDaViatura = "em_uso" | "livre" | "indisponivel" | "prevista" | "devolvida";

export const STATUS_INDISPONIVEL: readonly string[] = ["Em manutenção", "Parado"];

const arred = (n: number) => Math.round(n * 10) / 10;

/** As viaturas que estão servindo a alguma equipe de campo ativa no dia (o período de cada uma na equipe vale; sem datas vale sempre). */
export function viaturasEmUsoNoDia(e: Pick<EntradaFrota, "equipes" | "vagas" | "usos">, dia: Dia, aplicaAEquipe: (id: string) => boolean = () => true): Set<string> {
  const ativas = new Set(e.equipes.filter((x) => !ehReservaDeApoio(x) && equipeAtivaNoDia(x, dia) && aplicaAEquipe(x.id)).map((x) => x.id));
  const usos = new Set<string>();
  const comUso = new Set(e.usos.map((u) => `${u.veiculoId}|${u.equipeId}`));
  for (const u of e.usos) if (ativas.has(u.equipeId) && (u.inicio || u.fim ? usoCobreDia(u, dia) : true)) usos.add(u.veiculoId);
  for (const v of e.vagas) if (v.veiculoId && ativas.has(v.equipeId) && !comUso.has(`${v.veiculoId}|${v.equipeId}`)) usos.add(v.veiculoId);
  return usos;
}

/** O dia em que a viatura prevista chega: o dia da troca da que ela vai substituir (sem a data, nunca chegou). */
export function chegadaDaPrevista(v: VeiculoDaFrota, todos: VeiculoDaFrota[]): Dia | null {
  return todos.find((x) => x.substituidoPorId === v.id)?.trocaEm ?? null;
}

export function situacaoDaViaturaNoDia(v: VeiculoDaFrota, emUso: boolean, chegada: Dia | null, dia: Dia): SituacaoDaViatura {
  if (v.status === "Devolvido") return "devolvida";
  if (v.status === "Prevista" && !(chegada && dia >= chegada)) return "prevista";
  if (STATUS_INDISPONIVEL.includes(v.status)) return "indisponivel";
  return emUso ? "em_uso" : "livre";
}

export type FrotaPorMes = {
  meses: string[];
  emUso: number[];
  livres: number[];
  indisponiveis: number[];
  previstas: number[];
  /** a frota que existe no mês: em uso + livres + indisponíveis + previstas (as devolvidas ficam de fora) */
  frota: number[];
};

export function calcularFrotaPorMes(entrada: EntradaFrota, de: string, ate: string): FrotaPorMes {
  const meses = mesesEntre(de, ate);
  const zero = () => meses.map(() => 0);
  const r: FrotaPorMes = { meses, emUso: zero(), livres: zero(), indisponiveis: zero(), previstas: zero(), frota: zero() };
  const chegadas = new Map(entrada.veiculos.map((v) => [v.id, v.status === "Prevista" ? chegadaDaPrevista(v, entrada.veiculos) : null]));
  meses.forEach((mes, mi) => {
    const dias = diasDoMes(mes);
    for (const d of dias) {
      const usadas = viaturasEmUsoNoDia(entrada, d);
      for (const v of entrada.veiculos) {
        const s = situacaoDaViaturaNoDia(v, usadas.has(v.id), chegadas.get(v.id) ?? null, d);
        if (s === "devolvida") continue;
        r.frota[mi]++;
        if (s === "em_uso") r.emUso[mi]++;
        else if (s === "livre") r.livres[mi]++;
        else if (s === "indisponivel") r.indisponiveis[mi]++;
        else r.previstas[mi]++;
      }
    }
    const n = dias.length;
    for (const k of ["emUso", "livres", "indisponiveis", "previstas", "frota"] as const) r[k][mi] = arred(r[k][mi] / n);
  });
  return r;
}
