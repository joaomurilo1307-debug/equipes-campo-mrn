import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { dataDe, exigir, registrar } from "@/lib/efetivos/servidor";
import { dataValida } from "@/lib/efetivos/disponibilidade";
import { aplicarAjustes, lerPlanilhaEfetivos, normalizar } from "@/lib/efetivos/importarPlanilha";
import { instanteBrasilia } from "@/lib/efetivos/hoje";

const MAX_BYTES = 8 * 1024 * 1024;

const ajustesSchema = z.array(
  z.object({
    contem: z.array(z.string().min(1)).min(1),
    projeto: z.string().min(1).max(60),
    gestor: z.string().max(80).nullable().optional(),
    grupo: z.string().max(40).nullable().optional(),
  })
);

const proximoNumero = (codigos: string[], prefixo: string, largura: number) => {
  const maior = codigos.reduce((m, c) => Math.max(m, Number(new RegExp(`^${prefixo}-(\\d+)$`).exec(c)?.[1] ?? 0)), 0);
  return (n: number) => `${prefixo}-${String(maior + n).padStart(largura, "0")}`;
};

/** Carga inicial feita pelo desenvolvedor: token longo guardado no ambiente do servidor (nunca no código). */
function tokenValido(req: Request): boolean {
  const esperado = process.env.IMPORT_TOKEN;
  const recebido = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!esperado || esperado.length < 24 || !recebido) return false;
  const a = Buffer.from(esperado);
  const b = Buffer.from(recebido);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Carga a partir da planilha do Samuel (a mais recente: "DIVISÃO DE EQUIPES"; tambem le os formatos antigos).
// NUNCA sobrescreve: o sistema vira a fonte da verdade depois da carga inicial.
//   - base vazia: importa tudo;
//   - base com dados: recusa, a menos que ?acrescentar=1 (entao entram so equipes de nome ainda nao cadastrado).
// Com ?simular=1 so mostra o que entraria, sem gravar.
export async function POST(req: Request) {
  let quem: { userId: string | null; nome: string };
  if (tokenValido(req)) {
    quem = { userId: null, nome: "Carga inicial" };
  } else {
    const a = await exigir("editar");
    if ("erro" in a) return a.erro;
    quem = { userId: a.userId, nome: a.nome };
  }
  const url = new URL(req.url);
  const simular = url.searchParams.get("simular") === "1";
  const acrescentar = url.searchParams.get("acrescentar") === "1";

  const form = await req.formData().catch(() => null);
  const campoArquivo = form?.get("arquivo");
  // aceita qualquer objeto com cara de arquivo (o File do undici nem sempre e o File global do Node)
  if (!campoArquivo || typeof campoArquivo === "string" || typeof (campoArquivo as File).arrayBuffer !== "function") {
    return NextResponse.json({ error: "Envie a planilha (.xlsx) no campo 'arquivo'" }, { status: 422 });
  }
  const arquivo = campoArquivo as File;
  if (arquivo.size > MAX_BYTES) return NextResponse.json({ error: "Arquivo grande demais (máximo 8 MB)" }, { status: 422 });
  const refInformada = String(form?.get("dataReferencia") ?? "");
  const dataRef = dataValida(refInformada) ? refInformada : instanteBrasilia().iso;

  let ajustes: z.infer<typeof ajustesSchema> = [];
  const brutoAjustes = form?.get("ajustes");
  if (typeof brutoAjustes === "string" && brutoAjustes.trim()) {
    try {
      ajustes = ajustesSchema.parse(JSON.parse(brutoAjustes));
    } catch {
      return NextResponse.json({ error: "O campo 'ajustes' não é um JSON válido" }, { status: 422 });
    }
  }

  let lido;
  try {
    lido = aplicarAjustes(lerPlanilhaEfetivos(Buffer.from(await arquivo.arrayBuffer()), { anoReferencia: Number(dataRef.slice(0, 4)) }), ajustes);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Não consegui ler a planilha" }, { status: 422 });
  }

  const existentes = await prisma.efetivoEquipe.findMany({ select: { id: true, codigo: true, nome: true } });
  if (existentes.length > 0 && !acrescentar) {
    return NextResponse.json(
      {
        error:
          "O sistema já tem equipes cadastradas. A importação é a carga inicial: depois dela a atualização é feita aqui no sistema, para não sobrescrever o que já foi ajustado. Use “Acrescentar só equipes novas” se quiser trazer equipes que ainda não existem.",
        jaTemDados: true,
      },
      { status: 409 }
    );
  }
  const nomesExistentes = new Set(existentes.map((e) => normalizar(e.nome)));
  const equipesNovas = lido.equipes.filter((e) => !nomesExistentes.has(normalizar(e.nome)));
  const codigosNovos = new Set(equipesNovas.map((e) => e.codigo));
  const vagasNovas = lido.vagas.filter((v) => codigosNovos.has(v.equipeCodigo));
  const veiculosNovos = lido.veiculos.filter((v) => codigosNovos.has(v.equipeCodigo));

  const resumo = {
    formato: lido.formato,
    dataReferencia: dataRef,
    equipesNaPlanilha: lido.equipes.length,
    vagasNaPlanilha: lido.vagas.length,
    equipesNovas: equipesNovas.length,
    equipesJaExistentes: lido.equipes.length - equipesNovas.length,
    vagasNovas: vagasNovas.length,
    vagasPreenchidas: vagasNovas.filter((v) => v.nome).length,
    vagasAbertas: vagasNovas.filter((v) => !v.nome).length,
    veiculosNovos: veiculosNovos.length,
    apoioDeOutroContrato: vagasNovas.filter((v) => v.contratoAtual).length,
    contratosParaConfirmar: equipesNovas.filter((e) => !e.contratoConfirmado).length,
    avisos: lido.avisos,
  };
  if (simular) return NextResponse.json({ simulacao: true, ...resumo });

  await prisma.$transaction(
    async (tx) => {
      const eqCodigos = proximoNumero(existentes.map((e) => e.codigo), "EQ", 2);
      const vagaMax = (await tx.efetivoVaga.aggregate({ _max: { numero: true } }))._max.numero ?? 0;
      const veiCodigos = proximoNumero((await tx.efetivoVeiculo.findMany({ select: { codigo: true } })).map((v) => v.codigo), "VEI", 3);
      let ordem = existentes.length;
      const idPorCodigoImportado = new Map<string, { id: string; projeto: string; nome: string }>();

      let n = 0;
      for (const e of equipesNovas) {
        const criada = await tx.efetivoEquipe.create({
          data: {
            codigo: eqCodigos(++n),
            nome: e.nome,
            projeto: e.projeto,
            contratoConfirmado: e.contratoConfirmado,
            gestor: e.gestor,
            grupo: e.grupo,
            status: e.status,
            ordem: ++ordem,
          },
        });
        idPorCodigoImportado.set(e.codigo, { id: criada.id, projeto: e.projeto, nome: e.nome });
      }
      let numero = vagaMax;
      for (const v of vagasNovas) {
        const vaga = await tx.efetivoVaga.create({
          data: {
            numero: ++numero,
            equipeId: idPorCodigoImportado.get(v.equipeCodigo)!.id,
            atividade: v.atividade,
            empresa: v.empresa || "—",
            cargo: v.cargo || "—",
            nome: v.nome,
            status: v.status,
            nivel: v.nivel ?? null,
            direcao4x4: v.direcao4x4 ?? null,
            contratoAtual: v.contratoAtual ?? null,
            disponivelAPartir: v.disponivelAPartir ? dataDe(v.disponivelAPartir) : null,
            destino: v.destino ?? null,
            observacao: v.observacao,
          },
        });
        if (v.ausencia) {
          await tx.efetivoAusencia.create({ data: { vagaId: vaga.id, tipo: v.ausencia.tipo, inicio: dataDe(v.ausencia.inicio), fim: dataDe(v.ausencia.fim) } });
        }
      }
      let k = 0;
      for (const v of veiculosNovos) {
        const eq = idPorCodigoImportado.get(v.equipeCodigo)!;
        const veiculo = await tx.efetivoVeiculo.create({
          data: {
            codigo: veiCodigos(++k),
            identificacao: v.identificacao,
            status: "Em operação",
            observacao: `Viatura "${v.identificacao}" da equipe ${eq.nome}, como na planilha de ${dataRef}. Placa e modelo ainda não constam: preencher.`,
          },
        });
        await tx.efetivoVeiculoMovimento.create({
          data: { veiculoId: veiculo.id, inicio: dataDe(dataRef), fim: null, projeto: eq.projeto, equipeId: eq.id, observacao: "Posição inicial segundo a planilha", criadoPorNome: quem.nome },
        });
      }
    },
    { timeout: 90000, maxWait: 15000 }
  );

  await registrar(
    quem.userId,
    "IMPORTACAO",
    "IMPORTACAO",
    undefined,
    `Planilha "${arquivo.name}" (${lido.formato}) importada por ${quem.nome}: ${resumo.equipesNovas} equipes, ${resumo.vagasNovas} vagas (${resumo.vagasPreenchidas} com profissional) e ${resumo.veiculosNovos} viaturas${acrescentar ? " (modo acrescentar)" : ""}`
  );
  return NextResponse.json({ simulacao: false, ...resumo });
}
