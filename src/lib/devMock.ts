// SOMENTE DESENVOLVIMENTO: com DEV_MOCK_XLSX apontando para a planilha, a tela abre sem banco nem login,
// usando os dados da própria planilha mais algumas campanhas, ausências e contratos de exemplo, só para conferir o visual.
// Em produção (NODE_ENV=production) nada disso é usado.
import { readFileSync } from "node:fs";
import { lerPlanilhaEfetivos } from "./efetivos/importarPlanilha";
import { somarDias } from "./efetivos/disponibilidade";

export const modoMock = () => process.env.NODE_ENV !== "production" && !!process.env.DEV_MOCK_XLSX;

let cache: any = null;

export function dadosMock(): any {
  if (cache) return cache;
  const lido = lerPlanilhaEfetivos(readFileSync(process.env.DEV_MOCK_XLSX!), { anoReferencia: 2026 });
  const equipes = lido.equipes.map((e) => ({ id: e.codigo, codigo: e.codigo, nome: e.nome, projeto: e.projeto, contratoConfirmado: true, gestor: e.gestor, grupo: e.grupo, local: null as string | null, observacao: null as string | null, status: e.status, inicio: null as string | null, fim: null as string | null, campanhaId: null as string | null }));
  const veiculos = lido.veiculos.map((v, i) => ({
    id: v.ref,
    codigo: `VEI-${String(i + 1).padStart(3, "0")}`,
    identificacao: v.identificacao,
    placa: null as string | null,
    modelo: null as string | null,
    tracao4x4: null as boolean | null,
    status: "Em operação",
    observacao: null as string | null,
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
    previsaoInicio: null,
    nivel: v.nivel ?? null,
    direcao4x4: v.direcao4x4 ?? null,
    contratoAtual: v.contratoAtual ?? null,
    disponivelAPartir: v.disponivelAPartir ?? null,
    destino: v.destino ?? null,
    veiculoId: v.carroRef ?? null,
    contrato: v.contrato ?? null,
    equipeContrato: v.equipeContrato ?? null,
    grupo: v.grupo ?? null,
    semNome: !!v.semNome && !v.nome,
    observacao: v.observacao,
  }));
  const hoje = "2026-10-13";
  const nomeadas = (eq: string) => vagas.filter((v) => v.equipeId === eq && v.nome && v.status === "Vigente");
  const n1 = nomeadas("EQ-01");
  const n3 = nomeadas("EQ-03");
  const campanhas = [
    { id: "c1", codigo: "CAM-001", recebidaEm: "2026-10-02", solicitante: "MRN — Meio Ambiente", projeto: "A definir", grupo: "Fauna", atividade: "Resgate", local: "Flanco Norte · Trecho 4", equipeNome: "Equipe Resgate Flanco Norte", necessidade: [{ cargo: "Biólogo de Fauna", qtd: 2 }, { cargo: "Auxiliar", qtd: 6 }], inicio: "2026-10-19", fim: "2026-11-20", qtdEquipes: 1, prioridade: "Alta", status: "Confirmada", observacao: null },
    { id: "c2", codigo: "CAM-002", recebidaEm: "2026-10-06", solicitante: "MRN — Lavra", projeto: "A definir", grupo: "Fauna", atividade: "Afugentamento", local: "Frente de lavra 02", equipeNome: null, necessidade: [], inicio: "2026-11-02", fim: "2026-12-11", qtdEquipes: 2, prioridade: "Média", status: "Planejada", observacao: null },
  ];
  const alocacoes = [
    ...n1.map((v, i) => ({ id: `a1-${i}`, campanhaId: "c1", vagaId: v.id, inicio: "2026-10-19", fim: "2026-11-20" })),
    ...n3.slice(0, 3).map((v, i) => ({ id: `a2-${i}`, campanhaId: "c2", vagaId: v.id, inicio: "2026-11-02", fim: "2026-12-11" })),
  ];
  const ausencias = [
    ...(n1[0] ? [{ id: "x1", vagaId: n1[0].id, tipo: "Férias", inicio: "2026-12-14", fim: "2027-01-02", observacao: null }] : []),
    ...(n3[1] ? [{ id: "x2", vagaId: n3[1].id, tipo: "Atestado", inicio: "2026-10-20", fim: "2026-10-23", observacao: null }] : []),
    ...(n3[0] ? [{ id: "x3", vagaId: n3[0].id, tipo: "Férias", inicio: "2026-11-09", fim: "2026-11-27", observacao: null }] : []),
  ];
  const movimentos = lido.veiculos.map((v, i) => {
    const eq = equipes.find((e) => e.codigo === v.equipeCodigo)!;
    return { id: `m${i + 1}`, veiculoId: v.ref, inicio: "2026-10-07", fim: null as string | null, projeto: eq.projeto, equipeId: eq.id, campanhaId: null as string | null, local: null as string | null, observacao: "Posição inicial segundo a planilha" };
  });
  const contratos = lido.contratos.map((c, i) => ({ id: `ct${i + 1}`, codigo: c.codigo, nome: null as string | null, cliente: c.cliente, gestor: c.gestor, local: null as string | null, observacao: null as string | null, ativo: true }));
  if (veiculos[1]) {
    veiculos[1].placa = "RTX-4B21";
    veiculos[1].modelo = "Hilux 4x4";
    veiculos[1].tracao4x4 = true;
  }
  void somarDias;
  cache = { equipes, vagas, ausencias, campanhas, alocacoes, veiculos, movimentos, contratos };
  return cache;
}
