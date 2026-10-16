// Apoio das rotas /api/efetivos: nivel de acesso, carga dos dados e mascara de dado sensivel.
// Papeis: ADMIN (Joao) e EDITOR (Samuel) montam e movimentam; VISUALIZADOR so consulta.

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { alocacoesQueSeguram, type Dia } from "./disponibilidade";
import { dadosMock, modoMock } from "@/lib/devMock";
import { instanteBrasilia } from "./hoje";
import { filtrarPorCliente } from "./clientes";

export type NivelEfetivos = "ADMIN" | "EDITOR" | "DASHBOARD";

export const diaDe = (d: Date | null | undefined): Dia | null => (d ? d.toISOString().slice(0, 10) : null);
export const dataDe = (dia: Dia): Date => new Date(`${dia}T00:00:00.000Z`);

/** A necessidade fica em JSON no banco; aqui so passa o que tem o formato certo. */
export function lerNecessidade(v: unknown): { cargo: string; qtd: number }[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is { cargo: string; qtd: number } => !!x && typeof x.cargo === "string" && Number.isInteger(x.qtd) && x.qtd > 0);
}

const NIVEL_POR_PAPEL: Record<string, NivelEfetivos> = { ADMIN: "ADMIN", EDITOR: "EDITOR", VISUALIZADOR: "DASHBOARD" };

export const podeEditar = (n: NivelEfetivos | null) => n === "ADMIN" || n === "EDITOR";

type Exigencia = "ver" | "editar" | "admin" | "global";

export type Acesso = {
  userId: string;
  nome: string;
  nivel: NivelEfetivos;
  /** cliente a que o usuário está restrito (MRN, AGA...); nulo = vê e mexe em todos os clientes */
  cliente: string | null;
};

/**
 * Autentica e confere o nivel; devolve a resposta de erro pronta quando nao pode.
 * "global" = quem edita E não está restrito a um cliente (importar bases, histórico geral, campanhas).
 */
export async function exigir(exigencia: Exigencia): Promise<{ erro: NextResponse } | Acesso> {
  // DEV_MOCK_CLIENTE simula um usuário restrito a um cliente (só para olhar a tela em desenvolvimento)
  if (modoMock()) return { userId: "dev", nome: "Demonstração", nivel: "ADMIN", cliente: process.env.DEV_MOCK_CLIENTE?.trim() || null };
  const session = await getServerSession(authOptions);
  const u = session?.user as any;
  if (!session || !u?.id) return { erro: NextResponse.json({ error: "Não autenticado" }, { status: 401 }) };
  const nivel = NIVEL_POR_PAPEL[u.role as string] ?? null;
  const ok = exigencia === "ver" ? nivel !== null : exigencia === "admin" ? nivel === "ADMIN" : podeEditar(nivel);
  if (!ok || !nivel) {
    return {
      erro: NextResponse.json(
        { error: exigencia === "admin" ? "Somente o administrador pode fazer isso" : "Seu acesso é só de consulta" },
        { status: 403 }
      ),
    };
  }
  // o escopo vem do banco a cada pedido: mudar o cliente de um usuário vale na hora
  const dono = await prisma.user.findUnique({ where: { id: u.id }, select: { cliente: true, active: true } });
  if (!dono || !dono.active) return { erro: NextResponse.json({ error: "Acesso desativado" }, { status: 401 }) };
  const cliente = dono.cliente?.trim() || null;
  if (exigencia === "global" && cliente) {
    return { erro: NextResponse.json({ error: `Seu acesso é restrito ao cliente ${cliente}. Isto é da administração.` }, { status: 403 }) };
  }
  return { userId: u.id, nome: u.name ?? u.email ?? "Usuário", nivel, cliente };
}

// ---------------------------------------------------------------- acesso por cliente

/** O cliente de uma equipe pelo banco: o do contrato dela; sem contrato cadastrado, o da equipe. */
export async function clienteDaEquipeNoBanco(e: { projeto: string; cliente: string | null }): Promise<string | null> {
  const c = await prisma.efetivoContrato.findUnique({ where: { codigo: e.projeto }, select: { cliente: true } });
  return c?.cliente?.trim() || e.cliente?.trim() || null;
}

const FORA = (cliente: string) => NextResponse.json({ error: `Isto não é do cliente ${cliente}: seu acesso é restrito a ${cliente}. Peça à administração.` }, { status: 403 });

/**
 * Para quem está restrito a um cliente: confere se o que vai mexer é desse cliente. Devolve a resposta de erro, ou null se pode.
 * Quem vê tudo (cliente nulo) passa sempre. Equipe, pessoa (vaga), viatura, contrato e ausência valem; o que não existe passa
 * (a própria rota responde 404).
 */
export async function foraDoEscopo(
  a: { cliente: string | null },
  alvo: { equipeId?: string | null; vagaId?: string | null; veiculoId?: string | null; contrato?: string | null; contratoId?: string | null; ausenciaId?: string | null }
): Promise<NextResponse | null> {
  const cli = a.cliente;
  if (!cli) return null;
  if (alvo.equipeId) {
    const e = await prisma.efetivoEquipe.findUnique({ where: { id: alvo.equipeId } });
    if (e && (await clienteDaEquipeNoBanco(e)) !== cli) return FORA(cli);
  }
  if (alvo.vagaId) {
    const v = await prisma.efetivoVaga.findUnique({ where: { id: alvo.vagaId }, include: { equipe: true } });
    if (v && (await clienteDaEquipeNoBanco(v.equipe)) !== cli) return FORA(cli);
  }
  if (alvo.ausenciaId) {
    const x = await prisma.efetivoAusencia.findUnique({ where: { id: alvo.ausenciaId }, include: { vaga: { include: { equipe: true } } } });
    if (x && (await clienteDaEquipeNoBanco(x.vaga.equipe)) !== cli) return FORA(cli);
  }
  if (alvo.veiculoId) {
    const v = await prisma.efetivoVeiculo.findUnique({ where: { id: alvo.veiculoId }, include: { ocupantes: { include: { equipe: true }, take: 1 } } });
    if (v) {
      const dele = v.cliente?.trim() || (v.ocupantes[0] ? await clienteDaEquipeNoBanco(v.ocupantes[0].equipe) : null);
      if (dele !== cli) return FORA(cli);
    }
  }
  if (alvo.contratoId) {
    const c = await prisma.efetivoContrato.findUnique({ where: { id: alvo.contratoId } });
    if (c && c.cliente?.trim() !== cli) return FORA(cli);
  }
  if (alvo.contrato) {
    const c = await prisma.efetivoContrato.findUnique({ where: { codigo: alvo.contrato } });
    // contrato ainda não cadastrado (ex.: "A definir") não pertence a outro cliente
    if (c && c.cliente?.trim() !== cli) return FORA(cli);
  }
  return null;
}

/** Registra no historico quem fez o que (nunca derruba a operacao principal). */
export async function registrar(userId: string | null, acao: string, entidade: string, entidadeId: string | undefined, resumo: string) {
  try {
    const usuario = userId ? await prisma.user.findUnique({ where: { id: userId }, select: { name: true } }) : null;
    await prisma.auditLog.create({
      data: { userId, userName: usuario?.name ?? null, action: acao, entityType: entidade, entityId: entidadeId, resumo },
    });
  } catch {
    // auditoria nunca deve derrubar a operação principal
  }
}

// Status de saude/afastamento aparecem para quem so consulta como simples "Indisponível" (LGPD).
const STATUS_SENSIVEIS = ["Afastado", "Apto com restrição"];

/**
 * Movimentação agendada: quando chega o dia, a equipe passa a ter o contrato (e a frente) da passagem em vigor, e as pessoas
 * dela que estavam no contrato antigo acompanham. Roda ao abrir os dados; não precisa de tarefa agendada.
 */
async function aplicarMovimentosDeEquipe() {
  try {
    const hoje = dataDe(instanteBrasilia().iso);
    const vigentes = await prisma.efetivoEquipeMovimento.findMany({ where: { inicio: { lte: hoje }, OR: [{ fim: null }, { fim: { gte: hoje } }] }, include: { equipe: true } });
    for (const m of vigentes) {
      if (m.equipe.projeto === m.projeto) continue;
      const contrato = await prisma.efetivoContrato.findUnique({ where: { codigo: m.projeto } });
      await prisma.$transaction([
        prisma.efetivoEquipe.update({ where: { id: m.equipeId }, data: { projeto: m.projeto, contratoConfirmado: true, ...(m.local ? { local: m.local } : {}), ...(contrato?.gestor ? { gestor: contrato.gestor } : {}) } }),
        prisma.efetivoVaga.updateMany({ where: { equipeId: m.equipeId, OR: [{ contrato: m.equipe.projeto }, { contrato: null }] }, data: { contrato: m.projeto } }),
      ]);
    }
  } catch {
    // aplicar a agenda nunca deve impedir de abrir os dados
  }
}

async function carregarDadosReal(editor: boolean, cliente: string | null) {
  await aplicarMovimentosDeEquipe();
  const [equipes, vagas, ausencias, campanhas, alocacoes, veiculos, movimentos, contratos, movimentosEquipe, usos] = await Promise.all([
    prisma.efetivoEquipe.findMany({ orderBy: [{ ordem: "asc" }, { codigo: "asc" }] }),
    prisma.efetivoVaga.findMany({ orderBy: [{ numero: "asc" }, { criadoEm: "asc" }] }),
    prisma.efetivoAusencia.findMany({ orderBy: { inicio: "asc" } }),
    prisma.efetivoCampanha.findMany({ orderBy: [{ inicio: "asc" }, { codigo: "asc" }] }),
    prisma.efetivoAlocacao.findMany(),
    prisma.efetivoVeiculo.findMany({ orderBy: { codigo: "asc" } }),
    prisma.efetivoVeiculoMovimento.findMany({ orderBy: { inicio: "asc" } }),
    prisma.efetivoContrato.findMany({ orderBy: { codigo: "asc" } }),
    prisma.efetivoEquipeMovimento.findMany({ orderBy: { inicio: "asc" } }),
    prisma.efetivoVeiculoUso.findMany({ orderBy: [{ inicio: "asc" }, { criadoEm: "asc" }] }),
  ]);
  const bruto = {
    equipes: equipes.map((e) => ({
      id: e.id,
      codigo: e.codigo,
      nome: e.nome,
      projeto: e.projeto,
      contratoConfirmado: e.contratoConfirmado,
      gestor: e.gestor,
      grupo: e.grupo,
      local: e.local,
      observacao: e.observacao,
      status: e.status,
      inicio: diaDe(e.inicio),
      fim: diaDe(e.fim),
      campanhaId: e.campanhaId,
      cliente: e.cliente,
    })),
    vagas: vagas.map((v) => ({
      id: v.id,
      numero: v.numero,
      equipeId: v.equipeId,
      nome: v.nome,
      status: editor || !STATUS_SENSIVEIS.includes(v.status) ? v.status : "Indisponível",
      cargo: v.cargo,
      empresa: v.empresa,
      atividade: v.atividade,
      previsaoInicio: diaDe(v.previsaoInicio),
      nivel: v.nivel,
      direcao4x4: v.direcao4x4,
      contratoAtual: v.contratoAtual,
      disponivelAPartir: diaDe(v.disponivelAPartir),
      destino: v.destino,
      veiculoId: v.veiculoId,
      contrato: v.contrato,
      equipeContrato: v.equipeContrato,
      grupo: v.grupo,
      semNome: v.semNome,
      observacao: editor ? v.observacao : null,
      origem: v.origem,
      conferir: v.conferir,
    })),
    ausencias: ausencias.map((a) => ({
      id: a.id,
      vagaId: a.vagaId,
      tipo: editor ? a.tipo : "Ausente",
      inicio: diaDe(a.inicio)!,
      fim: diaDe(a.fim)!,
      observacao: editor ? a.observacao : null,
    })),
    campanhas: campanhas.map((c) => ({
      id: c.id,
      codigo: c.codigo,
      recebidaEm: diaDe(c.recebidaEm),
      solicitante: c.solicitante,
      projeto: c.projeto,
      grupo: c.grupo,
      atividade: c.atividade,
      local: c.local,
      equipeNome: c.equipeNome,
      necessidade: lerNecessidade(c.necessidade),
      inicio: diaDe(c.inicio)!,
      fim: diaDe(c.fim)!,
      qtdEquipes: c.qtdEquipes,
      prioridade: c.prioridade,
      status: c.status,
      observacao: c.observacao,
    })),
    alocacoes: alocacoes.map((a) => ({ id: a.id, campanhaId: a.campanhaId, vagaId: a.vagaId, inicio: diaDe(a.inicio)!, fim: diaDe(a.fim)! })),
    veiculos: veiculos.map((v) => ({
      id: v.id,
      codigo: v.codigo,
      identificacao: v.identificacao,
      placa: v.placa,
      modelo: v.modelo,
      tracao4x4: v.tracao4x4,
      status: v.status,
      observacao: v.observacao,
      cliente: v.cliente,
      substituidoPorId: v.substituidoPorId,
      trocaEm: diaDe(v.trocaEm),
    })),
    usosVeiculo: usos.map((u) => ({ id: u.id, veiculoId: u.veiculoId, equipeId: u.equipeId, inicio: diaDe(u.inicio), fim: diaDe(u.fim), observacao: u.observacao })),
    movimentos: movimentos.map((m) => ({
      id: m.id,
      veiculoId: m.veiculoId,
      inicio: diaDe(m.inicio)!,
      fim: diaDe(m.fim),
      projeto: m.projeto,
      equipeId: m.equipeId,
      campanhaId: m.campanhaId,
      local: m.local,
      observacao: m.observacao,
    })),
    contratos: contratos.map((c) => ({ id: c.id, codigo: c.codigo, nome: c.nome, cliente: c.cliente, gestor: c.gestor, local: c.local, observacao: c.observacao, ativo: c.ativo })),
    movimentosEquipe: movimentosEquipe.map((m) => ({ id: m.id, equipeId: m.equipeId, inicio: diaDe(m.inicio)!, fim: diaDe(m.fim), projeto: m.projeto, local: m.local, observacao: m.observacao })),
  };
  // quem está restrito a um cliente só recebe o que é dele (contratos, equipes, pessoas, viaturas, ausências...)
  return filtrarPorCliente(bruto, cliente);
}

export async function carregarDados(editor: boolean, cliente: string | null = null): Promise<Awaited<ReturnType<typeof carregarDadosReal>>> {
  return modoMock() ? filtrarPorCliente(dadosMock() as Awaited<ReturnType<typeof carregarDadosReal>>, cliente) : carregarDadosReal(editor, cliente);
}

/** Dados no formato que a regra de disponibilidade espera (so alocacoes que seguram gente). */
export async function dadosParaRegra() {
  const d = await carregarDados(true);
  return {
    brutos: d,
    regra: {
      equipes: d.equipes,
      vagas: d.vagas,
      ausencias: d.ausencias,
      alocacoes: alocacoesQueSeguram(d.alocacoes, d.campanhas),
    },
  };
}

/**
 * A "reserva": equipe especial onde ficam as pessoas que não estão em nenhuma equipe de campo. Cada cliente tem a sua
 * (APOIO-MRN, APOIO-AGA); sem cliente, a antiga APOIO. Criada na hora se não existir.
 */
export async function obterReserva(tx: Prisma.TransactionClient, cliente: string | null = null) {
  const codigo = cliente ? `APOIO-${cliente.toUpperCase().replace(/[^A-Z0-9]+/g, "")}` : "APOIO";
  const existente = await tx.efetivoEquipe.findUnique({ where: { codigo } });
  if (existente) return existente;
  const total = await tx.efetivoEquipe.count();
  return tx.efetivoEquipe.create({ data: { codigo, nome: "FORA DAS EQUIPES DE CAMPO", projeto: "A definir", grupo: "Apoio", cliente, status: "Ativa", ordem: total + 1 } });
}

/** A viatura passa a servir à equipe (sem datas, que o gestor preenche depois). Já existindo, não mexe. */
export async function garantirUso(tx: Prisma.TransactionClient | typeof prisma, veiculoId: string | null | undefined, equipeId: string | null | undefined) {
  if (!veiculoId || !equipeId) return;
  await tx.efetivoVeiculoUso.upsert({ where: { veiculoId_equipeId: { veiculoId, equipeId } }, create: { veiculoId, equipeId }, update: {} });
}

export async function proximoNumeroDeVaga(tx: Prisma.TransactionClient): Promise<number> {
  const m = await tx.efetivoVaga.aggregate({ _max: { numero: true } });
  return (m._max.numero ?? 0) + 1;
}
