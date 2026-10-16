import { NextResponse } from "next/server";
import { carregarDados, exigir, registrar } from "@/lib/efetivos/servidor";
import { instanteBrasilia } from "@/lib/efetivos/hoje";
import { indexar } from "@/lib/efetivos/disponibilidade";
import { montarPlanilhaBase } from "@/lib/efetivos/base";

// Baixa a base única (uma linha por posição) em Excel: BASE, EQUIPES, CONTRATOS, VIATURAS, AUSÊNCIAS e CONFERÊNCIA.
// É o mesmo formato que a importação lê de volta.
export async function GET() {
  const a = await exigir("ver");
  if ("erro" in a) return a.erro;
  const d = await carregarDados(a.nivel !== "DASHBOARD", a.cliente);
  const hoje = instanteBrasilia().iso;
  const buf = montarPlanilhaBase({ ...d, usos: d.usosVeiculo } as any, indexar({ ausencias: d.ausencias, alocacoes: [] }), hoje);
  await registrar(a.userId, "BASE_BAIXADA", "BASE", undefined, `Base única baixada em Excel por ${a.nome} (${d.vagas.length} posições)`);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="BASE_EQUIPES_CAMPO_${hoje}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
