// Movimentar uma equipe: a equipe passa a estar em outro contrato/frente a partir de uma data. Cada passagem fica registrada
// (como na frota) e nada se apaga: ao movimentar, a passagem aberta é fechada no dia anterior.
import { somarDias, type Dia } from "./disponibilidade";
import { planejarMovimento } from "./veiculos";

export type PassagemEquipe = { id: string; inicio: Dia; fim: Dia | null; projeto: string; local: string | null };

export type PlanoEquipe =
  | {
      ok: true;
      fecharAnterior: { id: string; fim: Dia } | null;
      /** primeira movimentação da equipe: guarda de onde ela vinha, para o histórico não começar do nada */
      criarAnterior: { inicio: Dia; fim: Dia; projeto: string; local: string | null } | null;
      fimNovo: Dia | null;
    }
  | { ok: false; erro: string };

export function planejarMovimentoDeEquipe(
  passagens: PassagemEquipe[],
  equipe: { projeto: string; local: string | null; inicio: Dia | null; criadaEm: Dia },
  novo: { inicio: Dia; fim: Dia | null }
): PlanoEquipe {
  const plano = planejarMovimento(
    passagens.map((p) => ({ id: p.id, veiculoId: "", inicio: p.inicio, fim: p.fim, projeto: p.projeto, equipeId: null, campanhaId: null, local: p.local })),
    novo
  );
  if (!plano.ok) return plano;
  if (passagens.length > 0) return { ok: true, fecharAnterior: plano.fecharAnterior, criarAnterior: null, fimNovo: plano.fimNovo };
  const fimAnterior = somarDias(novo.inicio, -1);
  const inicioAnterior = [equipe.inicio ?? equipe.criadaEm, fimAnterior].sort()[0];
  return { ok: true, fecharAnterior: null, criarAnterior: { inicio: inicioAnterior, fim: fimAnterior, projeto: equipe.projeto, local: equipe.local }, fimNovo: plano.fimNovo };
}

/** Contrato em que a equipe está no dia: o da passagem que cobre o dia; senão, o cadastrado na equipe. */
export function contratoDaEquipeNoDia(passagens: Pick<PassagemEquipe, "inicio" | "fim" | "projeto">[], projetoCadastrado: string, dia: Dia): string {
  const p = passagens.find((x) => x.inicio <= dia && (!x.fim || dia <= x.fim));
  return p ? p.projeto : projetoCadastrado;
}
