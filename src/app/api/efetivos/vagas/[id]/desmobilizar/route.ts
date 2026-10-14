import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { exigir, obterReserva, proximoNumeroDeVaga, registrar } from "@/lib/efetivos/servidor";
import { dataValida } from "@/lib/efetivos/disponibilidade";
import { instanteBrasilia } from "@/lib/efetivos/hoje";
import { textoDaDesmobilizacao, vagaAbertaNoLugarDe } from "@/lib/efetivos/vagas";

const schema = z.object({
  // reserva = a pessoa continua no cadastro, disponível para outra equipe; desligado = sai (status Desmobilizado)
  destino: z.enum(["reserva", "desligado"]).default("reserva"),
  abrirVaga: z.boolean().default(true),
  data: z.string().refine(dataValida, "Data inválida").optional(),
  motivo: z.string().trim().max(200).nullable().optional(),
});

// Desmobilizar: a pessoa sai da equipe e, por padrão, a vaga dela fica aberta (mesma função, empresa, atividade e viatura).
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const a = await exigir("editar");
  if ("erro" in a) return a.erro;
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos" }, { status: 422 });
  const d = parsed.data;

  const vaga = await prisma.efetivoVaga.findUnique({ where: { id: params.id }, include: { equipe: true } });
  if (!vaga) return NextResponse.json({ error: "Posição não encontrada" }, { status: 404 });
  if (!vaga.nome) return NextResponse.json({ error: "Esta posição já está sem pessoa" }, { status: 422 });
  if (vaga.equipe.grupo === "Apoio") return NextResponse.json({ error: "Esta pessoa já está fora das equipes de campo" }, { status: 422 });
  const dia = d.data ?? instanteBrasilia().iso;

  const r = await prisma.$transaction(async (tx) => {
    const reserva = await obterReserva(tx);
    let aberta = null;
    if (d.abrirVaga) {
      aberta = await tx.efetivoVaga.create({
        data: { numero: await proximoNumeroDeVaga(tx), equipeId: vaga.equipeId, ...vagaAbertaNoLugarDe(vaga), observacao: `Vaga aberta pela saída de ${vaga.nome}` },
      });
    }
    const pessoa = await tx.efetivoVaga.update({
      where: { id: vaga.id },
      data: {
        equipeId: reserva.id,
        veiculoId: null,
        status: d.destino === "desligado" ? "Desmobilizado" : vaga.status,
        observacao: [vaga.observacao, textoDaDesmobilizacao(vaga.equipe.nome, dia, d.destino, d.motivo)].filter(Boolean).join(" · "),
      },
    });
    return { aberta, pessoa };
  });

  await registrar(
    a.userId,
    "VAGA_DESMOBILIZADA",
    "VAGA",
    vaga.id,
    `${vaga.nome} saiu da equipe ${vaga.equipe.codigo} (${vaga.equipe.nome}) em ${dia}${d.destino === "desligado" ? ", desmobilizado" : ", disponível"}${r.aberta ? "; vaga aberta no lugar" : ""} (por ${a.nome})`
  );
  return NextResponse.json({ vaga: r.pessoa, vagaAberta: r.aberta });
}
