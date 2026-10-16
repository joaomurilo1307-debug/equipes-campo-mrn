// A viatura numa equipe e por quanto tempo: regras puras (sem banco). Uma viatura pode servir a várias equipes, em momentos
// diferentes; o sistema confere o período dela com o da equipe e avisa quando não batem ou quando ela está em duas equipes
// ao mesmo tempo. Datas "AAAA-MM-DD". Data vazia = não informada (o uso vale sem limite desse lado).
import { somarDias, type Dia } from "./disponibilidade";

export type UsoDeViatura = { veiculoId: string; equipeId: string; inicio: Dia | null; fim: Dia | null };
type Periodo = { inicio: Dia | null; fim: Dia | null };

const fmt = (d: Dia) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

export type NivelConferencia = "ok" | "atencao" | "sem_datas";
export type ConferenciaDeUso = { nivel: NivelConferencia; texto: string };

/** O uso está dentro do período da equipe? "Confere" / o que está fora / o que falta preencher. */
export function conferirUso(uso: Periodo, equipe: Periodo): ConferenciaDeUso {
  if (!equipe.inicio && !equipe.fim) return { nivel: "sem_datas", texto: "Equipe sem datas" };
  if (!uso.inicio && !uso.fim) return { nivel: "sem_datas", texto: "Preencher as datas da viatura" };
  const problemas: string[] = [];
  if (uso.inicio && equipe.inicio && uso.inicio < equipe.inicio) problemas.push(`começa antes da equipe (${fmt(equipe.inicio)})`);
  if (uso.fim && equipe.fim && uso.fim > equipe.fim) problemas.push(`termina depois da equipe (${fmt(equipe.fim)})`);
  if (uso.inicio && equipe.fim && uso.inicio > equipe.fim) problemas.push(`começa depois que a equipe termina (${fmt(equipe.fim)})`);
  if (uso.fim && equipe.inicio && uso.fim < equipe.inicio) problemas.push(`termina antes de a equipe começar (${fmt(equipe.inicio)})`);
  if (problemas.length) return { nivel: "atencao", texto: problemas[0][0].toUpperCase() + problemas.join("; ").slice(1) };
  if (!uso.fim && equipe.fim) return { nivel: "atencao", texto: `Sem fim na viatura; a equipe termina em ${fmt(equipe.fim)}` };
  if (!uso.inicio && equipe.inicio) return { nivel: "atencao", texto: `Sem início na viatura; a equipe começa em ${fmt(equipe.inicio)}` };
  return { nivel: "ok", texto: "Confere com a equipe" };
}

/** O uso vale no dia? Lado sem data é aberto. */
export const usoCobreDia = (u: Periodo, dia: Dia) => (!u.inicio || u.inicio <= dia) && (!u.fim || dia <= u.fim);

/** Dois períodos se cruzam? (lado sem data é aberto) */
const cruzam = (a: Periodo, b: Periodo) => (!a.fim || !b.inicio || b.inicio <= a.fim) && (!b.fim || !a.inicio || a.inicio <= b.fim);

export type ConflitoDeUso = { veiculoId: string; a: UsoDeViatura; b: UsoDeViatura };

/**
 * A mesma viatura em duas equipes ao mesmo tempo. Só vale quando os dois usos têm alguma data: uso sem nenhuma data é
 * "ainda não informado", não um conflito.
 */
export function conflitosDeUso(usos: UsoDeViatura[]): ConflitoDeUso[] {
  const porVeiculo = new Map<string, UsoDeViatura[]>();
  for (const u of usos) porVeiculo.set(u.veiculoId, [...(porVeiculo.get(u.veiculoId) ?? []), u]);
  const out: ConflitoDeUso[] = [];
  for (const [veiculoId, lista] of porVeiculo) {
    const datados = lista.filter((u) => u.inicio || u.fim);
    for (let i = 0; i < datados.length; i++) for (let j = i + 1; j < datados.length; j++) if (datados[i].equipeId !== datados[j].equipeId && cruzam(datados[i], datados[j])) out.push({ veiculoId, a: datados[i], b: datados[j] });
  }
  return out;
}

/** A nota da planilha que fala de troca ("Será substituida pela CNS-102") -> identificação da substituta; o resto é comentário. */
export function lerNotaDeTroca(nota: string | null | undefined): { substituta: string | null; comentario: string | null } {
  const t = (nota ?? "").replace(/\s+/g, " ").trim();
  if (!t) return { substituta: null, comentario: null };
  const m = /(?:ser[aá]\s+)?substitu[ií]d[ao]\s+(?:pel[ao]\s+)?([A-Za-z]{2,}[-\s]?\d+)/i.exec(t);
  if (!m) return { substituta: null, comentario: t };
  const resto = (t.slice(0, m.index) + " " + t.slice(m.index + m[0].length)).replace(/[\s.,;:-]+$/g, "").replace(/^[\s.,;:-]+/g, "").trim();
  return { substituta: m[1].replace(/\s+/g, "-").toUpperCase(), comentario: resto || null };
}

export type PlanoDeTroca =
  | { ok: true; antiga: { equipeId: string; fim: Dia }[]; nova: { equipeId: string; inicio: Dia; fim: Dia | null }[] }
  | { ok: false; erro: string };

/**
 * Trocar a viatura em `trocaEm`: a antiga termina no dia anterior e a nova começa no dia da troca, em cada equipe que a
 * antiga atendia nesse dia (ou só nas escolhidas). A nova herda o fim que a antiga tinha na equipe.
 */
export function planejarTroca(usosDaAntiga: UsoDeViatura[], trocaEm: Dia, equipeIds?: string[]): PlanoDeTroca {
  const alvo = usosDaAntiga.filter((u) => (!equipeIds || equipeIds.includes(u.equipeId)) && (!u.fim || u.fim >= trocaEm));
  if (!alvo.length) return { ok: false, erro: "A viatura não está em nenhuma equipe nessa data" };
  for (const u of alvo) if (u.inicio && u.inicio >= trocaEm) return { ok: false, erro: `A troca (${fmt(trocaEm)}) tem que ser depois do início da viatura na equipe (${fmt(u.inicio)})` };
  return {
    ok: true,
    antiga: alvo.map((u) => ({ equipeId: u.equipeId, fim: somarDias(trocaEm, -1) })),
    nova: alvo.map((u) => ({ equipeId: u.equipeId, inicio: trocaEm, fim: u.fim })),
  };
}
