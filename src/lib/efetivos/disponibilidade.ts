// Regras puras (sem banco) do controle de efetivos de campo (afugentamento / resgate).
//
// Reproduz a logica da planilha do Samuel (aba Equipes/Dashboard) e acrescenta o que
// ela nao fazia: disponibilidade por PESSOA e por PERIODO, e a consulta "quem esta
// livre de X a Y" para montar a equipe de cada campanha.
//
// Datas de calendario trafegam como "AAAA-MM-DD" (comparacao de texto e correta e
// nao sofre com fuso). Nada aqui acessa banco; as rotas carregam os dados e chamam.

export type Dia = string; // AAAA-MM-DD

export const STATUS_EQUIPE = ["Ativa", "Em formação", "Inativa"] as const;
export const STATUS_VAGA = ["Vigente", "Apto com restrição", "Afastado", "Em contratação", "Desmobilizado"] as const;
export const TIPOS_AUSENCIA = ["Férias", "Atestado", "Afastado", "Folga", "Treinamento", "Outro"] as const;
export const GRUPOS = ["Fauna", "Flora"] as const;
export const ATIVIDADES = ["Afugentamento", "Resgate", "Afugentamento e Resgate", "Apoio / Coordenação"] as const;
export const PRIORIDADES = ["Alta", "Média", "Baixa"] as const;
export const STATUS_CAMPANHA = ["Nova", "Em análise", "Planejada", "Confirmada", "Em execução", "Concluída", "Cancelada"] as const;

// Na planilha original so "Vigente" conta como pessoa em condicao de trabalhar.
// "Apto com restrição" ficou de fora porque a formula dele trata qualquer status
// diferente de Vigente como ausencia; se o Samuel decidir o contrario, e so mudar aqui.
export const STATUS_QUE_TRABALHAM: readonly string[] = ["Vigente"];

// Campanha cancelada ou concluida nao segura mais ninguem.
/** Grupo da reserva de pessoas vindas de outro contrato (aba de apoio): guarda gente, nao e equipe de campo. */
export const GRUPO_RESERVA = "Apoio";

export const STATUS_CAMPANHA_QUE_LIBERAM: readonly string[] = ["Cancelada", "Concluída"];

export type EquipeBase = {
  id: string;
  codigo: string;
  nome: string;
  projeto: string;
  gestor: string | null;
  grupo: string;
  status: string;
};

export type VagaBase = {
  id: string;
  equipeId: string;
  nome: string | null;
  status: string;
  cargo: string;
  empresa: string;
  atividade: string;
  previsaoInicio?: Dia | null;
  // Pessoa que ainda esta ocupada em outro contrato (ex.: apoio vindo do 4362 LT) e so fica
  // livre a partir desta data; antes dela conta como ocupada, e o contrato aparece como motivo.
  contratoAtual?: string | null;
  disponivelAPartir?: Dia | null;
  // posicao preenchida cujo nome nao foi informado (ex.: auxiliares Coopermoura/MRN): conta como gente da equipe, mas nao como vaga aberta
  semNome?: boolean;
};

export type AusenciaBase = { id?: string; vagaId: string; tipo: string; inicio: Dia; fim: Dia };
export type AlocacaoBase = { id?: string; vagaId: string; campanhaId: string; inicio: Dia; fim: Dia };
export type CampanhaBase = {
  id: string;
  codigo: string;
  projeto: string;
  grupo: string;
  atividade: string;
  inicio: Dia;
  fim: Dia;
  qtdEquipes: number;
  status: string;
};

export type DadosEfetivos = {
  equipes: EquipeBase[];
  vagas: VagaBase[];
  ausencias: AusenciaBase[];
  // Somente alocacoes de campanhas que ainda seguram gente (ver alocacoesQueSeguram).
  alocacoes: AlocacaoBase[];
};

// ---------------------------------------------------------------- datas

export function dataValida(s: unknown): s is Dia {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function somarDias(dia: Dia, n: number): Dia {
  const d = new Date(`${dia}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function diferencaDias(de: Dia, ate: Dia): number {
  return Math.round((Date.parse(`${ate}T00:00:00.000Z`) - Date.parse(`${de}T00:00:00.000Z`)) / 86400000);
}

/** Dois periodos fechados [aIni,aFim] e [bIni,bFim] tem algum dia em comum? */
export function intersecta(aIni: Dia, aFim: Dia, bIni: Dia, bFim: Dia): boolean {
  return aIni <= bFim && bIni <= aFim;
}

export function temNome(v: Pick<VagaBase, "nome">): boolean {
  return !!v.nome && v.nome.trim() !== "";
}

// ---------------------------------------------------------------- estado da pessoa

export type SituacaoPessoa = "LIVRE" | "ALOCADA" | "AUSENTE" | "VAGA_ABERTA" | "SEM_NOME";

export type EstadoVaga = {
  situacao: SituacaoPessoa;
  // AUSENTE: tipo da ausencia/status (dado restrito); VAGA_ABERTA: "Em contratação" ou "Sem profissional"
  motivo: string | null;
  campanhaId: string | null;
  // pessoa alocada num periodo em que tambem esta ausente (precisa de atencao)
  conflito: boolean;
};

export type Indice = {
  ausencias: Map<string, AusenciaBase[]>;
  alocacoes: Map<string, AlocacaoBase[]>;
};

export function indexar(dados: Pick<DadosEfetivos, "ausencias" | "alocacoes">, ignorarCampanhaId?: string | null): Indice {
  const ausencias = new Map<string, AusenciaBase[]>();
  for (const a of dados.ausencias) {
    if (!ausencias.has(a.vagaId)) ausencias.set(a.vagaId, []);
    ausencias.get(a.vagaId)!.push(a);
  }
  const alocacoes = new Map<string, AlocacaoBase[]>();
  for (const a of dados.alocacoes) {
    if (ignorarCampanhaId && a.campanhaId === ignorarCampanhaId) continue;
    if (!alocacoes.has(a.vagaId)) alocacoes.set(a.vagaId, []);
    alocacoes.get(a.vagaId)!.push(a);
  }
  return { ausencias, alocacoes };
}

/** Estado de uma vaga em um dia (ini=fim) ou ao longo de um periodo (qualquer dia do periodo conta). */
export function estadoDaVaga(vaga: VagaBase, idx: Indice, ini: Dia, fim: Dia = ini): EstadoVaga {
  if (!temNome(vaga) && vaga.semNome) {
    return { situacao: "SEM_NOME", motivo: "Nome não informado", campanhaId: null, conflito: false };
  }
  if (!temNome(vaga)) {
    return {
      situacao: "VAGA_ABERTA",
      motivo: vaga.status === "Em contratação" ? "Em contratação" : "Sem profissional",
      campanhaId: null,
      conflito: false,
    };
  }
  const aloc = (idx.alocacoes.get(vaga.id) ?? []).find((a) => intersecta(a.inicio, a.fim, ini, fim));
  if (!STATUS_QUE_TRABALHAM.includes(vaga.status)) {
    return { situacao: "AUSENTE", motivo: vaga.status, campanhaId: aloc?.campanhaId ?? null, conflito: !!aloc };
  }
  const aus = (idx.ausencias.get(vaga.id) ?? []).find((a) => intersecta(a.inicio, a.fim, ini, fim));
  if (aus) return { situacao: "AUSENTE", motivo: aus.tipo, campanhaId: aloc?.campanhaId ?? null, conflito: !!aloc };
  // ocupada em outro contrato: ate a data de liberacao; sem data, continua ocupada ate alguem informar
  if (vaga.contratoAtual && (!vaga.disponivelAPartir || ini < vaga.disponivelAPartir)) {
    const ate = vaga.disponivelAPartir ? ` até ${somarDias(vaga.disponivelAPartir, -1)}` : "";
    return { situacao: "ALOCADA", motivo: `Em ${vaga.contratoAtual}${ate}`, campanhaId: aloc?.campanhaId ?? null, conflito: false };
  }
  if (vaga.disponivelAPartir && ini < vaga.disponivelAPartir) {
    return { situacao: "ALOCADA", motivo: `Em ${vaga.contratoAtual ?? "outro contrato"} até ${somarDias(vaga.disponivelAPartir, -1)}`, campanhaId: aloc?.campanhaId ?? null, conflito: false };
  }
  if (aloc) return { situacao: "ALOCADA", motivo: null, campanhaId: aloc.campanhaId, conflito: false };
  return { situacao: "LIVRE", motivo: null, campanhaId: null, conflito: false };
}

/** So as alocacoes de campanhas que ainda seguram pessoas entram no calculo de disponibilidade. */
export function alocacoesQueSeguram(
  alocacoes: AlocacaoBase[],
  campanhas: Pick<CampanhaBase, "id" | "status">[]
): AlocacaoBase[] {
  const seguram = new Set(campanhas.filter((c) => !STATUS_CAMPANHA_QUE_LIBERAM.includes(c.status)).map((c) => c.id));
  return alocacoes.filter((a) => seguram.has(a.campanhaId));
}

// ---------------------------------------------------------------- equipe (igual a planilha)

export type SituacaoRh = "EQUIPE NÃO ATIVA" | "COM VAGAS" | "COM AUSÊNCIA" | "COMPLETA";
export type Disponibilidade = "DISPONÍVEL" | "ALOCADA" | "INDISPONÍVEL";

export type LinhaEquipe = EquipeBase & {
  vagasPrevistas: number;
  nomesPreenchidos: number; // posicoes com nome
  semNome: number; // posicoes preenchidas sem nome informado
  preenchidas: number; // com nome + sem nome: o que nao e vaga aberta
  ausentes: number;
  alocacoes: number; // pessoas da equipe alocadas no periodo
  livres: number; // pessoas da equipe livres no periodo
  conflitos: number;
  situacaoRh: SituacaoRh;
  disponibilidade: Disponibilidade;
};

export function avaliarEquipe(equipe: EquipeBase, vagas: VagaBase[], idx: Indice, ini: Dia, fim: Dia = ini): LinhaEquipe {
  let nomes = 0;
  let semNome = 0;
  let ausentes = 0;
  let alocadas = 0;
  let livres = 0;
  let conflitos = 0;
  for (const v of vagas) {
    const e = estadoDaVaga(v, idx, ini, fim);
    if (temNome(v)) nomes++;
    else if (v.semNome) semNome++;
    if (e.situacao === "AUSENTE") ausentes++;
    if (e.situacao === "ALOCADA") alocadas++;
    if (e.situacao === "LIVRE") livres++;
    if (e.conflito) conflitos++;
  }
  const previstas = vagas.length;
  const ativa = equipe.status === "Ativa";
  const preenchidas = nomes + semNome;
  const situacaoRh: SituacaoRh = !ativa ? "EQUIPE NÃO ATIVA" : preenchidas < previstas ? "COM VAGAS" : ausentes > 0 ? "COM AUSÊNCIA" : "COMPLETA";
  const disponibilidade: Disponibilidade =
    !ativa || preenchidas < previstas || ausentes > 0 ? "INDISPONÍVEL" : alocadas > 0 ? "ALOCADA" : "DISPONÍVEL";
  return {
    ...equipe,
    vagasPrevistas: previstas,
    nomesPreenchidos: nomes,
    semNome,
    preenchidas,
    ausentes,
    alocacoes: alocadas,
    livres,
    conflitos,
    situacaoRh,
    disponibilidade,
  };
}

// ---------------------------------------------------------------- painel + resumo por grupo

export type ResumoGrupo = {
  grupo: string;
  total: number;
  disponiveis: number;
  alocadas: number;
  indisponiveis: number;
  pessoas: { vagas: number; preenchidas: number; semNome: number; livres: number; alocadas: number; ausentes: number; abertas: number };
};

export type Painel = {
  inicio: Dia;
  fim: Dia;
  /** So equipes de campo: a reserva de apoio nao entra aqui. */
  equipes: LinhaEquipe[];
  /** Pessoas da reserva de apoio na data (livres, ocupadas, ausentes). */
  reserva: ResumoGrupo["pessoas"];
  grupos: ResumoGrupo[];
  totais: {
    equipes: number;
    disponiveis: number;
    alocadas: number;
    indisponiveis: number;
    pessoas: ResumoGrupo["pessoas"];
    conflitos: number;
  };
};

export function ordenarGrupos(grupos: string[]): string[] {
  const unicos = Array.from(new Set(grupos));
  const conhecidos = GRUPOS.filter((g) => unicos.includes(g)) as string[];
  const outros = unicos.filter((g) => !(GRUPOS as readonly string[]).includes(g)).sort();
  return [...conhecidos, ...outros];
}

function pessoasVazio(): ResumoGrupo["pessoas"] {
  return { vagas: 0, preenchidas: 0, semNome: 0, livres: 0, alocadas: 0, ausentes: 0, abertas: 0 };
}

export function montarPainel(dados: DadosEfetivos, ini: Dia, fim: Dia = ini): Painel {
  const idx = indexar(dados);
  const vagasPorEquipe = new Map<string, VagaBase[]>();
  for (const v of dados.vagas) {
    if (!vagasPorEquipe.has(v.equipeId)) vagasPorEquipe.set(v.equipeId, []);
    vagasPorEquipe.get(v.equipeId)!.push(v);
  }
  const equipesDeCampo = dados.equipes.filter((e) => e.grupo !== GRUPO_RESERVA);
  const linhas = equipesDeCampo.map((e) => avaliarEquipe(e, vagasPorEquipe.get(e.id) ?? [], idx, ini, fim));

  const grupos: ResumoGrupo[] = ordenarGrupos(equipesDeCampo.map((e) => e.grupo)).map((g) => ({
    grupo: g,
    total: 0,
    disponiveis: 0,
    alocadas: 0,
    indisponiveis: 0,
    pessoas: pessoasVazio(),
  }));
  const porGrupo = new Map(grupos.map((g) => [g.grupo, g]));
  const totais = { equipes: 0, disponiveis: 0, alocadas: 0, indisponiveis: 0, pessoas: pessoasVazio(), conflitos: 0 };

  for (const l of linhas) {
    const g = porGrupo.get(l.grupo)!;
    g.total++;
    totais.equipes++;
    if (l.disponibilidade === "DISPONÍVEL") (g.disponiveis++, totais.disponiveis++);
    else if (l.disponibilidade === "ALOCADA") (g.alocadas++, totais.alocadas++);
    else (g.indisponiveis++, totais.indisponiveis++);
    totais.conflitos += l.conflitos;
    for (const v of vagasPorEquipe.get(l.id) ?? []) {
      const e = estadoDaVaga(v, idx, ini, fim);
      for (const alvo of [g.pessoas, totais.pessoas]) {
        alvo.vagas++;
        if (temNome(v)) alvo.preenchidas++;
        if (e.situacao === "LIVRE") alvo.livres++;
        else if (e.situacao === "ALOCADA") alvo.alocadas++;
        else if (e.situacao === "AUSENTE") alvo.ausentes++;
        else if (e.situacao === "SEM_NOME") alvo.semNome++;
        else alvo.abertas++;
      }
    }
  }
  const reserva = pessoasVazio();
  for (const e of dados.equipes.filter((x) => x.grupo === GRUPO_RESERVA)) {
    for (const v of vagasPorEquipe.get(e.id) ?? []) {
      const s = estadoDaVaga(v, idx, ini, fim).situacao;
      reserva.vagas++;
      if (temNome(v)) reserva.preenchidas++;
      if (s === "LIVRE") reserva.livres++;
      else if (s === "ALOCADA") reserva.alocadas++;
      else if (s === "AUSENTE") reserva.ausentes++;
      else if (s === "SEM_NOME") reserva.semNome++;
      else reserva.abertas++;
    }
  }
  return { inicio: ini, fim, equipes: linhas, reserva, grupos, totais };
}

// ---------------------------------------------------------------- quem esta livre (montar equipe)

export type PessoaLivre = VagaBase & { equipeCodigo: string; equipeNome: string; grupo: string; projeto: string };
export type PessoaIndisponivel = PessoaLivre & { situacao: Exclude<SituacaoPessoa, "LIVRE">; motivo: string | null; campanhaId: string | null };

/**
 * Quem esta livre em TODO o periodo [ini,fim]. Pessoa com ausencia ou alocacao em qualquer
 * dia do periodo nao e livre. Equipes inativas nao oferecem gente. `ignorarCampanhaId`
 * desconsidera as alocacoes da propria campanha (para editar a equipe que ja existe).
 */
export function livresNoPeriodo(
  dados: DadosEfetivos,
  ini: Dia,
  fim: Dia,
  opcoes: { ignorarCampanhaId?: string | null; grupo?: string | null } = {}
): { livres: PessoaLivre[]; indisponiveis: PessoaIndisponivel[] } {
  const idx = indexar(dados, opcoes.ignorarCampanhaId);
  const equipes = new Map(dados.equipes.map((e) => [e.id, e]));
  const livres: PessoaLivre[] = [];
  const indisponiveis: PessoaIndisponivel[] = [];
  for (const v of dados.vagas) {
    const eq = equipes.get(v.equipeId);
    if (!eq || eq.status === "Inativa") continue;
    if (opcoes.grupo && eq.grupo !== opcoes.grupo) continue;
    if (!temNome(v)) continue;
    const base: PessoaLivre = { ...v, equipeCodigo: eq.codigo, equipeNome: eq.nome, grupo: eq.grupo, projeto: eq.projeto };
    const e = estadoDaVaga(v, idx, ini, fim);
    if (e.situacao === "LIVRE") livres.push(base);
    else if (e.situacao !== "VAGA_ABERTA") indisponiveis.push({ ...base, situacao: e.situacao, motivo: e.motivo, campanhaId: e.campanhaId });
  }
  return { livres, indisponiveis };
}

export type ProblemaAlocacao = { vagaId: string; motivo: "INEXISTENTE" | "SEM_PROFISSIONAL" | "EQUIPE_INATIVA" | "AUSENTE" | "ALOCADA" | "PERIODO_INVALIDO"; detalhe: string | null };

/** Valida a escolha de pessoas para uma campanha; lista vazia = pode gravar. */
export function validarAlocacao(
  dados: DadosEfetivos,
  campanhaId: string,
  vagaIds: string[],
  ini: Dia,
  fim: Dia,
  // periodo proprio de quem entra so em parte da campanha (ex.: volta de ferias no meio)
  periodos: Record<string, { inicio: Dia; fim: Dia }> = {}
): ProblemaAlocacao[] {
  const idx = indexar(dados, campanhaId);
  const vagas = new Map(dados.vagas.map((v) => [v.id, v]));
  const equipes = new Map(dados.equipes.map((e) => [e.id, e]));
  const problemas: ProblemaAlocacao[] = [];
  for (const id of new Set(vagaIds)) {
    const v = vagas.get(id);
    if (!v) {
      problemas.push({ vagaId: id, motivo: "INEXISTENTE", detalhe: null });
      continue;
    }
    if (!temNome(v)) {
      problemas.push({ vagaId: id, motivo: "SEM_PROFISSIONAL", detalhe: null });
      continue;
    }
    if (equipes.get(v.equipeId)?.status === "Inativa") {
      problemas.push({ vagaId: id, motivo: "EQUIPE_INATIVA", detalhe: null });
      continue;
    }
    const p = periodos[id];
    if (p && (p.inicio > p.fim || p.inicio < ini || p.fim > fim)) {
      problemas.push({ vagaId: id, motivo: "PERIODO_INVALIDO", detalhe: null });
      continue;
    }
    const e = estadoDaVaga(v, idx, p?.inicio ?? ini, p?.fim ?? fim);
    if (e.situacao === "AUSENTE") problemas.push({ vagaId: id, motivo: "AUSENTE", detalhe: e.motivo });
    else if (e.situacao === "ALOCADA") problemas.push({ vagaId: id, motivo: "ALOCADA", detalhe: e.campanhaId ?? e.motivo });
  }
  return problemas;
}

// ---------------------------------------------------------------- por que alguem nao esta livre, e em que trechos esta

export type Bloqueio = {
  tipo: string; // "Férias", "Atestado", "Em 4362 LT", "Campanha CAM-001", status...
  inicio: Dia;
  fim: Dia;
  origem: "ausencia" | "status" | "outro_contrato" | "campanha";
  campanhaId?: string | null;
};

/** Tudo o que impede a pessoa de trabalhar dentro de [ini,fim], com as datas (para mostrar "Férias de 02/11 a 20/11"). */
export function bloqueiosNoPeriodo(vaga: VagaBase, idx: Indice, ini: Dia, fim: Dia): Bloqueio[] {
  const out: Bloqueio[] = [];
  const recorta = (a: Dia, b: Dia) => ({ inicio: a < ini ? ini : a, fim: b > fim ? fim : b });
  if (!STATUS_QUE_TRABALHAM.includes(vaga.status) && temNome(vaga)) {
    out.push({ tipo: vaga.status, inicio: ini, fim, origem: "status" });
  }
  for (const a of idx.ausencias.get(vaga.id) ?? []) {
    if (intersecta(a.inicio, a.fim, ini, fim)) out.push({ tipo: a.tipo, ...recorta(a.inicio, a.fim), origem: "ausencia" });
  }
  if (vaga.contratoAtual && !vaga.disponivelAPartir) {
    out.push({ tipo: `Em ${vaga.contratoAtual}`, inicio: ini, fim, origem: "outro_contrato" });
  } else if (vaga.disponivelAPartir && ini < vaga.disponivelAPartir) {
    out.push({ tipo: `Em ${vaga.contratoAtual ?? "outro contrato"}`, ...recorta(ini, somarDias(vaga.disponivelAPartir, -1)), origem: "outro_contrato" });
  }
  for (const a of idx.alocacoes.get(vaga.id) ?? []) {
    if (intersecta(a.inicio, a.fim, ini, fim)) out.push({ tipo: "Em campanha", ...recorta(a.inicio, a.fim), origem: "campanha", campanhaId: a.campanhaId });
  }
  return out.sort((a, b) => a.inicio.localeCompare(b.inicio) || a.fim.localeCompare(b.fim));
}

/** Trechos de [ini,fim] em que a pessoa esta livre (dias seguidos), para escalar so quem volta no meio da campanha. */
export function trechosLivres(vaga: VagaBase, idx: Indice, ini: Dia, fim: Dia): { inicio: Dia; fim: Dia }[] {
  if (ini > fim || !temNome(vaga)) return [];
  const out: { inicio: Dia; fim: Dia }[] = [];
  let atual: { inicio: Dia; fim: Dia } | null = null;
  for (let d = ini; d <= fim; d = somarDias(d, 1)) {
    const livre = estadoDaVaga(vaga, idx, d).situacao === "LIVRE";
    if (livre) {
      if (atual) atual.fim = d;
      else atual = { inicio: d, fim: d };
    } else if (atual) {
      out.push(atual);
      atual = null;
    }
  }
  if (atual) out.push(atual);
  return out;
}

// ---------------------------------------------------------------- campanha x capacidade

export type Atendimento = "CAPACIDADE SUFICIENTE" | "ATENDIMENTO PARCIAL" | "SEM EQUIPE DISPONÍVEL";

export type AtendimentoCampanha = {
  equipesDisponiveis: number; // equipes-base completas, sem ausencia e sem alocacao em todo o periodo
  saldo: number; // disponiveis - demanda
  atendimento: Atendimento;
  pessoasLivresNoGrupo: number;
  pessoasAlocadas: number; // ja reservadas para esta campanha
};

export function atendimentoDaCampanha(dados: DadosEfetivos, c: CampanhaBase): AtendimentoCampanha {
  const idx = indexar(dados, c.id);
  const vagasPorEquipe = new Map<string, VagaBase[]>();
  for (const v of dados.vagas) {
    if (!vagasPorEquipe.has(v.equipeId)) vagasPorEquipe.set(v.equipeId, []);
    vagasPorEquipe.get(v.equipeId)!.push(v);
  }
  let disponiveis = 0;
  for (const e of dados.equipes) {
    if (e.grupo !== c.grupo) continue;
    const l = avaliarEquipe(e, vagasPorEquipe.get(e.id) ?? [], idx, c.inicio, c.fim);
    if (l.disponibilidade === "DISPONÍVEL") disponiveis++;
  }
  const atendimento: Atendimento =
    disponiveis >= c.qtdEquipes ? "CAPACIDADE SUFICIENTE" : disponiveis > 0 ? "ATENDIMENTO PARCIAL" : "SEM EQUIPE DISPONÍVEL";
  const livres = livresNoPeriodo(dados, c.inicio, c.fim, { ignorarCampanhaId: c.id, grupo: c.grupo }).livres.length;
  const alocadas = dados.alocacoes.filter((a) => a.campanhaId === c.id).length;
  return { equipesDisponiveis: disponiveis, saldo: disponiveis - c.qtdEquipes, atendimento, pessoasLivresNoGrupo: livres, pessoasAlocadas: alocadas };
}

// ---------------------------------------------------------------- agora e depois

export type PontoDisponibilidade = {
  data: Dia;
  porGrupo: Record<string, { equipesDisponiveis: number; equipesAlocadas: number; equipesIndisponiveis: number; livres: number; alocadas: number; ausentes: number; abertas: number }>;
};

/** Disponibilidade nos dias pedidos (hoje, +7, +30...), por grupo. */
export function serieDisponibilidade(dados: DadosEfetivos, dias: Dia[]): PontoDisponibilidade[] {
  return dias.map((dia) => {
    const p = montarPainel(dados, dia);
    const porGrupo: PontoDisponibilidade["porGrupo"] = {};
    for (const g of p.grupos) {
      porGrupo[g.grupo] = {
        equipesDisponiveis: g.disponiveis,
        equipesAlocadas: g.alocadas,
        equipesIndisponiveis: g.indisponiveis,
        livres: g.pessoas.livres,
        alocadas: g.pessoas.alocadas,
        ausentes: g.pessoas.ausentes,
        abertas: g.pessoas.abertas,
      };
    }
    return { data: dia, porGrupo };
  });
}

export type BalancoGrupo = {
  grupo: string;
  demandaEquipes: number; // soma de equipes pedidas pelas campanhas que cobrem o dia
  equipesCompletas: number; // equipes ativas com todas as vagas preenchidas e ninguem ausente
  vagasAbertas: number;
  saldo: number; // completas - demanda; negativo = faltam equipes (contratar ou realocar)
};

/** Capacidade (equipes completas) contra a demanda das campanhas vivas no dia, por grupo. */
export function balancoCapacidade(dados: DadosEfetivos, campanhas: CampanhaBase[], dia: Dia): BalancoGrupo[] {
  // alocacoes ignoradas de proposito: capacidade e quem existe, nao quem esta livre
  const idx = indexar({ ausencias: dados.ausencias, alocacoes: [] });
  const vagasPorEquipe = new Map<string, VagaBase[]>();
  for (const v of dados.vagas) {
    if (!vagasPorEquipe.has(v.equipeId)) vagasPorEquipe.set(v.equipeId, []);
    vagasPorEquipe.get(v.equipeId)!.push(v);
  }
  return ordenarGrupos([...dados.equipes.map((e) => e.grupo), ...campanhas.map((c) => c.grupo)]).map((grupo) => {
    let completas = 0;
    let abertas = 0;
    for (const e of dados.equipes.filter((x) => x.grupo === grupo)) {
      const vs = vagasPorEquipe.get(e.id) ?? [];
      const l = avaliarEquipe(e, vs, idx, dia);
      if (l.situacaoRh === "COMPLETA") completas++;
      abertas += vs.filter((v) => !temNome(v)).length;
    }
    const demanda = campanhas
      .filter((c) => c.grupo === grupo && !STATUS_CAMPANHA_QUE_LIBERAM.includes(c.status) && intersecta(c.inicio, c.fim, dia, dia))
      .reduce((s, c) => s + c.qtdEquipes, 0);
    return { grupo, demandaEquipes: demanda, equipesCompletas: completas, vagasAbertas: abertas, saldo: completas - demanda };
  });
}

// ---------------------------------------------------------------- necessidade da campanha x quem existe (vacancia)

export type ItemNecessidade = { cargo: string; qtd: number };
export type LinhaNecessidade = {
  cargo: string;
  pedido: number; // o que a campanha pede
  escalados: number; // ja na equipe
  livresRestantes: number; // livres no periodo e ainda fora da equipe
  falta: number; // pedido - escalados (nunca negativo)
  semGente: number; // quanto da falta nao tem ninguem livre para cobrir: contratar ou realocar
};

/**
 * Compara o que a campanha pede, por funcao, com a equipe escalada e com quem esta livre no periodo.
 * "semGente" e a vacancia de verdade: falta profissional e nao ha ninguem livre da funcao.
 * Funcoes escaladas que a campanha nao pediu entram em `extras`.
 */
export function conferirNecessidade(
  necessidade: ItemNecessidade[],
  escalados: { cargo: string }[],
  livresRestantes: { cargo: string }[]
): { linhas: LinhaNecessidade[]; extras: { cargo: string; n: number }[]; falta: number; semGente: number } {
  const contar = (xs: { cargo: string }[]) => {
    const m = new Map<string, number>();
    for (const x of xs) m.set(x.cargo, (m.get(x.cargo) ?? 0) + 1);
    return m;
  };
  const esc = contar(escalados);
  const liv = contar(livresRestantes);
  const pedidos = new Map<string, number>();
  for (const n of necessidade) pedidos.set(n.cargo, (pedidos.get(n.cargo) ?? 0) + n.qtd);
  const linhas: LinhaNecessidade[] = [...pedidos.entries()].map(([cargo, pedido]) => {
    const e = esc.get(cargo) ?? 0;
    const l = liv.get(cargo) ?? 0;
    const falta = Math.max(0, pedido - e);
    return { cargo, pedido, escalados: e, livresRestantes: l, falta, semGente: Math.max(0, falta - l) };
  });
  const extras = [...esc.entries()].filter(([c]) => !pedidos.has(c)).map(([cargo, n]) => ({ cargo, n }));
  return { linhas, extras, falta: linhas.reduce((s, l) => s + l.falta, 0), semGente: linhas.reduce((s, l) => s + l.semGente, 0) };
}
