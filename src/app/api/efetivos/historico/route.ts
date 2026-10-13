import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { exigir } from "@/lib/efetivos/servidor";

export const dynamic = "force-dynamic";

// Quem mexeu em que e quando (escalas, ausencias, veiculos, importacoes). So quem edita enxerga.
export async function GET() {
  const a = await exigir("editar");
  if ("erro" in a) return a.erro;
  const linhas = await prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 400 });
  return NextResponse.json({
    historico: linhas.map((l) => ({ id: l.id, em: l.createdAt.toISOString(), por: l.userName ?? "Carga inicial", acao: l.action, resumo: l.resumo })),
  });
}
