import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { dataDe, exigir, registrar } from "@/lib/efetivos/servidor";
import { dataValida } from "@/lib/efetivos/disponibilidade";
import { normalizar } from "@/lib/efetivos/importarPlanilha";
import { lerPlanilhasEfetivos } from "@/lib/efetivos/combinarPlanilhas";
import { instanteBrasilia } from "@/lib/efetivos/hoje";
import { tokenDeCargaValido } from "@/lib/efetivos/token";

const MAX_BYTES = 8 * 1024 * 1024;

const proximoNumero = (codigos: string[], prefixo: string, largura: number) => {
  const maior = codigos.reduce((m, c) => Math.max(m, Number(new RegExp(`^${prefixo}-(\\d+)$`).exec(c)?.[1] ?? 0)), 0);
  return (n: number) => `${prefixo}-${String(maior + n).padStart(largura, "0")}`;
};

// Carga a partir das planilhas do Samuel (uma por contrato: 3686, 3687 LT...; varias de uma vez se juntam numa base so; tambem le a base do sistema e os formatos antigos).
// SO usa o que esta na planilha: contrato, gestor e placa nao constam nela e ficam em branco para serem preenchidos.
// NUNCA sobrescreve: o sistema vira a fonte da verdade depois da carga inicial.
//   - base vazia: importa tudo;
//   - base com dados: recusa, a menos que ?acrescentar=1 (entao entram so equipes de nome ainda nao cadastrado).
// Com ?simular=1 so mostra o que entraria, sem gravar.
export async function POST(req: Request) {
  let quem: { userId: string | null; nome: string };
  if (tokenDeCargaValido(req)) {
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
  // aceita qualquer objeto com cara de arquivo (o File do undici nem sempre e o File global do Node)
  const arquivos = (form?.getAll("arquivo") ?? []).filter((x): x is File => typeof x !== "string" && typeof (x as File).arrayBuffer === "function");
  if (arquivos.length === 0) {
    return NextResponse.json({ error: "Envie a planilha (.xlsx) no campo 'arquivo'" }, { status: 422 });
  }
  if (arquivos.length > 10) return NextResponse.json({ error: "Envie no máximo 10 planilhas de uma vez" }, { status: 422 });
  if (arquivos.some((a) => a.size > MAX_BYTES)) return NextResponse.json({ error: "Arquivo grande demais (máximo 8 MB cada)" }, { status: 422 });
  const nomeDosArquivos = arquivos.map((a) => a.name).join(" + ");
  const refInformada = String(form?.get("dataReferencia") ?? "");
  const dataRef = dataValida(refInformada) ? refInformada : instanteBrasilia().iso;

  let lido;
  try {
    lido = lerPlanilhasEfetivos(await Promise.all(arquivos.map(async (a) => Buffer.from(await a.arrayBuffer()))), { anoReferencia: Number(dataRef.slice(0, 4)) });
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
    vagasSemNome: vagasNovas.filter((v) => !v.nome && v.semNome).length,
    vagasAbertas: vagasNovas.filter((v) => !v.nome && !v.semNome).length,
    contratos: lido.contratos.length,
    veiculosNovos: veiculosNovos.length,
    apoioDeOutroContrato: vagasNovas.filter((v) => v.contratoAtual).length,
    avisos: lido.avisos,
  };
  if (simular) return NextResponse.json({ simulacao: true, ...resumo });

  await prisma.$transaction(
    async (tx) => {
      const eqCodigos = proximoNumero(existentes.map((e) => e.codigo), "EQ", 2);
      const vagaMax = (await tx.efetivoVaga.aggregate({ _max: { numero: true } }))._max.numero ?? 0;
      const veiCodigos = proximoNumero((await tx.efetivoVeiculo.findMany({ select: { codigo: true } })).map((v) => v.codigo), "VEI", 3);
      let ordem = existentes.length;
      const equipePorCodigoImportado = new Map<string, { id: string; projeto: string; nome: string }>();

      let n = 0;
      const codigosEmUso = new Set(existentes.map((x) => x.codigo));
      for (const e of equipesNovas) {
        // a reserva de apoio tem sempre o codigo APOIO (e por ele que o sistema a encontra); na planilha-base o codigo do arquivo e mantido
        const manter = e.codigo === "APOIO" || (lido.formato === "base" && /^EQ-\d+$/.test(e.codigo));
        const codigo = manter && !codigosEmUso.has(e.codigo) ? e.codigo : eqCodigos(++n);
        codigosEmUso.add(codigo);
        const criada = await tx.efetivoEquipe.create({
          data: {
            codigo,
            nome: e.nome,
            projeto: e.projeto,
            gestor: e.gestor,
            grupo: e.grupo,
            status: e.status,
            local: e.local ?? null,
            observacao: e.observacao ?? null,
            inicio: e.inicio ? dataDe(e.inicio) : null,
            fim: e.fim ? dataDe(e.fim) : null,
            ordem: ++ordem,
          },
        });
        equipePorCodigoImportado.set(e.codigo, { id: criada.id, projeto: e.projeto, nome: e.nome });
      }

      // viaturas primeiro: cada pessoa aponta para a viatura em que vai
      const veiculoPorRef = new Map<string, string>();
      let k = 0;
      for (const v of veiculosNovos) {
        const eq = equipePorCodigoImportado.get(v.equipeCodigo)!;
        const veiculo = await tx.efetivoVeiculo.create({
          data: { codigo: veiCodigos(++k), identificacao: v.identificacao, placa: v.placa ?? null, modelo: v.modelo ?? null, tracao4x4: v.tracao4x4 ?? null, status: v.status || "Em operação", observacao: v.observacao ?? null },
        });
        veiculoPorRef.set(v.ref, veiculo.id);
        await tx.efetivoVeiculoMovimento.create({
          data: { veiculoId: veiculo.id, inicio: dataDe(dataRef), fim: null, projeto: eq.projeto, equipeId: eq.id, observacao: `Posição inicial segundo a planilha de ${dataRef}`, criadoPorNome: quem.nome },
        });
      }

      // contratos que a planilha cita (so os que ainda nao existem; nunca sobrescreve o que foi preenchido no sistema)
      for (const c of lido.contratos) {
        const ja = await tx.efetivoContrato.findUnique({ where: { codigo: c.codigo } });
        if (!ja) await tx.efetivoContrato.create({ data: { codigo: c.codigo, gestor: c.gestor, cliente: c.cliente, nome: c.nome ?? null, local: c.local ?? null, observacao: c.observacao ?? null } });
      }

      let numero = vagaMax;
      for (const v of vagasNovas) {
        const vaga = await tx.efetivoVaga.create({
          data: {
            numero: ++numero,
            equipeId: equipePorCodigoImportado.get(v.equipeCodigo)!.id,
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
            veiculoId: v.carroRef ? veiculoPorRef.get(v.carroRef) ?? null : null,
            contrato: v.contrato ?? null,
            equipeContrato: v.equipeContrato ?? null,
            grupo: v.grupo ?? null,
            semNome: !!v.semNome && !v.nome,
            observacao: v.observacao,
            origem: v.origem ?? null,
            conferir: v.conferir ?? null,
          },
        });
        for (const a of [...(v.ausencia ? [v.ausencia] : []), ...(v.ausencias ?? [])]) {
          await tx.efetivoAusencia.create({ data: { vagaId: vaga.id, tipo: a.tipo, inicio: dataDe(a.inicio), fim: dataDe(a.fim) } });
        }
      }
    },
    { timeout: 90000, maxWait: 15000 }
  );

  await registrar(
    quem.userId,
    "IMPORTACAO",
    "IMPORTACAO",
    undefined,
    `Planilha "${nomeDosArquivos}" (${lido.formato}) importada por ${quem.nome}: ${resumo.equipesNovas} equipes, ${resumo.vagasNovas} vagas (${resumo.vagasPreenchidas} com profissional) e ${resumo.veiculosNovos} viaturas${acrescentar ? " (modo acrescentar)" : ""}`
  );
  return NextResponse.json({ simulacao: false, ...resumo });
}
