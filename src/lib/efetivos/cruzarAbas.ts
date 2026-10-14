// Cruzamento das duas visões da mesma planilha do Samuel:
//   - a primeira aba (cadastro): contrato -> equipe do contrato -> pessoa, com função, empresa e status.
//     O contrato de cada equipe está escrito ao lado do nome dela (coluna PROJETO);
//   - a aba "DIVISÃO DE EQUIPES": as equipes de campo da semana, com viatura e 4x4.
// A mesma pessoa aparece nas duas, às vezes com grafia diferente ("Suellem Letícia" / "Suelen Leticia"), e as
// equipes foram renumeradas de uma aba para a outra. O contrato de cada equipe de campo vem do nome da equipe
// correspondente na primeira aba; as pessoas só são ligadas com evidência (na dúvida ficam separadas: o sistema
// deixa mover e editar). Resultado: hierarquia contrato -> equipe -> pessoa, cada pessoa uma vez.
import type { EquipeImportada, VagaImportada, ContratoImportado } from "./importarPlanilha";

export type PessoaCadastro = {
  nome: string;
  contrato: string;
  gestor: string | null;
  grupo: string | null;
  equipeContrato: string | null;
  atividade: string;
  empresa: string;
  cargo: string;
  status: string;
  observacao: string | null;
  ordem?: number; // linha na primeira aba, para manter a ordem das posições
};

/** Posição da primeira aba sem pessoa: vaga em contratação, ou preenchida com o nome em branco. */
export type PosicaoCadastro = {
  contrato: string;
  gestor: string | null;
  grupo: string | null;
  equipeContrato: string | null;
  atividade: string;
  empresa: string;
  cargo: string;
  status: string;
  tipo: "branco" | "contratacao";
  ordem: number;
};

const CODIGO_FORA = "APOIO"; // a "reserva": quem não está em nenhuma equipe (apoio de outro contrato, desmobilizados, disponíveis)
const PROJETO_A_DEFINIR = "A definir";

const norm = (t: unknown) =>
  String(t ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

export function tokensDoNome(nome: string): string[] {
  return norm(nome)
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z ]/g, " ")
    .split(" ")
    .filter(Boolean)
    .filter((t) => !["de", "da", "do", "dos", "das", "e"].includes(t));
}

function distancia(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (Math.abs(m - n) > 2) return 3;
  let ant = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const atual = [i];
    for (let j = 1; j <= n; j++) atual[j] = Math.min(ant[j] + 1, atual[j - 1] + 1, ant[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    ant = atual;
  }
  return ant[n];
}

/** Família da função, para só aceitar par fraco (só o primeiro nome) se a função também combinar. */
export function familiaDoCargo(cargo: string): string {
  const c = norm(cargo);
  if (c.includes("veterin")) return "vet";
  if (c.includes("flora")) return "flora";
  if (c.includes("biolog")) return c.includes("abelha") ? "abelha" : "bio";
  if (c.includes("motosserra") || c.includes("tecnico")) return "op";
  if (c.includes("auxiliar") || c.includes("mateiro")) return "aux";
  if (c.includes("coorden")) return "coord";
  return c.trim();
}

const familiaDaEmpresa = (e: string) => (norm(e).includes("cooper") ? "coop" : norm(e).includes("consominas") ? "cons" : norm(e).trim());
const atividadeNorm = (a: string) => (norm(a).includes("afug") ? "afug" : norm(a).includes("resg") ? "resg" : norm(a).trim());
/** O "papel" da posição: mesma empresa, mesma família de função e mesma atividade. */
const papel = (x: { empresa: string; cargo: string; atividade: string }) => `${familiaDaEmpresa(x.empresa)}|${familiaDoCargo(x.cargo)}|${atividadeNorm(x.atividade)}`;

/**
 * 0 = não é a mesma pessoa; 1 = só o primeiro nome combina (par fraco); 2+ = primeiro nome e sobrenome (ou inicial) combinam.
 * Liga: "Isabele Macedo" / "Isabelle F. Macedo", "Maysa Santos" / "Maysa S. Rodrigues", "Diego Madero" / "Diego Madeira".
 * NÃO liga: "Lais Barbosa" / "Lais De Nazaré" (sobrenomes diferentes).
 */
export function pontuarNomes(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const d0 = distancia(a[0], b[0]);
  if (d0 > 2) return 0;
  const ra = a.slice(1);
  const rb = b.slice(1);
  let sobrenome = 0;
  let exato = false;
  for (const x of ra) {
    for (const y of rb) {
      if (x.length >= 2 && x === y) {
        sobrenome += 2;
        exato = true;
        break;
      }
      if (x.length >= 6 && y.length >= 6 && distancia(x, y) <= 2) {
        sobrenome += 2;
        break;
      }
      if ((x.length === 1 && y.length > 1 && y.startsWith(x)) || (y.length === 1 && x.length > 1 && x.startsWith(y))) {
        sobrenome += 1;
        break;
      }
    }
  }
  const menor = Math.min(a[0].length, b[0].length);
  const primeiroOk = d0 === 0 || (d0 === 1 && (menor >= 5 || exato)) || (d0 === 2 && menor >= 6 && exato);
  if (!primeiroOk) return 0;
  if (sobrenome > 0) return 1 + (d0 === 0 ? 1 : 0) + sobrenome;
  // sem sobrenome em comum: só vale se um dos lados tem apenas o primeiro nome
  if (ra.length === 0 || rb.length === 0) return d0 === 0 ? 1 : 0;
  return 0;
}

type Par = { i: number; j: number; pontos: number };

/** Liga, um a um, os itens de `A` aos de `B` com maior pontuação. Par fraco só se o primeiro nome for único e a função combinar. */
function ligar(A: { nome: string; cargo: string }[], B: { nome: string; cargo: string }[]): Map<number, { j: number; pontos: number }> {
  const ta = A.map((x) => tokensDoNome(x.nome));
  const tb = B.map((x) => tokensDoNome(x.nome));
  const contar = (ts: string[][]) => {
    const m = new Map<string, number>();
    for (const t of ts) if (t[0]) m.set(t[0], (m.get(t[0]) ?? 0) + 1);
    return m;
  };
  const primeiroA = contar(ta);
  const primeiroB = contar(tb);
  const pares: Par[] = [];
  for (let i = 0; i < A.length; i++) {
    for (let j = 0; j < B.length; j++) {
      const p = pontuarNomes(ta[i], tb[j]);
      if (p === 0) continue;
      if (p === 1) {
        const unico = (primeiroA.get(ta[i][0]) ?? 0) === 1 && (primeiroB.get(tb[j][0]) ?? 0) === 1;
        if (!unico || familiaDoCargo(A[i].cargo) !== familiaDoCargo(B[j].cargo)) continue;
      }
      pares.push({ i, j, pontos: p });
    }
  }
  pares.sort((x, y) => y.pontos - x.pontos);
  const usadosA = new Set<number>();
  const usadosB = new Set<number>();
  const ligacao = new Map<number, { j: number; pontos: number }>();
  for (const p of pares) {
    if (usadosA.has(p.i) || usadosB.has(p.j)) continue;
    usadosA.add(p.i);
    usadosB.add(p.j);
    ligacao.set(p.i, { j: p.j, pontos: p.pontos });
  }
  return ligacao;
}

/** Palavras em comum entre dois nomes de equipe ("EQUIPE 01 - FLANCO NORTE - PTR" ~ "FLANCO NORTE - EQUIPE 01"). */
export function afinidadeDeEquipes(a: string, b: string): number {
  const toks = (s: string) => new Set(norm(s).replace(/[^a-z0-9 ]/g, " ").split(" ").filter((t) => t && t !== "equipe"));
  const ta = toks(a);
  const tb = toks(b);
  let n = 0;
  for (const t of ta) if (tb.has(t)) n++;
  return n;
}

export type ResultadoCruzamento = {
  equipes: EquipeImportada[];
  vagas: VagaImportada[];
  contratos: ContratoImportado[];
  resumo: { ligadas: number; encaixadas: number; extrasNaEquipe: number; equipesDoCadastro: number; apoioJaNaEquipe: number; equipesComContrato: number };
};

/**
 * `divisao`: equipes de campo + posições (com a reserva "APOIO" para quem vem de outro contrato);
 * `pessoas`: cadastro por contrato. Devolve a hierarquia contrato -> equipe -> pessoa, cada pessoa uma vez.
 */
export function cruzarCadastroComDivisao(
  divisao: { equipes: EquipeImportada[]; vagas: VagaImportada[] },
  pessoas: PessoaCadastro[],
  contratosDoCadastro: ContratoImportado[] = [],
  semPessoa: PosicaoCadastro[] = []
): ResultadoCruzamento {
  const equipes = divisao.equipes.map((e) => ({ ...e }));
  const posicoes = divisao.vagas.filter((v) => v.equipeCodigo !== CODIGO_FORA).map((v) => ({ ...v }));
  const apoio = divisao.vagas.filter((v) => v.equipeCodigo === CODIGO_FORA).map((v) => ({ ...v }));

  const pessoaNaPosicao = new Map<number, number>(); // pessoa -> posição
  const posicaoDaPessoa = new Map<number, number>(); // posição -> pessoa
  const forcaDaLigacao = new Map<number, number>(); // posição -> pontos (2+ = nome e sobrenome combinam; 1 = par fraco ou por posição)

  function vincular(iPos: number, iPes: number, pontos: number, nota?: string) {
    const slot = posicoes[iPos];
    const p = pessoas[iPes];
    slot.contrato = p.contrato;
    slot.equipeContrato = p.equipeContrato;
    slot.grupo = p.grupo;
    // o status do cadastro vale quando a equipe de campo ainda diz "Vigente" (ex.: afastado pelo INSS)
    if (slot.status === "Vigente" && p.status !== "Vigente") {
      slot.status = p.status;
      slot.observacao = [slot.observacao, p.observacao].filter(Boolean).join(" · ") || null;
    }
    if (nota) slot.observacao = [slot.observacao, nota].filter(Boolean).join(" · ");
    pessoaNaPosicao.set(iPes, iPos);
    posicaoDaPessoa.set(iPos, iPes);
    forcaDaLigacao.set(iPos, pontos);
  }

  // 1) pessoas com nome nas equipes de campo <-> cadastro (pelo nome)
  const nomeadas = posicoes.map((v, idx) => ({ v, idx })).filter((x) => !!x.v.nome);
  const porNome = ligar(
    nomeadas.map((x) => ({ nome: x.v.nome!, cargo: x.v.cargo })),
    pessoas.map((p) => ({ nome: p.nome, cargo: p.cargo }))
  );
  for (const [a, { j, pontos }] of porNome) vincular(nomeadas[a].idx, j, pontos);

  // 2) equipes do cadastro (contrato + nome) e quantas pessoas cada uma tem em comum com cada equipe de campo
  const chaveT1 = (p: PessoaCadastro) => `${p.contrato}|${p.equipeContrato ?? ""}`;
  const chavesT1 = [...new Set(pessoas.map(chaveT1))];
  const peso = new Map<string, Map<string, number>>();
  const pesoForte = new Map<string, number>(); // `${k}>${cod}` -> ligações fortes
  for (const [iPes, iPos] of pessoaNaPosicao) {
    if (/mobiliz/i.test(posicoes[iPos].nome ?? "")) continue; // em mobilização: ainda é de outro contrato
    const k = chaveT1(pessoas[iPes]);
    const cod = posicoes[iPos].equipeCodigo;
    if (!peso.has(k)) peso.set(k, new Map());
    peso.get(k)!.set(cod, (peso.get(k)!.get(cod) ?? 0) + 1);
    if ((forcaDaLigacao.get(iPos) ?? 0) >= 2) pesoForte.set(`${k}>${cod}`, (pesoForte.get(`${k}>${cod}`) ?? 0) + 1);
  }
  const nomeDoTime = new Map(equipes.map((e) => [e.codigo, e.nome]));
  const candidatos: { k: string; cod: string; w: number; af: number }[] = [];
  for (const [k, m] of peso) for (const [cod, w] of m) candidatos.push({ k, cod, w, af: afinidadeDeEquipes(k.split("|")[1] ?? "", nomeDoTime.get(cod) ?? "") });
  candidatos.sort((a, b) => b.w - a.w || b.af - a.af);
  const equipeDoCadastro = new Map<string, { cod: string; w: number }>(); // equipe do cadastro -> equipe de campo (1 a 1, pelas pessoas)
  const codigosUsados = new Set<string>();
  for (const c of candidatos) {
    if (equipeDoCadastro.has(c.k) || codigosUsados.has(c.cod)) continue;
    equipeDoCadastro.set(c.k, { cod: c.cod, w: c.w });
    codigosUsados.add(c.cod);
  }

  // 3) dentro de cada par confirmado (2+ pessoas em comum): posição a posição (mesma empresa, função e atividade)
  const porPapel = <T,>(lista: T[], chave: (x: T) => string) => {
    const m = new Map<string, T[]>();
    for (const x of lista) {
      const c = chave(x);
      if (!m.has(c)) m.set(c, []);
      m.get(c)!.push(x);
    }
    return m;
  };
  let encaixadas = 0;
  let extras = 0;
  for (const [k, { cod, w }] of equipeDoCadastro) {
    if (w < 2) continue;
    const doTime = pessoas.map((p, i) => ({ p, i })).filter((x) => chaveT1(x.p) === k && !pessoaNaPosicao.has(x.i));
    const slotsNomeados = posicoes.map((v, i) => ({ v, i })).filter((x) => x.v.equipeCodigo === cod && !!x.v.nome && !posicaoDaPessoa.has(x.i));
    // 3a) uma única posição nomeada e uma única pessoa do cadastro com o mesmo papel: é a mesma pessoa, com o nome grafado diferente
    const gSlots = porPapel(slotsNomeados, (x) => papel(x.v));
    const gPessoas = porPapel(doTime, (x) => papel(x.p));
    for (const [pp, ss] of gSlots) {
      const ps = gPessoas.get(pp) ?? [];
      if (ss.length === 1 && ps.length === 1 && norm(ss[0].v.empresa).includes("consominas")) {
        vincular(ss[0].i, ps[0].i, 1, `No cadastro por contrato: ${ps[0].p.nome}`);
        encaixadas++;
      }
    }
    // 3b) posições preenchidas sem nome recebem, na ordem, as pessoas de mesmo papel
    const livresPessoas = doTime.filter((x) => !pessoaNaPosicao.has(x.i));
    const slotsSemNome = posicoes.map((v, i) => ({ v, i })).filter((x) => x.v.equipeCodigo === cod && !x.v.nome && x.v.semNome);
    const gSem = porPapel(slotsSemNome, (x) => papel(x.v));
    const gPes2 = porPapel(livresPessoas, (x) => papel(x.p));
    for (const [pp, ss] of gSem) {
      const ps = gPes2.get(pp) ?? [];
      for (let n = 0; n < Math.min(ss.length, ps.length); n++) {
        posicoes[ss[n].i].nome = ps[n].p.nome;
        posicoes[ss[n].i].semNome = false;
        vincular(ss[n].i, ps[n].i, 1);
        encaixadas++;
      }
    }
    // 3c) quem sobrou desta equipe do cadastro entra como posição a mais na mesma equipe de campo
    for (const x of doTime) {
      if (pessoaNaPosicao.has(x.i)) continue;
      posicoes.push({
        numero: null,
        equipeCodigo: cod,
        atividade: x.p.atividade,
        empresa: x.p.empresa,
        cargo: x.p.cargo,
        nome: x.p.nome,
        status: x.p.status,
        observacao: x.p.observacao,
        ausencia: null,
        contrato: x.p.contrato,
        equipeContrato: x.p.equipeContrato,
        grupo: x.p.grupo,
        semNome: false,
      });
      pessoaNaPosicao.set(x.i, posicoes.length - 1);
      posicaoDaPessoa.set(posicoes.length - 1, x.i);
      forcaDaLigacao.set(posicoes.length - 1, 1);
      extras++;
    }
  }

  // 4) apoio de outro contrato: se a pessoa já está numa equipe de campo, a posição dela ganha a data de liberação
  const ligApoio = ligar(
    apoio.map((a) => ({ nome: a.nome ?? "", cargo: a.cargo })),
    nomeadas.map((x) => ({ nome: x.v.nome!, cargo: x.v.cargo }))
  );
  const apoioQueFicou: VagaImportada[] = [];
  let apoioJaNaEquipe = 0;
  apoio.forEach((a, k) => {
    const alvo = ligApoio.get(k);
    const slot = alvo ? posicoes[nomeadas[alvo.j].idx] : null;
    // só junta quando o nome bate inteiro (primeiro nome + sobrenome)
    if (slot && alvo && alvo.pontos >= 3) {
      slot.contratoAtual = a.contratoAtual ?? null;
      slot.disponivelAPartir = a.disponivelAPartir ?? null;
      slot.destino = a.destino ?? null;
      slot.observacao = [slot.observacao, a.observacao].filter(Boolean).join(" · ") || null;
      apoioJaNaEquipe++;
    } else {
      apoioQueFicou.push({ ...a, contrato: null });
    }
  });

  // 5) equipes que só existem no cadastro (as do contrato LT, as do 3648, uma Lavra...) viram equipes de verdade, sob o contrato delas,
  //    com TODAS as posições da primeira aba: pessoas, vagas em contratação e posições preenchidas sem nome informado
  const restantes = pessoas.map((p, i) => ({ p, i })).filter((x) => !pessoaNaPosicao.has(x.i));
  const jaCoberta = (k: string) => (equipeDoCadastro.get(k)?.w ?? 0) >= 2; // equipe do cadastro já representada por uma equipe de campo
  const chavesSoDoCadastro = [...new Set([...restantes.map((x) => chaveT1(x.p)), ...semPessoa.map((x) => `${x.contrato}|${x.equipeContrato ?? ""}`)])].filter((k) => !jaCoberta(k));
  const novas = new Map<string, EquipeImportada>();
  const maiorCodigo = equipes.reduce((m, e) => Math.max(m, Number(/^EQ-(\d+)$/.exec(e.codigo)?.[1] ?? 0)), 0);
  const posicoesNovas: (VagaImportada & { _ordem: number })[] = [];
  for (const k of chavesSoDoCadastro) {
    const pes = restantes.filter((x) => chaveT1(x.p) === k);
    const sem = semPessoa.filter((x) => `${x.contrato}|${x.equipeContrato ?? ""}` === k);
    const base = pes[0]?.p ?? sem[0];
    if (!base) continue;
    const grupos = [...pes.map((x) => x.p.grupo), ...sem.map((x) => x.grupo)];
    const eq: EquipeImportada = {
      codigo: `EQ-${String(maiorCodigo + novas.size + 1).padStart(2, "0")}`,
      projeto: base.contrato,
      contratoConfirmado: true,
      gestor: base.gestor,
      grupo: grupos.every((g) => g === "Flora") ? "Flora" : "Fauna",
      nome: base.equipeContrato ?? "(sem nome na planilha)",
      status: "Ativa",
    };
    novas.set(k, eq);
    for (const x of pes) {
      posicoesNovas.push({
        numero: null,
        equipeCodigo: eq.codigo,
        atividade: x.p.atividade,
        empresa: x.p.empresa,
        cargo: x.p.cargo,
        nome: x.p.nome,
        status: x.p.status,
        observacao: x.p.observacao,
        ausencia: null,
        contrato: x.p.contrato,
        equipeContrato: x.p.equipeContrato,
        grupo: x.p.grupo,
        semNome: false,
        _ordem: x.p.ordem ?? 0,
      });
    }
    for (const x of sem) {
      posicoesNovas.push({
        numero: null,
        equipeCodigo: eq.codigo,
        atividade: x.atividade,
        empresa: x.empresa,
        cargo: x.cargo,
        nome: null,
        status: x.status,
        observacao: null,
        ausencia: null,
        contrato: x.contrato,
        equipeContrato: x.equipeContrato,
        grupo: x.grupo,
        semNome: x.tipo === "branco",
        _ordem: x.ordem,
      });
    }
  }
  posicoesNovas.sort((a, b) => a.equipeCodigo.localeCompare(b.equipeCodigo) || a._ordem - b._ordem);

  // 6) contrato de cada equipe de campo: o escrito na primeira aba ao lado da equipe de mesmo nome.
  //    Primeiro pelas pessoas em comum; depois pelo nome da equipe (ex.: "LAVRA - EQUIPE 02" ~ "EQUIPE LAVRA 02").
  let comContrato = 0;
  for (const e of equipes) {
    if (e.codigo === CODIGO_FORA) continue;
    let contrato: string | null = null;
    // equipe do cadastro correspondente: 2+ pessoas em comum, ou 1 pessoa com nome e sobrenome iguais
    const pelasPessoas = [...equipeDoCadastro.entries()].find(([k, m]) => m.cod === e.codigo && (m.w >= 2 || (pesoForte.get(`${k}>${m.cod}`) ?? 0) >= 1));
    if (pelasPessoas) contrato = pelasPessoas[0].split("|")[0];
    if (!contrato) {
      // quem está "em mobilização" ainda é de outro contrato e par fraco (só o 1º nome) sozinho não prova nada
      const fortes = new Set<string>();
      posicoes.forEach((v, i) => {
        if (v.equipeCodigo === e.codigo && v.contrato && !/mobiliz/i.test(v.nome ?? "") && (forcaDaLigacao.get(i) ?? 0) >= 2) fortes.add(v.contrato);
      });
      if (fortes.size === 1) contrato = [...fortes][0];
    }
    if (!contrato) {
      const ranking = chavesT1
        .map((k) => ({ k, af: afinidadeDeEquipes(k.split("|")[1] ?? "", e.nome) }))
        .filter((x) => x.af >= 2)
        .sort((a, b) => b.af - a.af);
      const melhores = ranking.filter((x) => x.af === ranking[0]?.af);
      const contratos = new Set(melhores.map((x) => x.k.split("|")[0]));
      if (contratos.size === 1) contrato = [...contratos][0];
    }
    e.projeto = contrato ?? PROJETO_A_DEFINIR;
    if (contrato) {
      comContrato++;
      e.gestor = pessoas.find((p) => p.contrato === contrato && p.gestor)?.gestor ?? e.gestor;
    }
  }

  // 7) contratos conhecidos pela planilha
  const contratos = new Map<string, ContratoImportado>(contratosDoCadastro.map((c) => [c.codigo, { ...c }]));
  for (const p of pessoas) {
    const c = contratos.get(p.contrato) ?? { codigo: p.contrato, gestor: null, cliente: null };
    if (!c.gestor && p.gestor) c.gestor = p.gestor;
    contratos.set(p.contrato, c);
  }

  const todas: VagaImportada[] = [...posicoes, ...posicoesNovas.map(({ _ordem, ...v }) => (void _ordem, v)), ...apoioQueFicou].map((v, i) => ({ ...v, numero: i + 1 }));
  const equipesFinais = [...equipes.filter((e) => e.codigo !== CODIGO_FORA), ...novas.values(), ...equipes.filter((e) => e.codigo === CODIGO_FORA)];
  return {
    equipes: equipesFinais,
    vagas: todas,
    contratos: [...contratos.values()],
    resumo: { ligadas: porNome.size, encaixadas, extrasNaEquipe: extras, equipesDoCadastro: novas.size, apoioJaNaEquipe, equipesComContrato: comContrato },
  };
}
