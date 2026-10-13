// Apoio das rotas /api/efetivos: nivel de acesso, carga dos dados e mascara de dado sensivel.
// Papeis: ADMIN (Joao) e EDITOR (Samuel) montam e movimentam; VISUALIZADOR so consulta.

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { alocacoesQueSeguram, type Dia } from "./disponibilidade";
import { dadosMock, modoMock } from "@/lib/devMock";

export type NivelEfetivos = "ADMIN" | "EDITOR" | "DASHBOARD";

export const diaDe = (d: Date | null | undefined): Dia | null => (d ? d.toISOString().slice(0, 10) : null);
export const dataDe = (dia: Dia): Date => new Date(`${dia}T00:00:00.000Z`);

const NIVEL_POR_PAPEL: Record<string, NivelEfetivos> = { ADMIN: "ADMIN", EDITOR: "EDITOR", VISUALIZADOR: "DASHBOARD" };

export const podeEditar = (n: NivelEfetivos | null) => n === "ADMIN" || n === "EDITOR";

type Exigencia = "ver" | "editar" | "admin";

/** Autentica e confere o nivel; devolve a resposta de erro pronta quando nao pode. */
export async function exigir(
  exigencia: Exigencia
): Promise<{ erro: NextResponse } | { userId: string; nome: string; nivel: NivelEfetivos }> {
  if (modoMock()) return { userId: "dev", nome: "Demonstração", nivel: "ADMIN" };
  const session = await getServerSession(authOptions);
  const u = session?.user as any;
  if (!session || !u?.id) return { erro: NextResponse.json({ error: "Não autenticado" }, { status: 401 }) };
  const nivel = NIVEL_POR_PAPEL[u.role as string] ?? null;
  const ok = exigencia === "ver" ? nivel !== null : exigencia === "editar" ? podeEditar(nivel) : nivel === "ADMIN";
  if (!ok || !nivel) {
    return {
      erro: NextResponse.json(
        { error: exigencia === "admin" ? "Somente o administrador pode fazer isso" : "Seu acesso é só de consulta" },
        { status: 403 }
      ),
    };
  }
  return { userId: u.id, nome: u.name ?? u.email ?? "Usuário", nivel };
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

async function carregarDadosReal(editor: boolean) {
  const [equipes, vagas, ausencias, campanhas, alocacoes, veiculos, movimentos] = await Promise.all([
    prisma.efetivoEquipe.findMany({ orderBy: [{ ordem: "asc" }, { codigo: "asc" }] }),
    prisma.efetivoVaga.findMany({ orderBy: [{ numero: "asc" }, { criadoEm: "asc" }] }),
    prisma.efetivoAusencia.findMany({ orderBy: { inicio: "asc" } }),
    prisma.efetivoCampanha.findMany({ orderBy: [{ inicio: "asc" }, { codigo: "asc" }] }),
    prisma.efetivoAlocacao.findMany(),
    prisma.efetivoVeiculo.findMany({ orderBy: { codigo: "asc" } }),
    prisma.efetivoVeiculoMovimento.findMany({ orderBy: { inicio: "asc" } }),
  ]);
  return {
    equipes: equipes.map((e) => ({
      id: e.id,
      codigo: e.codigo,
      nome: e.nome,
      projeto: e.projeto,
      contratoConfirmado: e.contratoConfirmado,
      gestor: e.gestor,
      grupo: e.grupo,
      status: e.status,
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
      observacao: editor ? v.observacao : null,
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
    })),
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
  };
}

export async function carregarDados(editor: boolean): Promise<Awaited<ReturnType<typeof carregarDadosReal>>> {
  return modoMock() ? (dadosMock() as Awaited<ReturnType<typeof carregarDadosReal>>) : carregarDadosReal(editor);
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
