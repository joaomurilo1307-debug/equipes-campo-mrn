// UMA regra só para dizer onde cada pessoa e cada posição está numa data. Todas as telas (Painel, Contratos, Equipes,
// Colaboradores, Quadro, Base, Relatórios) contam a partir daqui, então os números sempre fecham entre si.
//
// Hierarquia: contrato -> equipe -> posição (vaga) -> pessoa.
//   - posição sem pessoa:  "Vaga aberta" (Vago / em contratação)  ou  "Sem nome informado" (preenchida, nome não informado)
//   - pessoa dentro de uma equipe de campo ativa:  "Em equipe"  (mesmo com campanha ou sem período definido)
//   - pessoa fora de equipe (reserva), ou cuja equipe terminou:  "Disponível"
//   - pessoa em férias / afastada / com restrição:  "Ausente"  (continua na equipe, mas não conta como presente)
//   - pessoa que ainda está em outro contrato até uma data:  "Em outro contrato"
//
// Quando a equipe acaba (fim), as pessoas dela passam a "Disponível" no dia seguinte; quando alguém é desmobilizado a posição
// abre vaga na equipe e a pessoa vai para a reserva. Nada disso depende de campanha.
import { GRUPO_RESERVA, STATUS_QUE_TRABALHAM, intersecta, somarDias, temNome, type AusenciaBase, type Dia, type Indice, type VagaBase } from "./disponibilidade";

export type Situacao = "EM_EQUIPE" | "DISPONIVEL" | "AUSENTE" | "OUTRO_CONTRATO" | "SEM_NOME" | "VAGA_ABERTA" | "DESMOBILIZADO";

export type EquipeDoDia = {
  id: string;
  codigo: string;
  nome: string;
  projeto: string;
  grupo: string;
  status: string;
  inicio?: Dia | null;
  fim?: Dia | null;
};

export const ROTULO_SITUACAO: Record<Situacao, string> = {
  EM_EQUIPE: "Em equipe",
  DISPONIVEL: "Disponível",
  AUSENTE: "Ausente",
  OUTRO_CONTRATO: "Em outro contrato",
  SEM_NOME: "Sem nome informado",
  VAGA_ABERTA: "Vaga aberta",
  DESMOBILIZADO: "Desmobilizado",
};

export type SituacaoDaPosicao = { situacao: Situacao; motivo: string | null };

export const ehReservaDeApoio = (e: { grupo: string } | undefined | null) => !!e && e.grupo === GRUPO_RESERVA;

const fmt = (d: Dia) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

/** Onde a posição está no dia `dia`. */
export function situacaoDaPosicao(v: VagaBase & { semNome?: boolean }, e: EquipeDoDia | undefined, idx: Pick<Indice, "ausencias">, dia: Dia): SituacaoDaPosicao {
  if (!temNome(v)) {
    if (v.semNome) return { situacao: "SEM_NOME", motivo: "Nome não informado" };
    return { situacao: "VAGA_ABERTA", motivo: v.status === "Em contratação" ? "Em contratação" : "Sem profissional" };
  }
  if (v.status === "Desmobilizado") return { situacao: "DESMOBILIZADO", motivo: "Saiu da equipe" };
  if (!STATUS_QUE_TRABALHAM.includes(v.status)) return { situacao: "AUSENTE", motivo: v.status };
  const aus = (idx.ausencias.get(v.id) ?? []).find((a: AusenciaBase) => intersecta(a.inicio, a.fim, dia, dia));
  if (aus) return { situacao: "AUSENTE", motivo: aus.tipo };
  // ainda em outro contrato: até a data de liberação; sem data, segue ocupada até alguém informar
  if (v.contratoAtual && (!v.disponivelAPartir || dia < v.disponivelAPartir)) {
    return { situacao: "OUTRO_CONTRATO", motivo: `Em ${v.contratoAtual}${v.disponivelAPartir ? ` até ${fmt(somarDias(v.disponivelAPartir, -1))}` : ""}` };
  }
  if (!e || ehReservaDeApoio(e)) return { situacao: "DISPONIVEL", motivo: "Sem equipe" };
  if (e.status === "Inativa") return { situacao: "DISPONIVEL", motivo: "Equipe inativa" };
  if (e.fim && dia > e.fim) return { situacao: "DISPONIVEL", motivo: `Equipe encerrada em ${fmt(e.fim)}` };
  if (e.inicio && dia < e.inicio) return { situacao: "EM_EQUIPE", motivo: `Equipe começa em ${fmt(e.inicio)}` };
  return { situacao: "EM_EQUIPE", motivo: null };
}

// ---------------------------------------------------------------- contagens

export type Contagem = {
  posicoes: number;
  comNome: number;
  semNome: number;
  abertas: number;
  emEquipe: number; // pessoas presentes na equipe
  ausentes: number; // pessoas da equipe fora (férias, INSS, restrição, em contratação/mobilização)
  disponiveis: number; // pessoas sem equipe
  outroContrato: number;
  desmobilizados: number;
};

export const contagemVazia = (): Contagem => ({ posicoes: 0, comNome: 0, semNome: 0, abertas: 0, emEquipe: 0, ausentes: 0, disponiveis: 0, outroContrato: 0, desmobilizados: 0 });

export function somarNaContagem(c: Contagem, s: Situacao) {
  switch (s) {
    case "EM_EQUIPE":
      c.emEquipe++;
      break;
    case "AUSENTE":
      c.ausentes++;
      break;
    case "DISPONIVEL":
      c.disponiveis++;
      break;
    case "OUTRO_CONTRATO":
      c.outroContrato++;
      break;
    case "SEM_NOME":
      c.semNome++;
      break;
    case "VAGA_ABERTA":
      c.abertas++;
      break;
    case "DESMOBILIZADO":
      c.desmobilizados++;
      break;
  }
}

/** Contagem de uma lista de posições (de uma equipe ou de um contrato) no dia. Quem está na reserva não ocupa posição. */
export function contar(vagas: VagaBase[], equipePorId: Map<string, EquipeDoDia>, idx: Pick<Indice, "ausencias">, dia: Dia): Contagem {
  const c = contagemVazia();
  for (const v of vagas) {
    const e = equipePorId.get(v.equipeId);
    const s = situacaoDaPosicao(v, e, idx, dia).situacao;
    if (s === "DESMOBILIZADO") {
      c.desmobilizados++;
      continue;
    }
    if (ehReservaDeApoio(e)) continue;
    c.posicoes++;
    if (temNome(v)) c.comNome++;
    somarNaContagem(c, s);
  }
  return c;
}

export type ResumoDoDia = Contagem & {
  dia: Dia;
  contratos: number; // contratos que têm ao menos uma equipe de campo
  equipes: number; // equipes de campo
  colaboradores: number; // pessoas com nome que não saíram: emEquipe + ausentes + disponiveis + outroContrato
};

/**
 * Os números do Painel, todos de uma vez, para uma data.
 *  - posicoes / comNome / semNome / abertas: só das equipes de campo (a reserva guarda pessoas, não posições);
 *  - emEquipe / ausentes / disponiveis / outroContrato: pessoas, somando a reserva; a soma dos quatro é `colaboradores`.
 */
export function resumirDia(dados: { equipes: EquipeDoDia[]; vagas: VagaBase[] }, idx: Pick<Indice, "ausencias">, dia: Dia): ResumoDoDia {
  const equipePorId = new Map(dados.equipes.map((e) => [e.id, e]));
  const campo = dados.equipes.filter((e) => !ehReservaDeApoio(e));
  const c = contagemVazia();
  const reserva = { disponiveis: 0, outroContrato: 0, ausentes: 0 };
  for (const v of dados.vagas) {
    const e = equipePorId.get(v.equipeId);
    const s = situacaoDaPosicao(v, e, idx, dia).situacao;
    if (s === "DESMOBILIZADO") {
      c.desmobilizados++;
      continue;
    }
    if (ehReservaDeApoio(e)) {
      if (!temNome(v)) continue;
      if (s === "DISPONIVEL") reserva.disponiveis++;
      else if (s === "OUTRO_CONTRATO") reserva.outroContrato++;
      else if (s === "AUSENTE") reserva.ausentes++;
      continue;
    }
    c.posicoes++;
    if (temNome(v)) c.comNome++;
    somarNaContagem(c, s);
  }
  const contratosComEquipe = new Set(campo.filter((e) => e.projeto && e.projeto !== "A definir").map((e) => e.projeto));
  const r: ResumoDoDia = {
    ...c,
    dia,
    contratos: contratosComEquipe.size,
    equipes: campo.length,
    ausentes: c.ausentes + reserva.ausentes,
    disponiveis: c.disponiveis + reserva.disponiveis,
    outroContrato: c.outroContrato + reserva.outroContrato,
    colaboradores: 0,
  };
  r.colaboradores = r.emEquipe + r.ausentes + r.disponiveis + r.outroContrato;
  return r;
}

// ---------------------------------------------------------------- equipe

export type EstadoDaEquipe = "EM_FORMACAO" | "ENCERRADA" | "INATIVA" | "COM_VAGAS" | "COM_AUSENCIA" | "COMPLETA";

export const ROTULO_ESTADO_EQUIPE: Record<EstadoDaEquipe, { rotulo: string; chip: string; dica: string }> = {
  COMPLETA: { rotulo: "Completa", chip: "chip-ok", dica: "Todas as posições preenchidas e ninguém ausente" },
  COM_VAGAS: { rotulo: "Com vagas", chip: "chip-warn", dica: "Tem vagas abertas para contratar ou puxar" },
  COM_AUSENCIA: { rotulo: "Com ausência", chip: "chip-bad", dica: "Alguém da equipe está ausente (férias, INSS, restrição, em contratação)" },
  EM_FORMACAO: { rotulo: "Em formação", chip: "chip-info", dica: "Equipe ainda sendo montada ou que começa depois desta data" },
  ENCERRADA: { rotulo: "Encerrada", chip: "chip-mute", dica: "O período da equipe terminou: as pessoas estão disponíveis" },
  INATIVA: { rotulo: "Inativa", chip: "chip-mute", dica: "Equipe marcada como inativa" },
};

export function estadoDaEquipe(e: EquipeDoDia, c: Contagem, dia: Dia): EstadoDaEquipe {
  if (e.status === "Inativa") return "INATIVA";
  if (e.fim && dia > e.fim) return "ENCERRADA";
  if (e.status === "Em formação" || (e.inicio && dia < e.inicio)) return "EM_FORMACAO";
  if (c.abertas > 0) return "COM_VAGAS";
  if (c.ausentes > 0) return "COM_AUSENCIA";
  return "COMPLETA";
}
