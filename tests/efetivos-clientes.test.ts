import { test } from "node:test";
import assert from "node:assert/strict";
import { clienteDaEquipe, clientesDosDados, filtrarPorCliente, type DadosFiltraveis } from "../src/lib/efetivos/clientes";

const dados = (): DadosFiltraveis => ({
  contratos: [
    { codigo: "3686 PNM", cliente: "MRN" },
    { codigo: "AGA CB", cliente: "AGA" },
    { codigo: "SEM CLIENTE", cliente: null },
  ],
  equipes: [
    { id: "eq-mrn", projeto: "3686 PNM", grupo: "" },
    { id: "eq-aga", projeto: "AGA CB", grupo: "" },
    { id: "eq-semcli", projeto: "SEM CLIENTE", grupo: "" },
    { id: "res-mrn", projeto: "A definir", grupo: "Apoio", cliente: "MRN" },
    { id: "res-aga", projeto: "A definir", grupo: "Apoio", cliente: "AGA" },
    { id: "eq-nova", projeto: "A definir", grupo: "", cliente: "MRN" },
  ],
  vagas: [
    { id: "v-mrn", equipeId: "eq-mrn", veiculoId: "vei-1" },
    { id: "v-aga", equipeId: "eq-aga", veiculoId: "vei-2" },
    { id: "v-res-mrn", equipeId: "res-mrn", veiculoId: null },
    { id: "v-res-aga", equipeId: "res-aga", veiculoId: null },
    { id: "v-semcli", equipeId: "eq-semcli", veiculoId: null },
  ],
  ausencias: [{ vagaId: "v-mrn" }, { vagaId: "v-aga" }],
  campanhas: [{ id: "c-mrn", projeto: "3686 PNM" }, { id: "c-aga", projeto: "AGA CB" }],
  alocacoes: [{ campanhaId: "c-mrn", vagaId: "v-mrn" }, { campanhaId: "c-aga", vagaId: "v-aga" }],
  veiculos: [
    { id: "vei-1" }, // sem cliente marcado: é da MRN porque a pessoa da MRN vai nela
    { id: "vei-2" },
    { id: "vei-3", cliente: "MRN" }, // marcada, sem uso
    { id: "vei-4", cliente: "AGA" },
    { id: "vei-5" }, // sem cliente e sem uso: só a administração vê
  ],
  movimentos: [{ veiculoId: "vei-1" }, { veiculoId: "vei-4" }],
  movimentosEquipe: [{ equipeId: "eq-mrn" }, { equipeId: "eq-aga" }],
});

test("Cliente da equipe: o do contrato; sem contrato cadastrado, o da própria equipe", () => {
  const d = dados();
  assert.equal(clienteDaEquipe(d.equipes[0], d.contratos), "MRN");
  assert.equal(clienteDaEquipe(d.equipes[1], d.contratos), "AGA");
  assert.equal(clienteDaEquipe(d.equipes[2], d.contratos), null, "contrato sem cliente e equipe sem cliente");
  assert.equal(clienteDaEquipe(d.equipes[3], d.contratos), "MRN", "a reserva tem o cliente dela");
  assert.equal(clienteDaEquipe(d.equipes[5], d.contratos), "MRN", "equipe nova ainda sem contrato cadastrado");
});

test("Quem é de um cliente só enxerga o que é dele: equipes, pessoas, ausências, viaturas e contratos", () => {
  const mrn = filtrarPorCliente(dados(), "MRN");
  assert.deepEqual(mrn.equipes.map((e) => e.id), ["eq-mrn", "res-mrn", "eq-nova"]);
  assert.deepEqual(mrn.vagas.map((v) => v.id), ["v-mrn", "v-res-mrn"]);
  assert.deepEqual(mrn.ausencias.map((a) => a.vagaId), ["v-mrn"]);
  assert.deepEqual(mrn.veiculos.map((v) => v.id), ["vei-1", "vei-3"]);
  assert.deepEqual(mrn.movimentos.map((m) => m.veiculoId), ["vei-1"]);
  assert.deepEqual(mrn.contratos.map((c) => c.codigo), ["3686 PNM"]);
  assert.deepEqual(mrn.movimentosEquipe.map((m) => m.equipeId), ["eq-mrn"]);
  assert.deepEqual(mrn.campanhas.map((c) => c.id), ["c-mrn"]);
  assert.deepEqual(mrn.alocacoes.map((a) => a.campanhaId), ["c-mrn"]);

  const aga = filtrarPorCliente(dados(), "AGA");
  assert.deepEqual(aga.equipes.map((e) => e.id), ["eq-aga", "res-aga"]);
  assert.deepEqual(aga.vagas.map((v) => v.id), ["v-aga", "v-res-aga"]);
  assert.deepEqual(aga.veiculos.map((v) => v.id), ["vei-2", "vei-4"]);
  // ninguém do outro cliente vaza
  assert.ok(!mrn.vagas.some((v) => v.id === "v-aga" || v.id === "v-res-aga"));
  assert.ok(!aga.vagas.some((v) => v.id === "v-mrn" || v.id === "v-res-mrn"));
});

test("Administração (sem cliente) vê tudo; cliente que não existe não vê nada", () => {
  const todos = filtrarPorCliente(dados(), null);
  assert.equal(todos.equipes.length, 6);
  assert.equal(todos.veiculos.length, 5, "inclusive a viatura sem cliente e sem uso");
  const nenhum = filtrarPorCliente(dados(), "XYZ");
  assert.equal(nenhum.equipes.length + nenhum.vagas.length + nenhum.veiculos.length + nenhum.contratos.length, 0);
});

test("Clientes que existem nos dados", () => {
  assert.deepEqual(clientesDosDados(dados()), ["AGA", "MRN"]);
  assert.deepEqual(clientesDosDados({ contratos: [], equipes: [] }), []);
});
