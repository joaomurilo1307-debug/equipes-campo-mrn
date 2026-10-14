import { test } from "node:test";
import assert from "node:assert/strict";
import { dadosAoEntrarNaEquipe, posicaoLivreParaOcupar, textoDaDesmobilizacao, vagaAbertaNoLugarDe } from "../src/lib/efetivos/vagas";

const posicao = { atividade: "Resgate", empresa: "Consominas", cargo: "Biólogo de Fauna", nivel: "Superior", direcao4x4: true, veiculoId: "vl-02", grupo: "Fauna", contrato: "3636 PNM", equipeContrato: "EQUIPE 01 - FLANCO NORTE - PTR" };

test("Desmobilizar: a vaga que abre no lugar tem a mesma função, empresa, atividade, nível, 4x4 e viatura, e nenhuma pessoa", () => {
  const v = vagaAbertaNoLugarDe(posicao);
  assert.equal(v.nome, null);
  assert.equal(v.semNome, false); // é vaga aberta de verdade, não "preenchida sem nome"
  assert.equal(v.status, "Vigente");
  assert.deepEqual([v.cargo, v.empresa, v.atividade, v.nivel, v.direcao4x4, v.veiculoId], ["Biólogo de Fauna", "Consominas", "Resgate", "Superior", true, "vl-02"]);
});

test("Puxar para uma equipe: assume o contrato da equipe e o lugar (atividade, viatura) da vaga ocupada, sem apagar o que a pessoa já tem", () => {
  const pessoa = { atividade: "Resgate", nivel: null as string | null, direcao4x4: null as boolean | null, veiculoId: "vl-antigo", contrato: "3687 LT" };
  const equipe = { id: "e2", nome: "FLANCO SUL - EQUIPE 02", projeto: "3636 PNM" };
  const vaga = { atividade: "Afugentamento", nivel: "Superior", direcao4x4: true, veiculoId: "vl-03" };
  const d = dadosAoEntrarNaEquipe(pessoa, equipe, vaga);
  assert.equal(d.equipeId, "e2");
  assert.equal(d.contrato, "3636 PNM"); // passa a trabalhar no contrato da equipe
  assert.equal(d.equipeContrato, "FLANCO SUL - EQUIPE 02");
  assert.equal(d.atividade, "Afugentamento");
  assert.equal(d.veiculoId, "vl-03"); // a viatura é do lugar, não da pessoa
  assert.equal(d.nivel, "Superior");
  assert.equal(d.direcao4x4, true);
  // sem vaga escolhida: não herda viatura de lugar nenhum
  assert.equal(dadosAoEntrarNaEquipe(pessoa, equipe).veiculoId, null);
  // equipe ainda sem contrato: a pessoa mantém o contrato que já tinha
  assert.equal(dadosAoEntrarNaEquipe(pessoa, { ...equipe, projeto: "A definir" }, vaga).contrato, "3687 LT");
  // o que a pessoa já tem de nível e 4x4 não é sobrescrito pela vaga
  assert.equal(dadosAoEntrarNaEquipe({ ...pessoa, nivel: "Técnico", direcao4x4: false }, equipe, vaga).nivel, "Técnico");
  assert.equal(dadosAoEntrarNaEquipe({ ...pessoa, nivel: "Técnico", direcao4x4: false }, equipe, vaga).direcao4x4, false);
});

test("Só se ocupa posição sem pessoa; o histórico da saída diz de onde, quando e para onde", () => {
  assert.equal(posicaoLivreParaOcupar({ nome: null }), true);
  assert.equal(posicaoLivreParaOcupar({ nome: "  " }), true);
  assert.equal(posicaoLivreParaOcupar({ nome: "Ana" }), false);
  assert.equal(textoDaDesmobilizacao("EQUIPE 01", "2026-10-14", "reserva", null), 'Saiu de "EQUIPE 01" em 14/10/2026 — disponível para outra equipe');
  assert.equal(textoDaDesmobilizacao("EQUIPE 01", "2026-10-14", "desligado", "fim do contrato"), 'Saiu de "EQUIPE 01" em 14/10/2026 — desmobilizado(a) (fim do contrato)');
});
