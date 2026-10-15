// Junta as planilhas por contrato (uma planilha por contrato, todas no mesmo formato) numa base só.
// Regras: cada linha das planilhas vira UMA posição (nada some, nada duplica); a aba de apoio que se repete nas planilhas
// vale uma vez; quem aparece na aba de apoio E dentro de uma equipe é a mesma pessoa (fica na equipe, com a nota do apoio);
// nomes iguais ou parecidos em posições diferentes não são juntados -- ficam marcados para conferir.
import { CODIGO_RESERVA, lerPlanilhaEfetivos, normalizar, type EquipeImportada, type OpcoesLeitura, type ResultadoImportacao, type VagaImportada, type VeiculoImportado } from "./importarPlanilha";
import { pontuarNomes, tokensDoNome } from "./cruzarAbas";

const fmt = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
const juntar = (a: string | null | undefined, b: string, sep = " | ") => (a ? `${a}${sep}${b}` : b);

/** Os nomes que uma célula pode representar: ela inteira e cada parte de "Fulano / Beltrano". */
const nomesDaCelula = (nome: string) => [nome, ...(nome.includes("/") ? nome.split("/").map((x) => x.trim()).filter(Boolean) : [])];

/** 0 = não é a mesma pessoa; 1 = só o primeiro nome; 2+ = nome e sobrenome combinam. */
function parecidos(a: string, b: string): number {
  let melhor = 0;
  for (const x of nomesDaCelula(a)) for (const y of nomesDaCelula(b)) melhor = Math.max(melhor, pontuarNomes(tokensDoNome(x), tokensDoNome(y)));
  return melhor;
}

/** Lê uma ou mais planilhas. Várias só se juntam se todas forem do formato por contrato. */
export function lerPlanilhasEfetivos(arquivos: (ArrayBuffer | Uint8Array | Buffer)[], opcoes: OpcoesLeitura = {}): ResultadoImportacao {
  if (arquivos.length === 0) throw new Error("Nenhuma planilha enviada.");
  const lidos = arquivos.map((a) => lerPlanilhaEfetivos(a, opcoes));
  if (lidos.length === 1) return lidos[0];
  if (lidos.some((l) => l.formato !== "contratos")) {
    throw new Error("Para juntar várias planilhas, todas precisam ser do tipo “uma planilha por contrato” (colunas ATIVIDADE, CONTRATO, EMPRESA, EQUIPE, Cargo / Função, NOME PROFISSIONAIS...).");
  }
  return combinarResultados(lidos);
}

export function combinarResultados(lidos: ResultadoImportacao[]): ResultadoImportacao {
  const equipes: EquipeImportada[] = [];
  const veiculos: VeiculoImportado[] = [];
  const vagas: VagaImportada[] = [];
  const contratos = new Map<string, ResultadoImportacao["contratos"][number]>();
  const avisos: string[] = [];
  const fontes: { nome: string; linhas: number }[] = [];
  let reserva: EquipeImportada | undefined;

  lidos.forEach((r) => {
    const codigoNovo = new Map<string, string>();
    for (const e of r.equipes) {
      if (e.codigo === CODIGO_RESERVA) {
        reserva ??= { ...e };
        codigoNovo.set(e.codigo, CODIGO_RESERVA);
        continue;
      }
      const novo = `EQ-${String(equipes.length + 1).padStart(2, "0")}`;
      codigoNovo.set(e.codigo, novo);
      equipes.push({ ...e, codigo: novo });
    }
    const refNova = new Map<string, string>();
    for (const v of r.veiculos) {
      const ref = `${codigoNovo.get(v.equipeCodigo)}#${veiculos.length + 1}`;
      refNova.set(v.ref, ref);
      veiculos.push({ ...v, ref, equipeCodigo: codigoNovo.get(v.equipeCodigo)! });
    }
    for (const v of r.vagas) vagas.push({ ...v, equipeCodigo: codigoNovo.get(v.equipeCodigo)!, carroRef: v.carroRef ? refNova.get(v.carroRef) ?? null : null });
    for (const c of r.contratos) if (!contratos.has(c.codigo)) contratos.set(c.codigo, c);
    avisos.push(...r.avisos);
    fontes.push(...(r.conferencia?.fontes ?? []));
  });

  // ---- a aba de apoio repetida nas planilhas vale uma vez (a linha de cima guarda a origem das duas)
  const noApoio = vagas.filter((v) => v.equipeCodigo === CODIGO_RESERVA);
  const unicos = new Map<string, VagaImportada>();
  const descartar = new Set<VagaImportada>();
  for (const v of noApoio) {
    const chave = normalizar(v.nome);
    const primeiro = unicos.get(chave);
    if (!primeiro) {
      unicos.set(chave, v);
      continue;
    }
    const assinatura = (x: VagaImportada) => [x.contratoAtual, x.cargo, x.disponivelAPartir, x.destino, x.observacao].map((t) => normalizar(t)).join("|");
    primeiro.origem = juntar(primeiro.origem, v.origem ?? "", " + ");
    if (assinatura(primeiro) !== assinatura(v)) {
      primeiro.conferir = juntar(primeiro.conferir, `A aba de apoio repetida em outra planilha traz dados diferentes para ${v.nome}: contrato ${v.contratoAtual ?? "—"}, destino ${v.destino ?? "—"}, liberação ${v.disponivelAPartir ? fmt(v.disponivelAPartir) : "—"}`);
      avisos.push(`Apoio: ${v.nome} aparece em duas planilhas com dados diferentes; vale a primeira.`);
    }
    descartar.add(v);
  }

  // ---- quem está no apoio e também dentro de uma equipe é uma pessoa só: fica na equipe, com a nota do apoio
  const naEquipe = vagas.filter((v) => v.equipeCodigo !== CODIGO_RESERVA && v.nome);
  const equipePorCodigo = new Map(equipes.map((e) => [e.codigo, e]));
  let absorvidas = 0;
  for (const ap of unicos.values()) {
    const pontos = naEquipe.map((v) => ({ v, p: parecidos(ap.nome!, v.nome!) })).filter((x) => x.p >= 2);
    if (pontos.length === 0) continue;
    pontos.sort((a, b) => b.p - a.p);
    if (pontos.length > 1 && pontos[0].p === pontos[1].p) {
      ap.conferir = juntar(ap.conferir, `O nome combina com mais de uma posição de equipe (${pontos.map((x) => `«${x.v.nome}»`).join(", ")}): não juntei`);
      continue;
    }
    const alvo = pontos[0].v;
    const eq = equipePorCodigo.get(alvo.equipeCodigo);
    const partes = [`vem do contrato ${ap.contratoAtual ?? "—"}`];
    if (ap.disponivelAPartir) partes.push(`livre a partir de ${fmt(ap.disponivelAPartir)}`);
    if (ap.destino) partes.push(`destino indicado: ${ap.destino}`);
    if (ap.observacao) partes.push(ap.observacao);
    alvo.observacao = juntar(alvo.observacao, `Aba de apoio (${ap.nome}): ${partes.join(" · ")}`);
    alvo.origem = juntar(alvo.origem, ap.origem ?? "", " + ");
    if (ap.destino && eq) {
      // o destino indicado precisa estar na equipe/contrato/atividade onde a pessoa aparece
      const alvoTexto = new Set(normalizar(`${eq.nome} ${eq.projeto} ${alvo.atividade}`).split(/[^a-z0-9]+/).filter(Boolean));
      const faltam = normalizar(ap.destino).split(/[^a-z0-9]+/).filter((t) => t.length > 2 && !alvoTexto.has(t));
      if (faltam.length) alvo.conferir = juntar(alvo.conferir, `A aba de apoio manda ${ap.nome} para «${ap.destino}», mas ele(a) aparece em «${eq.nome}» (${eq.projeto})`);
    }
    descartar.add(ap);
    absorvidas++;
  }

  const finais = [...vagas.filter((v) => !descartar.has(v) && v.equipeCodigo !== CODIGO_RESERVA), ...vagas.filter((v) => !descartar.has(v) && v.equipeCodigo === CODIGO_RESERVA)];

  // ---- o mesmo nome (ou muito parecido) em posições diferentes: não junta, mas marca nos dois lados
  const nomeados = finais.filter((v) => v.nome);
  const descreve = (v: VagaImportada) => {
    const e = equipePorCodigo.get(v.equipeCodigo);
    return e ? `${e.nome}, contrato ${e.projeto}` : "reserva (fora das equipes)";
  };
  let pares = 0;
  for (let a = 0; a < nomeados.length; a++) {
    for (let b = a + 1; b < nomeados.length; b++) {
      const p = parecidos(nomeados[a].nome!, nomeados[b].nome!);
      if (p === 0) continue;
      const x = nomeados[a];
      const y = nomeados[b];
      const forte = p >= 2;
      // só o primeiro nome igual: só vale a pena apontar quando um dos lados tem apenas o primeiro nome
      if (!forte && tokensDoNome(x.nome!).length > 1 && tokensDoNome(y.nome!).length > 1) continue;
      const aviso = (outro: VagaImportada) => (forte ? `Nome igual ou muito parecido em outra posição: «${outro.nome}» (${descreve(outro)}). Confirmar se é a mesma pessoa` : `Só o primeiro nome coincide com «${outro.nome}» (${descreve(outro)}). Confirmar se é a mesma pessoa`);
      x.conferir = juntar(x.conferir, aviso(y));
      y.conferir = juntar(y.conferir, aviso(x));
      pares++;
    }
  }

  finais.forEach((v, i) => (v.numero = i + 1));
  if (reserva && finais.some((v) => v.equipeCodigo === CODIGO_RESERVA)) equipes.push(reserva);
  const total = fontes.reduce((s, f) => s + f.linhas, 0);
  avisos.push(
    `${lidos.length} planilhas juntas: ${total} linhas lidas -> ${finais.length} posições (${descartar.size} linhas de apoio não viraram posição própria: ${absorvidas} já estão numa equipe, ${descartar.size - absorvidas} são repetição da aba de apoio); ${pares} par(es) de nomes parecidos marcados para conferir.`
  );
  return {
    formato: "contratos",
    equipes,
    vagas: finais,
    veiculos,
    contratos: [...contratos.values()],
    avisos,
    conferencia: { fontes, substituidas: [] },
  };
}
