// Regras de movimentação de pessoas e vagas (sem banco): desmobilizar abre vaga, puxar um colaborador para uma equipe
// ocupa uma vaga (ou cria a posição), e quem sai de uma equipe deixa a vaga aberta no lugar dele.

export type PosicaoDaEquipe = {
  atividade: string;
  empresa: string;
  cargo: string;
  nivel: string | null;
  direcao4x4: boolean | null;
  veiculoId: string | null;
  grupo: string | null;
  contrato: string | null;
  equipeContrato: string | null;
};

/** A vaga que fica aberta no lugar de quem saiu: mesma função, empresa, atividade, nível e viatura; sem nome. */
export function vagaAbertaNoLugarDe(p: PosicaoDaEquipe) {
  return {
    atividade: p.atividade,
    empresa: p.empresa,
    cargo: p.cargo,
    nivel: p.nivel,
    direcao4x4: p.direcao4x4,
    veiculoId: p.veiculoId,
    grupo: p.grupo,
    contrato: p.contrato,
    equipeContrato: p.equipeContrato,
    nome: null as string | null,
    semNome: false,
    status: "Vigente",
  };
}

/** O que muda no registro da pessoa quando ela entra numa equipe (e, se houver, ocupa uma vaga aberta dela). */
export function dadosAoEntrarNaEquipe(
  pessoa: { atividade: string; nivel: string | null; direcao4x4: boolean | null; veiculoId: string | null; contrato: string | null },
  equipe: { id: string; nome: string; projeto: string },
  vaga?: { atividade: string; nivel: string | null; direcao4x4: boolean | null; veiculoId: string | null } | null
) {
  const contratoDaEquipe = equipe.projeto && equipe.projeto !== "A definir" ? equipe.projeto : null;
  return {
    equipeId: equipe.id,
    // trabalha no contrato da equipe; se a equipe ainda não tem contrato, fica o que a pessoa já tinha
    contrato: contratoDaEquipe ?? pessoa.contrato,
    equipeContrato: equipe.nome,
    // a vaga que ele ocupa traz a atividade, o nível, o 4x4 e a viatura do lugar (sem apagar o que a pessoa já tem)
    atividade: vaga?.atividade ?? pessoa.atividade,
    nivel: pessoa.nivel ?? vaga?.nivel ?? null,
    direcao4x4: pessoa.direcao4x4 ?? vaga?.direcao4x4 ?? null,
    veiculoId: vaga?.veiculoId ?? null,
  };
}

/** Uma posição sem pessoa que pode ser ocupada: vaga aberta de verdade ou posição preenchida sem nome. */
export const posicaoLivreParaOcupar = (v: { nome: string | null }) => !v.nome || v.nome.trim() === "";

/** Texto do histórico quando alguém sai de uma equipe. */
export function textoDaDesmobilizacao(equipeNome: string, dia: string, destino: "reserva" | "desligado", motivo?: string | null): string {
  const quando = `${dia.slice(8, 10)}/${dia.slice(5, 7)}/${dia.slice(0, 4)}`;
  const para = destino === "desligado" ? "desmobilizado(a)" : "disponível para outra equipe";
  return `Saiu de "${equipeNome}" em ${quando} — ${para}${motivo ? ` (${motivo})` : ""}`;
}
