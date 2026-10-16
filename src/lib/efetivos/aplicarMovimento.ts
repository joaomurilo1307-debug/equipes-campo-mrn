// Aplica, no banco, um pedido da aba MOVIMENTAÇÕES já conferido pelo planejamento. Usa as mesmas regras das telas
// (Mover / Liberar / Desmobilizar / Status): quem sai de uma equipe deixa a vaga aberta no lugar, e quem entra leva os dados da nova equipe.
import type { Prisma } from "@prisma/client";
import { clienteDaEquipeNoBanco, dataDe, obterReserva, proximoNumeroDeVaga } from "./servidor";
import type { MovimentoPlanejado } from "./planejamento";
import { dadosAoEntrarNaEquipe, textoDaDesmobilizacao, vagaAbertaNoLugarDe } from "./vagas";

const fmt = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

/** Devolve o texto para o histórico (ou null se a posição ou o destino sumiram no meio do caminho). */
export async function aplicarMovimento(tx: Prisma.TransactionClient, m: MovimentoPlanejado, hojeIso: string): Promise<string | null> {
  const pessoa = await tx.efetivoVaga.findUnique({ where: { id: m.vagaId }, include: { equipe: true } });
  if (!pessoa || !pessoa.nome) return null;
  const dia = m.data ?? hojeIso;
  const nota = (extra: string) => [pessoa.observacao, extra, m.observacao ? `Movimentação ${fmt(dia)}: ${m.observacao}` : null].filter(Boolean).join(" · ");

  if (m.acao === "mover") {
    const destino = m.destinoEquipeId ? await tx.efetivoEquipe.findUnique({ where: { id: m.destinoEquipeId } }) : null;
    if (!destino || destino.id === pessoa.equipeId) return null;
    const veioDeEquipe = pessoa.equipe.grupo !== "Apoio";
    if (veioDeEquipe) {
      await tx.efetivoVaga.create({ data: { numero: await proximoNumeroDeVaga(tx), equipeId: pessoa.equipeId, ...vagaAbertaNoLugarDe(pessoa), observacao: `Vaga aberta pela saída de ${pessoa.nome}` } });
    }
    await tx.efetivoVaga.update({ where: { id: pessoa.id }, data: { ...dadosAoEntrarNaEquipe(pessoa, destino, null), ...(m.observacao ? { observacao: nota("") } : {}) } });
    return `${pessoa.nome}: ${veioDeEquipe ? `equipe ${pessoa.equipe.codigo}` : "fora das equipes"} → ${destino.codigo} (${destino.nome}) em ${fmt(dia)}${veioDeEquipe ? `; vaga aberta em ${pessoa.equipe.codigo}` : ""}`;
  }

  if (m.acao === "liberar" || m.acao === "desmobilizar") {
    if (pessoa.equipe.grupo === "Apoio") return null;
    const destino = m.acao === "desmobilizar" ? "desligado" : "reserva";
    const reserva = await obterReserva(tx, await clienteDaEquipeNoBanco(pessoa.equipe));
    await tx.efetivoVaga.create({ data: { numero: await proximoNumeroDeVaga(tx), equipeId: pessoa.equipeId, ...vagaAbertaNoLugarDe(pessoa), observacao: `Vaga aberta pela saída de ${pessoa.nome}` } });
    await tx.efetivoVaga.update({
      where: { id: pessoa.id },
      data: { equipeId: reserva.id, veiculoId: null, status: destino === "desligado" ? "Desmobilizado" : pessoa.status, observacao: [pessoa.observacao, textoDaDesmobilizacao(pessoa.equipe.nome, dia, destino, m.observacao)].filter(Boolean).join(" · ") },
    });
    return `${pessoa.nome} saiu da equipe ${pessoa.equipe.codigo} (${pessoa.equipe.nome}) em ${fmt(dia)}${destino === "desligado" ? ", desmobilizado" : ", disponível"}; vaga aberta no lugar`;
  }

  // mudar status: o status, ou a ausência com período (a pessoa segue Vigente)
  if (m.status && m.status !== pessoa.status) await tx.efetivoVaga.update({ where: { id: pessoa.id }, data: { status: m.status, ...(m.observacao ? { observacao: nota("") } : {}) } });
  if (m.ausencia) await tx.efetivoAusencia.create({ data: { vagaId: pessoa.id, tipo: m.ausencia.tipo, inicio: dataDe(m.ausencia.inicio), fim: dataDe(m.ausencia.fim) } });
  return `${pessoa.nome}: ${m.ausencia ? `${m.ausencia.tipo} de ${fmt(m.ausencia.inicio)} a ${fmt(m.ausencia.fim)}` : `status ${pessoa.status} → ${m.status}`}`;
}
