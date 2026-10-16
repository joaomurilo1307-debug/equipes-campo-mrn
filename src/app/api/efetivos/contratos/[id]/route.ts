import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { exigir, registrar, foraDoEscopo } from "@/lib/efetivos/servidor";

const schema = z
  .object({
    codigo: z.string().trim().min(1).max(60),
    nome: z.string().trim().max(160).nullable(),
    cliente: z.string().trim().max(120).nullable(),
    gestor: z.string().trim().max(120).nullable(),
    local: z.string().trim().max(160).nullable(),
    observacao: z.string().trim().max(600).nullable(),
    ativo: z.boolean(),
  })
  .partial();

// Edita o contrato. Mudar o código atualiza também as equipes, campanhas, passagens de veículo e pessoas que apontam para ele.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const a = await exigir("editar");
  if ("erro" in a) return a.erro;
  {
    const fora = await foraDoEscopo(a, { contratoId: params.id });
    if (fora) return fora;
  }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || Object.keys(parsed.data).length === 0) return NextResponse.json({ error: "Dados inválidos" }, { status: 422 });
  if (a.cliente && parsed.data.cliente !== undefined && (parsed.data.cliente || null) !== a.cliente) return NextResponse.json({ error: "Só a administração muda o cliente de um contrato" }, { status: 403 });
  const antes = await prisma.efetivoContrato.findUnique({ where: { id: params.id } });
  if (!antes) return NextResponse.json({ error: "Contrato não encontrado" }, { status: 404 });
  const d = parsed.data;
  const { nome, cliente, gestor, local, observacao, ...resto } = d;
  if (d.codigo && d.codigo !== antes.codigo && (await prisma.efetivoContrato.findUnique({ where: { codigo: d.codigo } }))) {
    return NextResponse.json({ error: `Já existe o contrato ${d.codigo}` }, { status: 409 });
  }
  const contrato = await prisma.$transaction(async (tx) => {
    const c = await tx.efetivoContrato.update({
      where: { id: params.id },
      data: {
        ...resto,
        ...(nome !== undefined ? { nome: nome || null } : {}),
        ...(cliente !== undefined ? { cliente: cliente || null } : {}),
        ...(gestor !== undefined ? { gestor: gestor || null } : {}),
        ...(local !== undefined ? { local: local || null } : {}),
        ...(observacao !== undefined ? { observacao: observacao || null } : {}),
      },
    });
    if (d.codigo && d.codigo !== antes.codigo) {
      await tx.efetivoEquipe.updateMany({ where: { projeto: antes.codigo }, data: { projeto: d.codigo } });
      await tx.efetivoCampanha.updateMany({ where: { projeto: antes.codigo }, data: { projeto: d.codigo } });
      await tx.efetivoVeiculoMovimento.updateMany({ where: { projeto: antes.codigo }, data: { projeto: d.codigo } });
      await tx.efetivoVaga.updateMany({ where: { contratoAtual: antes.codigo }, data: { contratoAtual: d.codigo } });
    }
    return c;
  });
  await registrar(a.userId, "CONTRATO_ALTERADO", "CONTRATO", contrato.id, `Contrato ${antes.codigo}${d.codigo && d.codigo !== antes.codigo ? ` → ${d.codigo}` : ""} alterado por ${a.nome}`);
  return NextResponse.json({ contrato });
}

// Remove só o cadastro; as equipes que usam o código continuam com ele (basta cadastrar de novo ou trocar).
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const a = await exigir("editar");
  if ("erro" in a) return a.erro;
  {
    const fora = await foraDoEscopo(a, { contratoId: params.id });
    if (fora) return fora;
  }
  const c = await prisma.efetivoContrato.findUnique({ where: { id: params.id } });
  if (!c) return NextResponse.json({ error: "Contrato não encontrado" }, { status: 404 });
  await prisma.efetivoContrato.delete({ where: { id: c.id } });
  await registrar(a.userId, "CONTRATO_EXCLUIDO", "CONTRATO", c.id, `Cadastro do contrato ${c.codigo} excluído por ${a.nome}`);
  return NextResponse.json({ ok: true });
}
