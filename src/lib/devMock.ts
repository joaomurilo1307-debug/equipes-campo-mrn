// SOMENTE DESENVOLVIMENTO: com DEV_MOCK_XLSX apontando para a planilha (ou a base preenchida), a tela abre sem banco nem login,
// usando SÓ os dados da própria planilha: nada de exemplo. Em produção (NODE_ENV=production) nada disso é usado.
import { readFileSync } from "node:fs";
import { lerPlanilhasEfetivos } from "./efetivos/combinarPlanilhas";
import { veiculosUnicos } from "./efetivos/importarPlanilha";

export const modoMock = () => process.env.NODE_ENV !== "production" && !!process.env.DEV_MOCK_XLSX;

let cache: any = null;

export function dadosMock(): any {
  if (cache) return cache;
  // DEV_MOCK_XLSX aceita varias planilhas separadas por ";" (as planilhas por contrato se juntam numa base so)
  const lido = lerPlanilhasEfetivos(process.env.DEV_MOCK_XLSX!.split(";").map((f) => readFileSync(f)), { anoReferencia: 2026 });
  const equipes = lido.equipes.map((e) => ({ id: e.codigo, codigo: e.codigo, nome: e.nome, projeto: e.projeto, contratoConfirmado: true, gestor: e.gestor, grupo: e.grupo, local: (e.local ?? null) as string | null, observacao: (e.observacao ?? null) as string | null, status: e.status, inicio: (e.inicio ?? null) as string | null, fim: (e.fim ?? null) as string | null, campanhaId: null as string | null }));
  // a mesma viatura em várias equipes é uma viatura só
  const unicos = veiculosUnicos(lido.veiculos);
  const idPorRef = new Map<string, string>();
  unicos.forEach((u, i) => u.refs.forEach((r) => idPorRef.set(r, `veic-${i + 1}`)));
  const veiculos = unicos.map((u, i) => ({
    id: `veic-${i + 1}`,
    codigo: `VEI-${String(i + 1).padStart(3, "0")}`,
    identificacao: u.identificacao,
    placa: u.placa,
    modelo: u.modelo,
    tracao4x4: u.tracao4x4,
    status: u.status || "Em operação",
    observacao: u.observacao,
  }));
  const vagas = lido.vagas.map((v, i) => ({
    id: `v${i + 1}`,
    numero: v.numero,
    equipeId: v.equipeCodigo,
    nome: v.nome,
    status: v.status,
    cargo: v.cargo,
    empresa: v.empresa,
    atividade: v.atividade,
    previsaoInicio: v.previsaoInicio ?? null,
    nivel: v.nivel ?? null,
    direcao4x4: v.direcao4x4 ?? null,
    contratoAtual: v.contratoAtual ?? null,
    disponivelAPartir: v.disponivelAPartir ?? null,
    destino: v.destino ?? null,
    veiculoId: v.carroRef ? idPorRef.get(v.carroRef) ?? null : null,
    contrato: v.contrato ?? null,
    equipeContrato: v.equipeContrato ?? null,
    grupo: v.grupo ?? null,
    semNome: !!v.semNome && !v.nome,
    observacao: v.observacao,
    origem: v.origem ?? null,
    conferir: v.conferir ?? null,
  }));
  // ausências com data (só existem se a base preenchida as trouxer)
  const porChave = new Map(lido.vagas.map((v, i) => [v, `v${i + 1}`]));
  const ausencias = lido.vagas.flatMap((v) => [...(v.ausencia ? [v.ausencia] : []), ...(v.ausencias ?? [])].map((a, k) => ({ id: `a-${porChave.get(v)}-${k}`, vagaId: porChave.get(v)!, tipo: a.tipo, inicio: a.inicio, fim: a.fim, observacao: null as string | null })));
  const contratos = lido.contratos.map((c, i) => ({ id: `ct${i + 1}`, codigo: c.codigo, nome: (c.nome ?? null) as string | null, cliente: c.cliente, gestor: c.gestor, local: (c.local ?? null) as string | null, observacao: (c.observacao ?? null) as string | null, ativo: true }));
  cache = { equipes, vagas, ausencias, campanhas: [] as any[], alocacoes: [] as any[], veiculos, movimentos: [] as any[], contratos, movimentosEquipe: [] as any[] };
  return cache;
}
