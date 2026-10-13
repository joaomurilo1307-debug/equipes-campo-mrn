// SOMENTE DESENVOLVIMENTO: com DEV_MOCK_XLSX apontando para a planilha, a tela abre sem banco nem login,
// usando os dados da própria planilha mais algumas campanhas e ausências de exemplo, só para conferir o visual.
// Em produção (NODE_ENV=production) nada disso é usado.
import { readFileSync } from "node:fs";
import { aplicarAjustes, lerPlanilhaEfetivos } from "./efetivos/importarPlanilha";
import { somarDias } from "./efetivos/disponibilidade";

export const modoMock = () => process.env.NODE_ENV !== "production" && !!process.env.DEV_MOCK_XLSX;

let cache: any = null;

export function dadosMock(): any {
  if (cache) return cache;
  const lido = aplicarAjustes(lerPlanilhaEfetivos(readFileSync(process.env.DEV_MOCK_XLSX!), { anoReferencia: 2026 }), [
    { contem: ["FLANCO"], projeto: "3636 PNM", gestor: "Ronaldo" },
    { contem: ["LAVRA"], projeto: "3686 LAVRA", gestor: "Ronaldo" },
  ]);
  const equipes = lido.equipes.map((e, i) => ({ id: e.codigo, codigo: e.codigo, nome: e.nome, projeto: e.projeto, contratoConfirmado: e.contratoConfirmado, gestor: e.gestor, grupo: e.grupo, status: e.status, _o: i }));
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
    observacao: v.observacao,
  }));
  const hoje = "2026-10-13";
  const nomeadas = (eq: string) => vagas.filter((v) => v.equipeId === eq && v.nome && v.status === "Vigente");
  const n1 = nomeadas("EQ-01");
  const n3 = nomeadas("EQ-03");
  const campanhas = [
    { id: "c1", codigo: "CAM-001", recebidaEm: "2026-10-02", solicitante: "MRN — Meio Ambiente", projeto: "3636 PNM", grupo: "Fauna", atividade: "Resgate", local: "Flanco Norte · Trecho 4", inicio: "2026-10-19", fim: "2026-11-20", qtdEquipes: 1, prioridade: "Alta", status: "Confirmada", observacao: null },
    { id: "c2", codigo: "CAM-002", recebidaEm: "2026-10-06", solicitante: "MRN — Lavra", projeto: "3686 LAVRA", grupo: "Fauna", atividade: "Afugentamento", local: "Frente de lavra 02", inicio: "2026-11-02", fim: "2026-12-11", qtdEquipes: 2, prioridade: "Média", status: "Planejada", observacao: null },
    { id: "c3", codigo: "CAM-003", recebidaEm: "2026-10-12", solicitante: "MRN — Meio Ambiente", projeto: "3636 PNM", grupo: "Fauna", atividade: "Afugentamento e Resgate", local: "Flanco Sul", inicio: "2026-12-01", fim: "2027-01-15", qtdEquipes: 2, prioridade: "Média", status: "Nova", observacao: null },
  ];
  const alocacoes = [
    ...n1.map((v, i) => ({ id: `a1-${i}`, campanhaId: "c1", vagaId: v.id, inicio: "2026-10-19", fim: "2026-11-20" })),
    ...n3.slice(0, 3).map((v, i) => ({ id: `a2-${i}`, campanhaId: "c2", vagaId: v.id, inicio: "2026-11-02", fim: "2026-12-11" })),
  ];
  const ausencias = [
    ...(n1[0] ? [{ id: "x1", vagaId: n1[0].id, tipo: "Férias", inicio: "2026-12-14", fim: "2027-01-02", observacao: null }] : []),
    ...(n3[1] ? [{ id: "x2", vagaId: n3[1].id, tipo: "Atestado", inicio: "2026-10-20", fim: "2026-10-23", observacao: null }] : []),
  ];
  const veiculos = lido.veiculos.map((v, i) => ({
    id: `ve${i + 1}`,
    codigo: `VEI-${String(i + 1).padStart(3, "0")}`,
    identificacao: v.identificacao,
    placa: null as string | null,
    modelo: null as string | null,
    tracao4x4: null as boolean | null,
    status: "Em operação",
    observacao: null as string | null,
  }));
  const movimentos = lido.veiculos.map((v, i) => {
    const eq = equipes.find((e) => e.codigo === v.equipeCodigo)!;
    return { id: `m${i + 1}`, veiculoId: `ve${i + 1}`, inicio: "2026-10-07", fim: null as string | null, projeto: eq.projeto, equipeId: eq.id, campanhaId: null as string | null, local: null as string | null, observacao: "Posição inicial segundo a planilha" };
  });
  // dois exemplos de veículo que mudou de contrato e um parado, para ver como aparece
  if (veiculos[0] && movimentos[0]) {
    movimentos[0].fim = somarDias(hoje, -1);
    movimentos.push({ id: "mx1", veiculoId: veiculos[0].id, inicio: hoje, fim: null, projeto: "3686 LAVRA", equipeId: "EQ-05", campanhaId: null, local: "Frente de lavra 02", observacao: "Reforço da lavra" });
    veiculos[0].placa = "RTX-4B21";
    veiculos[0].modelo = "Hilux 4x4";
    veiculos[0].tracao4x4 = true;
  }
  if (veiculos[5]) veiculos[5].status = "Em manutenção";
  cache = { equipes, vagas, ausencias, campanhas, alocacoes, veiculos, movimentos };
  return cache;
}
