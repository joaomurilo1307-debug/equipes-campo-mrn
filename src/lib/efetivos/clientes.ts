// Clientes (MRN, AGA...): cada contrato é de um cliente, e cada equipe, pessoa e viatura herdam o cliente do contrato.
// O usuário com acesso restrito a um cliente só enxerga e mexe no que é dele; a administração (sem cliente) vê tudo e é
// quem movimenta pessoas, viaturas e equipes de um cliente para o outro. Uma regra só, usada no servidor e na tela.

export const CLIENTES_PADRAO = ["MRN", "AGA"] as const;
export const GRUPO_RESERVA_CLIENTE = "Apoio";

type Contrato = { codigo: string; cliente: string | null; ativo?: boolean };
type EquipeC = { id: string; projeto: string; grupo?: string; cliente?: string | null };

/** O cliente de uma equipe: o do contrato dela; sem contrato cadastrado, o da própria equipe (reserva, equipe nova). */
export function clienteDaEquipe(e: { projeto: string; cliente?: string | null }, contratos: Contrato[]): string | null {
  return contratos.find((c) => c.codigo === e.projeto)?.cliente?.trim() || e.cliente?.trim() || null;
}

export type DadosFiltraveis = {
  equipes: (EquipeC & Record<string, unknown>)[];
  vagas: { id: string; equipeId: string; veiculoId: string | null }[];
  ausencias: { vagaId: string }[];
  campanhas: { id: string; projeto: string }[];
  alocacoes: { campanhaId: string; vagaId: string }[];
  veiculos: { id: string; cliente?: string | null }[];
  movimentos: { veiculoId: string }[];
  contratos: Contrato[];
  movimentosEquipe: { equipeId: string }[];
  /** a viatura em cada equipe (opcional) */
  usosVeiculo?: { veiculoId: string; equipeId: string }[];
};

/**
 * Só o que é do cliente. `cliente` nulo = tudo. Viatura: a que está marcada com o cliente, ou (sem marca) a que as pessoas
 * do cliente usam. Contrato sem cliente só aparece para quem vê tudo.
 */
export function filtrarPorCliente<T extends DadosFiltraveis>(d: T, cliente: string | null): T {
  if (!cliente) return d;
  const equipes = d.equipes.filter((e) => clienteDaEquipe(e, d.contratos) === cliente);
  const idsEquipes = new Set(equipes.map((e) => e.id));
  const vagas = d.vagas.filter((v) => idsEquipes.has(v.equipeId));
  const idsVagas = new Set(vagas.map((v) => v.id));
  const usadas = new Set(vagas.map((v) => v.veiculoId).filter((x): x is string => !!x));
  const veiculos = d.veiculos.filter((v) => (v.cliente ? v.cliente === cliente : usadas.has(v.id)));
  const idsVeiculos = new Set(veiculos.map((v) => v.id));
  const contratos = d.contratos.filter((c) => c.cliente?.trim() === cliente);
  const campanhas = d.campanhas.filter((c) => contratos.some((x) => x.codigo === c.projeto));
  const idsCampanhas = new Set(campanhas.map((c) => c.id));
  return {
    ...d,
    equipes,
    vagas,
    ausencias: d.ausencias.filter((a) => idsVagas.has(a.vagaId)),
    campanhas,
    alocacoes: d.alocacoes.filter((a) => idsCampanhas.has(a.campanhaId)),
    veiculos,
    movimentos: d.movimentos.filter((m) => idsVeiculos.has(m.veiculoId)),
    contratos,
    movimentosEquipe: d.movimentosEquipe.filter((m) => idsEquipes.has(m.equipeId)),
    ...(d.usosVeiculo ? { usosVeiculo: d.usosVeiculo.filter((u) => idsEquipes.has(u.equipeId) && idsVeiculos.has(u.veiculoId)) } : {}),
  };
}

/** Os clientes que existem nos dados (contratos e equipes), mais os padrão. */
export function clientesDosDados(d: Pick<DadosFiltraveis, "contratos"> & { equipes: { cliente?: string | null }[] }): string[] {
  const s = new Set<string>();
  for (const c of d.contratos) if (c.cliente?.trim()) s.add(c.cliente.trim());
  for (const e of d.equipes) if (e.cliente?.trim()) s.add(e.cliente.trim());
  return [...s].sort((a, b) => a.localeCompare(b, "pt-BR"));
}
