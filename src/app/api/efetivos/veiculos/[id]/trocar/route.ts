import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { dataDe, diaDe, exigir, foraDoEscopo, registrar } from "@/lib/efetivos/servidor";
import { dia } from "@/lib/efetivos/esquemas";
import { planejarTroca } from "@/lib/efetivos/usosVeiculo";
import { STATUS_VEICULO } from "@/lib/efetivos/veiculos";

const schema = z.object({
  substitutaId: z.string().min(1),
  trocaEm: dia,
  // só nestas equipes (sem isto, em todas em que a viatura está nessa data)
  equipeIds: z.array(z.string()).optional(),
  // como fica a viatura que sai (sem isto, o status dela não muda)
  statusAntiga: z.enum(STATUS_VEICULO).nullable().optional(),
});

const fmt = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

// Efetiva a troca: a antiga termina no dia anterior, a nova começa no dia da troca, e as pessoas que usavam a antiga passam para a nova.
// A nova que estava "Prevista" vira "Em operação". Nada é apagado: o histórico das duas fica.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const a = await exigir("editar");
  if ("erro" in a) return a.erro;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos", detalhes: parsed.error.flatten() }, { status: 422 });
  const d = parsed.data;
  if (d.substitutaId === params.id) return NextResponse.json({ error: "Escolha uma viatura diferente para substituir" }, { status: 422 });
  {
    const fora = await foraDoEscopo(a, { veiculoId: params.id });
    if (fora) return fora;
  }
  {
    const fora = await foraDoEscopo(a, { veiculoId: d.substitutaId });
    if (fora) return fora;
  }
  const [antiga, nova, usos] = await Promise.all([
    prisma.efetivoVeiculo.findUnique({ where: { id: params.id } }),
    prisma.efetivoVeiculo.findUnique({ where: { id: d.substitutaId } }),
    prisma.efetivoVeiculoUso.findMany({ where: { veiculoId: params.id }, include: { equipe: true } }),
  ]);
  if (!antiga || !nova) return NextResponse.json({ error: "Viatura não encontrada" }, { status: 404 });

  const plano = planejarTroca(
    usos.map((u) => ({ veiculoId: u.veiculoId, equipeId: u.equipeId, inicio: diaDe(u.inicio), fim: diaDe(u.fim) })),
    d.trocaEm,
    d.equipeIds
  );
  if (!plano.ok) return NextResponse.json({ error: plano.erro }, { status: 422 });
  {
    for (const n of plano.nova) {
      const fora = await foraDoEscopo(a, { equipeId: n.equipeId });
      if (fora) return fora;
    }
  }

  const equipeIds = plano.antiga.map((x) => x.equipeId);
  const pessoas = await prisma.$transaction(
    async (tx) => {
      for (const x of plano.antiga) await tx.efetivoVeiculoUso.update({ where: { veiculoId_equipeId: { veiculoId: antiga.id, equipeId: x.equipeId } }, data: { fim: dataDe(x.fim) } });
      for (const x of plano.nova) {
        const dados = { inicio: dataDe(x.inicio), fim: x.fim ? dataDe(x.fim) : null };
        await tx.efetivoVeiculoUso.upsert({ where: { veiculoId_equipeId: { veiculoId: nova.id, equipeId: x.equipeId } }, create: { veiculoId: nova.id, equipeId: x.equipeId, ...dados }, update: dados });
      }
      const movidas = await tx.efetivoVaga.updateMany({ where: { veiculoId: antiga.id, equipeId: { in: equipeIds } }, data: { veiculoId: nova.id } });
      await tx.efetivoVeiculo.update({ where: { id: antiga.id }, data: { substituidoPorId: nova.id, trocaEm: dataDe(d.trocaEm), ...(d.statusAntiga ? { status: d.statusAntiga } : {}) } });
      if (nova.status === "Prevista") await tx.efetivoVeiculo.update({ where: { id: nova.id }, data: { status: "Em operação" } });
      return movidas.count;
    },
    { timeout: 30000 }
  );
  const equipes = usos.filter((u) => equipeIds.includes(u.equipeId)).map((u) => u.equipe.codigo).join(", ");
  await registrar(a.userId, "VEICULO_TROCADO", "VEICULO", antiga.id, `Viatura ${antiga.identificacao} substituída pela ${nova.identificacao} em ${fmt(d.trocaEm)} (equipe(s) ${equipes}; ${pessoas} pessoa(s) passaram para a nova) (por ${a.nome})`);
  return NextResponse.json({ ok: true, pessoas, equipes: equipeIds });
}
