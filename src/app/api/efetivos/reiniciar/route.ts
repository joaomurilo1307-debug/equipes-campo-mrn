import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { registrar } from "@/lib/efetivos/servidor";
import { tokenDeCargaValido } from "@/lib/efetivos/token";

// Refazer a CARGA INICIAL: so com o token de carga (guardado no ambiente do servidor) e so se ninguem editou nada
// ainda (o historico so tem a propria importacao e criacao de acessos). Apaga os dados de equipes/veiculos/campanhas;
// NAO mexe nos usuarios. Depois e so importar a planilha de novo.
export async function POST(req: Request) {
  if (!tokenDeCargaValido(req)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const corpo = await req.json().catch(() => null);
  if (corpo?.confirmar !== "REFAZER CARGA INICIAL") return NextResponse.json({ error: "Confirmação ausente" }, { status: 422 });

  const edicoes = await prisma.auditLog.count({
    where: { NOT: [{ action: { in: ["IMPORTACAO", "USUARIO_CRIADO", "USUARIO_ALTERADO", "CARGA_REFEITA", "BASE_BAIXADA"] } }] },
  });
  if (edicoes > 0) {
    return NextResponse.json({ error: `Já existem ${edicoes} alteração(ões) feitas por pessoas no sistema; não vou apagar.` }, { status: 409 });
  }

  await prisma.$transaction([
    prisma.efetivoAlocacao.deleteMany(),
    prisma.efetivoAusencia.deleteMany(),
    prisma.efetivoEquipeMovimento.deleteMany(),
    prisma.efetivoVeiculoMovimento.deleteMany(),
    prisma.efetivoVaga.deleteMany(),
    prisma.efetivoVeiculo.deleteMany(),
    prisma.efetivoEquipe.deleteMany(),
    prisma.efetivoCampanha.deleteMany(),
    prisma.efetivoContrato.deleteMany(),
  ]);
  await registrar(null, "CARGA_REFEITA", "IMPORTACAO", undefined, "Dados da carga inicial apagados para refazer a importação (ninguém tinha editado nada)");
  return NextResponse.json({ ok: true });
}
