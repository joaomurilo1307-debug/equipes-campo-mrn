// Histograma: quanto cada equipe (contrato, cliente, cargo) usa de pessoas e viaturas, mês a mês. Regras puras (sem tela).
// Cada mês é a MÉDIA dos dias do mês: uma equipe que só começa no dia 20 entra com um terço do efetivo naquele mês, e quem sai
// no meio do mês também. Os números saem da mesma regra de situação das outras telas (Em equipe / Ausente / Vaga aberta...).
import { temNome, type Dia, type Indice, type VagaBase } from "./disponibilidade";
import { situacaoDaPosicao, ehReservaDeApoio, type EquipeDoDia } from "./situacao";
import { clienteDaEquipe } from "./clientes";
import { equipeAtivaNoDia, mesesEntre, primeiroDiaDoMes, ultimoDiaDoMes } from "./linhaDoTempo";
import { somarDias } from "./disponibilidade";
import { usoCobreDia, type UsoDeViatura } from "./usosVeiculo";

export type Medida = "efetivo" | "posicoes" | "abertas" | "ausentes" | "viaturas" | "equipes";
export type Agrupar = "equipe" | "contrato" | "cliente" | "cargo";

export const MEDIDAS: { id: Medida; rotulo: string; unidade: string; ajuda: string }[] = [
  { id: "efetivo", rotulo: "Pessoas em equipe", unidade: "pessoas", ajuda: "Pessoas presentes nas equipes ativas (sem contar férias, afastados e vagas abertas)." },
  { id: "posicoes", rotulo: "Posições previstas", unidade: "posições", ajuda: "Todas as posições das equipes ativas: com gente, vagas abertas e ausentes." },
  { id: "abertas", rotulo: "Vagas a preencher", unidade: "vagas", ajuda: "Posições sem profissional (vagas abertas, em contratação)." },
  { id: "ausentes", rotulo: "Ausentes", unidade: "pessoas", ajuda: "Pessoas de equipes ativas em férias, afastadas ou em contratação/mobilização." },
  { id: "viaturas", rotulo: "Viaturas em uso", unidade: "viaturas", ajuda: "Viaturas servindo às equipes ativas, conforme o período de cada uma." },
  { id: "equipes", rotulo: "Equipes ativas", unidade: "equipes", ajuda: "Quantas equipes estão em andamento (equipe que começa ou termina no meio do mês conta a fração)." },
];

export const AGRUPAMENTOS: { id: Agrupar; rotulo: string }[] = [
  { id: "equipe", rotulo: "Equipe" },
  { id: "contrato", rotulo: "Contrato" },
  { id: "cliente", rotulo: "Cliente" },
  { id: "cargo", rotulo: "Cargo / atividade" },
];

/** Cargo/atividade só faz sentido para quem conta pessoas. */
export const agrupamentosDaMedida = (m: Medida): Agrupar[] => (m === "viaturas" || m === "equipes" ? ["equipe", "contrato", "cliente"] : ["equipe", "contrato", "cliente", "cargo"]);

type EquipeH = EquipeDoDia & { cliente?: string | null };
type VagaH = VagaBase & { semNome?: boolean; atividade: string; cargo: string; veiculoId: string | null };

export type EntradaHistograma = {
  equipes: EquipeH[];
  vagas: VagaH[];
  idx: Pick<Indice, "ausencias">;
  contratos: { codigo: string; cliente: string | null }[];
  usos: UsoDeViatura[];
};

export type Filtros = {
  contratos: string[];
  equipes: string[];
  cargos: string[];
  /** equipes sem nenhuma data entram como ativas o tempo todo */
  semDatas: boolean;
};
export const SEM_FILTROS: Filtros = { contratos: [], equipes: [], cargos: [], semDatas: true };

export type Grupo = { chave: string; rotulo: string; sub?: string; valores: number[]; total: number; media: number; pico: number };

export type Histograma = {
  meses: string[];
  grupos: Grupo[];
  /** soma de todos os grupos, mês a mês */
  totais: number[];
  /** a composição das posições, mês a mês (independe do agrupamento) */
  composicao: { emEquipe: number; ausentes: number; abertas: number; semNome: number }[];
  /** equipes sem nenhuma data que entraram como ativas o tempo todo */
  equipesSemDatas: number;
  /** equipes que entraram no cálculo */
  equipesNoCalculo: number;
  /**
   * Pessoas LIVRES, mês a mês (média dos dias): quem está na reserva (fora de qualquer equipe) e quem já terminou a equipe.
   * Respeita os filtros de contrato, equipe e cargo para quem veio de equipe; a reserva sempre entra.
   */
  livres: number[];
};

const arred = (n: number) => Math.round(n * 10) / 10;

export function diasDoMes(mes: string): Dia[] {
  const out: Dia[] = [];
  const fim = ultimoDiaDoMes(`${mes}-01`);
  for (let d = primeiroDiaDoMes(`${mes}-01`); d <= fim; d = somarDias(d, 1)) out.push(d);
  return out;
}

export function calcularHistograma(entrada: EntradaHistograma, cfg: { medida: Medida; agrupar: Agrupar; de: string; ate: string; filtros: Filtros }): Histograma {
  const meses = mesesEntre(cfg.de, cfg.ate);
  const { filtros } = cfg;
  const agrupar: Agrupar = agrupamentosDaMedida(cfg.medida).includes(cfg.agrupar) ? cfg.agrupar : "equipe";
  const campo = entrada.equipes.filter((e) => !ehReservaDeApoio(e));
  const equipePorId = new Map(entrada.equipes.map((e) => [e.id, e]));
  const equipes = campo.filter((e) => (!filtros.contratos.length || filtros.contratos.includes(e.projeto)) && (!filtros.equipes.length || filtros.equipes.includes(e.id)) && (filtros.semDatas || e.inicio || e.fim));
  const semDatas = equipes.filter((e) => !e.inicio && !e.fim).length;

  const vagasPorEquipe = new Map<string, VagaH[]>();
  for (const v of entrada.vagas) {
    if (filtros.cargos.length && !filtros.cargos.includes(v.atividade || v.cargo)) continue;
    if (!vagasPorEquipe.has(v.equipeId)) vagasPorEquipe.set(v.equipeId, []);
    vagasPorEquipe.get(v.equipeId)!.push(v);
  }
  const usosPorEquipe = new Map<string, UsoDeViatura[]>();
  for (const u of entrada.usos) {
    if (!usosPorEquipe.has(u.equipeId)) usosPorEquipe.set(u.equipeId, []);
    usosPorEquipe.get(u.equipeId)!.push(u);
  }

  const rotuloEquipe = (e: EquipeH) => `${e.codigo} · ${e.nome}`;
  const chaveDe = (e: EquipeH, v?: VagaH): { chave: string; rotulo: string; sub?: string } => {
    if (agrupar === "equipe") return { chave: e.id, rotulo: rotuloEquipe(e), sub: e.projeto };
    if (agrupar === "contrato") return { chave: e.projeto, rotulo: e.projeto };
    if (agrupar === "cliente") {
      const c = clienteDaEquipe({ projeto: e.projeto, cliente: e.cliente }, entrada.contratos) ?? "Sem cliente";
      return { chave: c, rotulo: c };
    }
    const c = (v?.atividade || v?.cargo || "Sem cargo").trim();
    return { chave: c, rotulo: c };
  };

  const soma = new Map<string, { rotulo: string; sub?: string; porMes: number[] }>();
  const poe = (k: { chave: string; rotulo: string; sub?: string }, mi: number, n: number) => {
    let g = soma.get(k.chave);
    if (!g) {
      g = { rotulo: k.rotulo, sub: k.sub, porMes: meses.map(() => 0) };
      soma.set(k.chave, g);
    }
    g.porMes[mi] += n;
  };
  const composicao = meses.map(() => ({ emEquipe: 0, ausentes: 0, abertas: 0, semNome: 0 }));
  // a mesma viatura em duas equipes conta UMA vez no total (cada equipe mostra a sua)
  const viaturasDistintas = meses.map(() => 0);
  // quem pode estar livre: pessoas com nome da reserva ou de equipes que passam nos filtros
  const idsDasEquipes = new Set(equipes.map((e) => e.id));
  const candidatosAFicarLivres = entrada.vagas.filter((v) => {
    if (!temNome(v)) return false;
    if (filtros.cargos.length && !filtros.cargos.includes(v.atividade || v.cargo)) return false;
    const e = equipePorId.get(v.equipeId);
    return !!e && (ehReservaDeApoio(e) || idsDasEquipes.has(e.id));
  });
  const livres = meses.map(() => 0);

  meses.forEach((mes, mi) => {
    const dias = diasDoMes(mes);
    for (const d of dias) {
      const doDia = new Set<string>();
      for (const e of equipes) {
        if (!equipeAtivaNoDia(e, d)) continue;
        if (cfg.medida === "equipes") {
          poe(chaveDe(e), mi, 1);
          continue;
        }
        if (cfg.medida === "viaturas") {
          const usos = usosPorEquipe.get(e.id) ?? [];
          const ids = new Set<string>();
          for (const u of usos) if (u.inicio || u.fim ? usoCobreDia(u, d) : true) ids.add(u.veiculoId);
          for (const v of vagasPorEquipe.get(e.id) ?? []) if (v.veiculoId && !usos.some((u) => u.veiculoId === v.veiculoId)) ids.add(v.veiculoId);
          for (const id of ids) doDia.add(id);
          if (ids.size) poe(chaveDe(e), mi, ids.size);
          continue;
        }
        for (const v of vagasPorEquipe.get(e.id) ?? []) {
          const s = situacaoDaPosicao(v, equipePorId.get(v.equipeId), entrada.idx, d).situacao;
          if (s === "DESMOBILIZADO") continue;
          if (s === "EM_EQUIPE") composicao[mi].emEquipe++;
          else if (s === "AUSENTE") composicao[mi].ausentes++;
          else if (s === "VAGA_ABERTA") composicao[mi].abertas++;
          else if (s === "SEM_NOME") composicao[mi].semNome++;
          const conta =
            cfg.medida === "efetivo" ? s === "EM_EQUIPE" && temNome(v)
            : cfg.medida === "posicoes" ? true
            : cfg.medida === "abertas" ? s === "VAGA_ABERTA"
            : s === "AUSENTE";
          if (conta) poe(chaveDe(e, v), mi, 1);
        }
      }
      viaturasDistintas[mi] += doDia.size;
      for (const v of candidatosAFicarLivres) if (situacaoDaPosicao(v, equipePorId.get(v.equipeId), entrada.idx, d).situacao === "DISPONIVEL") livres[mi]++;
    }
    const n = dias.length;
    livres[mi] = arred(livres[mi] / n);
    viaturasDistintas[mi] = arred(viaturasDistintas[mi] / n);
    for (const g of soma.values()) g.porMes[mi] = arred(g.porMes[mi] / n);
    const c = composicao[mi];
    c.emEquipe = arred(c.emEquipe / n);
    c.ausentes = arred(c.ausentes / n);
    c.abertas = arred(c.abertas / n);
    c.semNome = arred(c.semNome / n);
  });

  const grupos: Grupo[] = [...soma.entries()]
    .map(([chave, g]) => {
      const total = arred(g.porMes.reduce((s, v) => s + v, 0));
      return { chave, rotulo: g.rotulo, sub: g.sub, valores: g.porMes, total, media: arred(total / Math.max(1, meses.length)), pico: Math.max(0, ...g.porMes) };
    })
    .filter((g) => g.total > 0)
    .sort((a, b) => b.total - a.total || a.rotulo.localeCompare(b.rotulo, "pt-BR", { numeric: true }));
  const totais = cfg.medida === "viaturas" ? viaturasDistintas : meses.map((_, i) => arred(grupos.reduce((s, g) => s + g.valores[i], 0)));
  return { meses, grupos, totais, composicao, equipesSemDatas: semDatas, equipesNoCalculo: equipes.length, livres };
}

/** Os `n` maiores grupos separados e o resto somado em "Outros" (um gráfico não aguenta 20 cores). */
export function agruparTopo(h: Histograma, n: number): Grupo[] {
  if (h.grupos.length <= n) return h.grupos;
  const topo = h.grupos.slice(0, n);
  const resto = h.grupos.slice(n);
  const valores = h.meses.map((_, i) => arred(resto.reduce((s, g) => s + g.valores[i], 0)));
  const total = arred(valores.reduce((s, v) => s + v, 0));
  return [...topo, { chave: "__outros", rotulo: `Outros (${resto.length})`, valores, total, media: arred(total / Math.max(1, h.meses.length)), pico: Math.max(0, ...valores) }];
}
