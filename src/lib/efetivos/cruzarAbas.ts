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
  ordem?: number; // ordem na primeira aba, para manter a ordem das posições
  linha?: number; // linha no Excel
  id?: string | null; // coluna ID da primeira aba
  bloco?: number; // equipe da primeira aba: cada célula de equipe (mesclada) é um bloco, mesmo que o nome se repita
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
  linha?: number;
  id?: string | null;
  bloco?: number;
};

const CODIGO_FORA = "APOIO"; // a "reserva": quem não está em nenhuma equipe (apoio de outro contrato, desmobilizados, disponíveis)
const PROJETO_A_DEFINIR = "A definir";

/**
 * Contratos informados por quem conhece a operação (João, 14/10/2026). São 2 contratos além dos 4 da primeira aba:
 * o 3686 (equipes Felinos e Meliponário) e o 3687 (equipe Fauna Atropelada). São contratos novos, DIFERENTES de
 * "3686 LAVRA" e "3687 LT"; a planilha não os traz.
 */
const CONTRATO_INFORMADO: Record<string, string> = {
  "equipe de felinos": "3686",
  meliponario: "3686",
  "fauna atropelada": "3687",
};

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
  /** Linhas da aba 1 que não viraram posição porque a aba 2 (a divisão mais recente) já define as vagas abertas da equipe. */
  substituidas: { origem: string; descricao: string; equipe: string }[];
};

type Bloco = { id: number; contrato: string; nome: string | null; gestor: string | null; grupos: (string | null)[]; pessoas: number[]; brancos: PosicaoCadastro[]; contratacoes: PosicaoCadastro[] };
type Pos = { v: VagaImportada; orig: string[]; conf: string[] };

const origemAba1 = (x: { id?: string | null; linha?: number }) => `Aba 1 · ID ${x.id ?? "?"} (linha ${x.linha ?? "?"})`;
const empFam = (x: { empresa: string; cargo: string }) => `${familiaDaEmpresa(x.empresa)}|${familiaDoCargo(x.cargo)}`;

/** Quanto duas equipes se parecem pela composição (empresa + função), sem olhar nomes: 0 a 1. */
function similaridadeDeComposicao(a: { empresa: string; cargo: string }[], b: { empresa: string; cargo: string }[]): number {
  const conta = (l: { empresa: string; cargo: string }[]) => {
    const m = new Map<string, number>();
    for (const x of l) m.set(empFam(x), (m.get(empFam(x)) ?? 0) + 1);
    return m;
  };
  const ma = conta(a);
  const mb = conta(b);
  let comum = 0;
  for (const [k, n] of ma) comum += Math.min(n, mb.get(k) ?? 0);
  return comum / Math.max(1, Math.max(a.length, b.length));
}

/**
 * `divisao`: equipes de campo + posições (com a reserva "APOIO" para quem vem de outro contrato);
 * `pessoas`/`semPessoa`: a primeira aba (contrato -> equipe -> pessoa). Devolve a hierarquia contrato -> equipe -> pessoa.
 *
 * Regras (cada linha das abas 1, 2 e 3 vira exatamente uma posição, ou é absorvida por uma posição da outra aba):
 *  1. Equipe da aba 1 = cada célula mesclada de equipe (bloco). O mesmo nome em dois blocos são duas equipes.
 *  2. A mesma pessoa nas duas abas é ligada pelo nome (com evidência); a posição da aba 2 vale (é a divisão mais recente).
 *  3. Cada bloco da aba 1 casa com, no máximo, uma equipe da aba 2: pelas pessoas em comum e, na falta delas, pela composição + nome.
 *  4. Dentro de um par: quem tem nome só na aba 1 ocupa uma posição em branco da aba 2 (mesma empresa e função); posição em
 *     branco e vaga em contratação da aba 1 são absorvidas pelas equivalentes da aba 2; o que não encontra par entra como posição a mais.
 *  5. Bloco sem par na aba 2 vira equipe só do cadastro, com todas as linhas.
 */
export function cruzarCadastroComDivisao(
  divisao: { equipes: EquipeImportada[]; vagas: VagaImportada[] },
  pessoas: PessoaCadastro[],
  contratosDoCadastro: ContratoImportado[] = [],
  semPessoa: PosicaoCadastro[] = []
): ResultadoCruzamento {
  const equipes = divisao.equipes.map((e) => ({ ...e }));
  const pos: Pos[] = divisao.vagas.filter((v) => v.equipeCodigo !== CODIGO_FORA).map((v) => ({ v: { ...v }, orig: v.origem ? [v.origem] : [], conf: [] }));
  const apoio = divisao.vagas.filter((v) => v.equipeCodigo === CODIGO_FORA).map((v) => ({ ...v }));

  const pessoaNaPosicao = new Map<number, number>(); // pessoa -> posição
  const posicaoDaPessoa = new Map<number, number>(); // posição -> pessoa
  const forcaDaLigacao = new Map<number, number>(); // posição -> pontos (2+ = nome e sobrenome combinam; 1 = par fraco ou por posição)

  function vincular(iPos: number, iPes: number, pontos: number, nota?: string) {
    const slot = pos[iPos].v;
    const p = pessoas[iPes];
    slot.contrato = p.contrato;
    slot.equipeContrato = p.equipeContrato;
    slot.grupo = p.grupo;
    // o status do cadastro vale quando a equipe de campo ainda diz "Vigente" (ex.: afastado pelo INSS)
    if (slot.status === "Vigente" && p.status !== "Vigente") {
      slot.status = p.status;
      slot.observacao = [slot.observacao, p.observacao].filter(Boolean).join(" · ") || null;
    }
    // a origem guarda como a pessoa está escrita na aba 1 quando é diferente; só vira "conferir" quando a ligação é fraca
    const grafiaDiferente = !!slot.nome && norm(slot.nome) !== norm(p.nome) && !/mobiliz/i.test(slot.nome);
    pos[iPos].orig.push(`${origemAba1(p)}${grafiaDiferente ? `: ${p.nome}` : ""}`);
    if (!nota && pontos < 2 && grafiaDiferente) pos[iPos].conf.push(`Confirmar: "${slot.nome}" (aba 2) e "${p.nome}" (aba 1) só combinam pelo primeiro nome`);
    if (nota) pos[iPos].conf.push(nota);
    pessoaNaPosicao.set(iPes, iPos);
    posicaoDaPessoa.set(iPos, iPes);
    forcaDaLigacao.set(iPos, pontos);
  }

  // ---- 1) blocos (equipes) da primeira aba
  const blocos = new Map<number, Bloco>();
  const bloco = (id: number, contrato: string, nome: string | null, gestor: string | null) => {
    if (!blocos.has(id)) blocos.set(id, { id, contrato, nome, gestor, grupos: [], pessoas: [], brancos: [], contratacoes: [] });
    return blocos.get(id)!;
  };
  pessoas.forEach((p, i) => {
    const b = bloco(p.bloco ?? -(i + 1), p.contrato, p.equipeContrato, p.gestor);
    b.pessoas.push(i);
    b.grupos.push(p.grupo);
  });
  semPessoa.forEach((x, i) => {
    const b = bloco(x.bloco ?? -(1000 + i), x.contrato, x.equipeContrato, x.gestor);
    (x.tipo === "branco" ? b.brancos : b.contratacoes).push(x);
    b.grupos.push(x.grupo);
  });
  const idDoBloco = (p: PessoaCadastro, i: number) => p.bloco ?? -(i + 1);

  // ---- 2) pessoas com nome nas equipes de campo <-> primeira aba (pelo nome)
  const nomeadas = pos.map((x, idx) => ({ v: x.v, idx })).filter((x) => !!x.v.nome);
  const porNome = ligar(
    nomeadas.map((x) => ({ nome: x.v.nome!, cargo: x.v.cargo })),
    pessoas.map((p) => ({ nome: p.nome, cargo: p.cargo }))
  );
  for (const [a, { j, pontos }] of porNome) vincular(nomeadas[a].idx, j, pontos);

  // ---- 3) que bloco da aba 1 corresponde a que equipe da aba 2 (1 para 1)
  const peso = new Map<number, Map<string, number>>();
  const pesoForte = new Map<string, number>(); // `${bloco}>${cod}` -> ligações fortes
  for (const [iPes, iPos] of pessoaNaPosicao) {
    if (/mobiliz/i.test(pos[iPos].v.nome ?? "")) continue; // em mobilização: ainda é de outro contrato
    const k = idDoBloco(pessoas[iPes], iPes);
    const cod = pos[iPos].v.equipeCodigo;
    if (!peso.has(k)) peso.set(k, new Map());
    peso.get(k)!.set(cod, (peso.get(k)!.get(cod) ?? 0) + 1);
    if ((forcaDaLigacao.get(iPos) ?? 0) >= 2) pesoForte.set(`${k}>${cod}`, (pesoForte.get(`${k}>${cod}`) ?? 0) + 1);
  }
  const nomeDoTime = new Map(equipes.map((e) => [e.codigo, e.nome]));
  const candidatos: { k: number; cod: string; w: number; af: number }[] = [];
  for (const [k, m] of peso) for (const [cod, w] of m) candidatos.push({ k, cod, w, af: afinidadeDeEquipes(blocos.get(k)?.nome ?? "", nomeDoTime.get(cod) ?? "") });
  candidatos.sort((a, b) => b.w - a.w || b.af - a.af);
  const parDoBloco = new Map<number, { cod: string; w: number }>();
  const codigosUsados = new Set<string>();
  for (const c of candidatos) {
    if (parDoBloco.has(c.k) || codigosUsados.has(c.cod)) continue;
    parDoBloco.set(c.k, { cod: c.cod, w: c.w });
    codigosUsados.add(c.cod);
  }
  // sem pessoas em comum: composição parecida + nome de equipe parecido
  const linhasDoBloco = (b: Bloco) => [...b.pessoas.map((i) => pessoas[i]), ...b.brancos, ...b.contratacoes];
  const composto: { k: number; cod: string; sim: number; af: number }[] = [];
  for (const b of blocos.values()) {
    if (parDoBloco.has(b.id)) continue;
    for (const e of equipes) {
      if (e.codigo === CODIGO_FORA || codigosUsados.has(e.codigo)) continue;
      const doTime = pos.filter((x) => x.v.equipeCodigo === e.codigo).map((x) => x.v);
      const sim = similaridadeDeComposicao(linhasDoBloco(b), doTime);
      const af = afinidadeDeEquipes(b.nome ?? "", e.nome);
      if (sim >= 0.5 && af >= 2) composto.push({ k: b.id, cod: e.codigo, sim, af });
    }
  }
  composto.sort((a, b) => b.af - a.af || b.sim - a.sim);
  for (const c of composto) {
    if (parDoBloco.has(c.k) || codigosUsados.has(c.cod)) continue;
    parDoBloco.set(c.k, { cod: c.cod, w: 0 });
    codigosUsados.add(c.cod);
  }

  // ---- 4) dentro de cada par: posição a posição
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
  const substituidas: ResultadoCruzamento["substituidas"] = [];
  const novaPosicao = (cod: string, base: Partial<VagaImportada> & { empresa: string; cargo: string; atividade: string; status: string }, origem: string, conf: string): number => {
    pos.push({
      v: { numero: null, equipeCodigo: cod, nome: null, observacao: null, ausencia: null, ...base },
      orig: [origem],
      conf: [conf],
    });
    return pos.length - 1;
  };
  for (const [k, { cod }] of parDoBloco) {
    const b = blocos.get(k)!;
    const doTime = () => pos.map((x, i) => ({ x, i })).filter((y) => y.x.v.equipeCodigo === cod);
    const consumida = new Set<number>(); // posições em branco / vagas já absorvidas por linhas da aba 1
    for (const [iPos] of posicaoDaPessoa) consumida.add(iPos);

    // 4a) uma única posição nomeada e uma única pessoa do cadastro com o mesmo papel: é a mesma pessoa, com o nome grafado diferente
    const livresPes = () => b.pessoas.filter((i) => !pessoaNaPosicao.has(i));
    const gSlots = porPapel(doTime().filter((y) => !!y.x.v.nome && !posicaoDaPessoa.has(y.i)), (y) => papel(y.x.v));
    const gPessoas = porPapel(livresPes().map((i) => ({ p: pessoas[i], i })), (y) => papel(y.p));
    for (const [pp, ss] of gSlots) {
      const ps = gPessoas.get(pp) ?? [];
      if (ss.length === 1 && ps.length === 1 && norm(ss[0].x.v.empresa).includes("consominas")) {
        vincular(ss[0].i, ps[0].i, 1, `Confirmar: ${ps[0].p.nome} (aba 1) e ${ss[0].x.v.nome} (aba 2) parecem ser a mesma pessoa`);
        consumida.add(ss[0].i);
        encaixadas++;
      }
    }

    // 4b) quem tem nome só na aba 1 ocupa uma posição em branco da aba 2: primeiro com a mesma atividade, depois sem olhar a atividade
    const brancosLivres = () => doTime().filter((y) => !y.x.v.nome && y.x.v.semNome && !consumida.has(y.i));
    for (const modo of ["papel", "empresaFuncao"] as const) {
      for (const ip of livresPes().sort((x, y) => (pessoas[x].ordem ?? 0) - (pessoas[y].ordem ?? 0))) {
        const p = pessoas[ip];
        const slot = brancosLivres().find((y) => (modo === "papel" ? papel(y.x.v) === papel(p) : empFam(y.x.v) === empFam(p)));
        if (!slot) continue;
        pos[slot.i].v.nome = p.nome;
        pos[slot.i].v.semNome = false;
        vincular(slot.i, ip, 1, modo === "papel" ? undefined : `Confirmar: a aba 1 diz "${p.atividade}"; a posição na aba 2 é "${pos[slot.i].v.atividade}"`);
        consumida.add(slot.i);
        encaixadas++;
      }
    }
    // o que sobrou com nome entra como posição a mais da mesma equipe
    for (const ip of livresPes()) {
      const p = pessoas[ip];
      const i = novaPosicao(
        cod,
        { atividade: p.atividade, empresa: p.empresa, cargo: p.cargo, nome: p.nome, status: p.status, observacao: p.observacao, contrato: p.contrato, equipeContrato: p.equipeContrato, grupo: p.grupo, semNome: false },
        origemAba1(p),
        "Só na aba 1: esta pessoa não aparece na divisão de equipes (aba 2). Confirmar se está nesta equipe"
      );
      pessoaNaPosicao.set(ip, i);
      posicaoDaPessoa.set(i, ip);
      forcaDaLigacao.set(i, 1);
      extras++;
    }

    // 4c) posição em branco da aba 1 = pessoa sem nome informado: casa com uma posição em branco equivalente da aba 2
    for (const br of [...b.brancos].sort((x, y) => x.ordem - y.ordem)) {
      const slot = brancosLivres().find((y) => empFam(y.x.v) === empFam(br));
      if (slot) {
        pos[slot.i].orig.push(origemAba1(br));
        consumida.add(slot.i);
        encaixadas++;
        continue;
      }
      novaPosicao(cod, { atividade: br.atividade, empresa: br.empresa, cargo: br.cargo, status: br.status, contrato: br.contrato, equipeContrato: br.equipeContrato, grupo: br.grupo, semNome: true }, origemAba1(br), "Só na aba 1: posição preenchida sem nome que a divisão de equipes (aba 2) não tem");
      extras++;
    }
    // 4d) vaga em contratação da aba 1 casa com uma vaga aberta (Vago) equivalente da aba 2
    for (const ct of [...b.contratacoes].sort((x, y) => x.ordem - y.ordem)) {
      const slot = doTime().find((y) => !y.x.v.nome && !y.x.v.semNome && !consumida.has(y.i) && empFam(y.x.v) === empFam(ct));
      if (slot) {
        pos[slot.i].orig.push(origemAba1(ct));
        pos[slot.i].v.status = "Em contratação";
        consumida.add(slot.i);
        encaixadas++;
        continue;
      }
      // as vagas abertas da equipe vêm da aba 2 (a divisão mais recente): a da aba 1 sem equivalente fica de fora, listada na conferência
      substituidas.push({ origem: origemAba1(ct), descricao: `Vaga em contratação: ${ct.cargo} (${ct.empresa}, ${ct.atividade})`, equipe: nomeDoTime.get(cod) ?? cod });
    }
  }

  // ---- 5) apoio de outro contrato: se a pessoa já está numa equipe de campo, a posição dela ganha a data de liberação
  const idxNomeados = pos.map((x, i) => ({ x, i })).filter((y) => !!y.x.v.nome);
  const ligApoio = ligar(
    apoio.map((a) => ({ nome: a.nome ?? "", cargo: a.cargo })),
    idxNomeados.map((y) => ({ nome: y.x.v.nome!, cargo: y.x.v.cargo }))
  );
  const apoioQueFicou: VagaImportada[] = [];
  let apoioJaNaEquipe = 0;
  apoio.forEach((a, k) => {
    const alvo = ligApoio.get(k);
    const slot = alvo ? pos[idxNomeados[alvo.j].i] : null;
    // só junta quando o nome bate inteiro (primeiro nome + sobrenome)
    if (slot && alvo && alvo.pontos >= 3) {
      slot.v.contratoAtual = a.contratoAtual ?? null;
      slot.v.disponivelAPartir = a.disponivelAPartir ?? null;
      slot.v.destino = a.destino ?? null;
      slot.v.observacao = [slot.v.observacao, a.observacao].filter(Boolean).join(" · ") || null;
      if (a.origem) slot.orig.push(a.origem);
      apoioJaNaEquipe++;
    } else {
      apoioQueFicou.push({ ...a, contrato: null });
    }
  });

  // ---- 6) blocos sem par: equipes que só existem no cadastro, com TODAS as linhas
  const maiorCodigo = equipes.reduce((m, e) => Math.max(m, Number(/^EQ-(\d+)$/.exec(e.codigo)?.[1] ?? 0)), 0);
  const novas: EquipeImportada[] = [];
  const posicoesNovas: { v: VagaImportada; orig: string[]; conf: string[]; ordem: number }[] = [];
  const nomesUsados = new Map<string, number>(); // contrato|nome -> quantas equipes já têm esse nome
  for (const e of equipes) nomesUsados.set(`${e.projeto}|${norm(e.nome)}`, 1);
  const primeiraOrdem = (b: Bloco) => Math.min(...linhasDoBloco(b).map((l) => l.ordem ?? 0));
  for (const b of [...blocos.values()].sort((x, y) => primeiraOrdem(x) - primeiraOrdem(y))) {
    if (parDoBloco.has(b.id)) continue;
    const linhas = [...b.pessoas.filter((i) => !pessoaNaPosicao.has(i)).map((i) => pessoas[i]), ...b.brancos, ...b.contratacoes];
    if (linhas.length === 0) continue;
    const nomeBase = b.nome ?? "(sem nome na planilha)";
    const chaveNome = `${b.contrato}|${norm(nomeBase)}`;
    const repetida = (nomesUsados.get(chaveNome) ?? 0) + 1;
    nomesUsados.set(chaveNome, repetida);
    const eq: EquipeImportada = {
      codigo: `EQ-${String(maiorCodigo + novas.length + 1).padStart(2, "0")}`,
      projeto: b.contrato,
      contratoConfirmado: true,
      gestor: b.gestor,
      grupo: b.grupos.every((g) => g === "Flora") ? "Flora" : "Fauna",
      nome: repetida > 1 ? `${nomeBase} (${repetida})` : nomeBase,
      status: "Ativa",
    };
    novas.push(eq);
    const aviso = repetida > 1 ? `O nome "${nomeBase}" se repete na aba 1 neste contrato: tratado como outra equipe (confirmar o nome certo)` : "";
    for (const ip of b.pessoas) {
      if (pessoaNaPosicao.has(ip)) continue; // já está numa equipe da aba 2 (ex.: em mobilização para outra equipe)
      const p = pessoas[ip];
      posicoesNovas.push({
        v: { numero: null, equipeCodigo: eq.codigo, atividade: p.atividade, empresa: p.empresa, cargo: p.cargo, nome: p.nome, status: p.status, observacao: p.observacao, ausencia: null, contrato: p.contrato, equipeContrato: p.equipeContrato, grupo: p.grupo, semNome: false },
        orig: [origemAba1(p)],
        conf: aviso ? [aviso] : [],
        ordem: p.ordem ?? 0,
      });
    }
    for (const x of [...b.brancos, ...b.contratacoes]) {
      posicoesNovas.push({
        v: { numero: null, equipeCodigo: eq.codigo, atividade: x.atividade, empresa: x.empresa, cargo: x.cargo, nome: null, status: x.status, observacao: null, ausencia: null, contrato: x.contrato, equipeContrato: x.equipeContrato, grupo: x.grupo, semNome: x.tipo === "branco" },
        orig: [origemAba1(x)],
        conf: aviso ? [aviso] : [],
        ordem: x.ordem,
      });
    }
  }
  posicoesNovas.sort((a, b) => a.v.equipeCodigo.localeCompare(b.v.equipeCodigo) || a.ordem - b.ordem);

  // ---- 7) contrato de cada equipe de campo: o do bloco correspondente na primeira aba; depois pelo nome; depois o informado
  let comContrato = 0;
  const contratosInformados = new Set<string>();
  const blocoDaEquipe = new Map<string, Bloco>();
  for (const [k, { cod }] of parDoBloco) blocoDaEquipe.set(cod, blocos.get(k)!);
  for (const e of equipes) {
    if (e.codigo === CODIGO_FORA) continue;
    let contrato: string | null = null;
    const par = blocoDaEquipe.get(e.codigo);
    if (par) contrato = par.contrato;
    if (!contrato) {
      // quem está "em mobilização" ainda é de outro contrato e par fraco (só o 1º nome) sozinho não prova nada
      const fortes = new Set<string>();
      pos.forEach((x, i) => {
        if (x.v.equipeCodigo === e.codigo && x.v.contrato && !/mobiliz/i.test(x.v.nome ?? "") && (forcaDaLigacao.get(i) ?? 0) >= 2) fortes.add(x.v.contrato);
      });
      if (fortes.size === 1) contrato = [...fortes][0];
    }
    if (!contrato) {
      const ranking = [...blocos.values()]
        .filter((b) => (e.grupo === "Flora" ? b.grupos.some((g) => g === "Flora") : b.grupos.some((g) => g !== "Flora")))
        .map((b) => ({ b, af: afinidadeDeEquipes(b.nome ?? "", e.nome) }))
        .filter((x) => x.af >= 2)
        .sort((a, b) => b.af - a.af);
      const melhores = ranking.filter((x) => x.af === ranking[0]?.af);
      const contratos = new Set(melhores.map((x) => x.b.contrato));
      if (contratos.size === 1) contrato = [...contratos][0];
    }
    if (!contrato) {
      contrato = CONTRATO_INFORMADO[norm(e.nome).trim()] ?? null;
      if (contrato) contratosInformados.add(contrato);
    }
    e.projeto = contrato ?? PROJETO_A_DEFINIR;
    if (contrato) {
      comContrato++;
      e.gestor = pessoas.find((p) => p.contrato === contrato && p.gestor)?.gestor ?? e.gestor;
      // quem está na equipe trabalha no contrato dela (a pessoa que já tem outro contrato mantém o seu)
      for (const x of pos) if (x.v.equipeCodigo === e.codigo && !x.v.contrato) x.v.contrato = contrato;
    }
  }

  // ---- 8) contratos: os da primeira aba e os informados
  const contratos = new Map<string, ContratoImportado>(contratosDoCadastro.map((c) => [c.codigo, { ...c }]));
  for (const codigo of contratosInformados) if (!contratos.has(codigo)) contratos.set(codigo, { codigo, gestor: null, cliente: null });
  for (const p of pessoas) {
    const c = contratos.get(p.contrato) ?? { codigo: p.contrato, gestor: null, cliente: null };
    if (!c.gestor && p.gestor) c.gestor = p.gestor;
    contratos.set(p.contrato, c);
  }

  const finais = (l: { v: VagaImportada; orig: string[]; conf: string[] }[]): VagaImportada[] =>
    l.map((x) => ({ ...x.v, origem: x.orig.join(" + ") || null, conferir: [...new Set(x.conf)].join(" · ") || null }));
  const todas: VagaImportada[] = [...finais(pos), ...finais(posicoesNovas), ...apoioQueFicou.map((a) => ({ ...a, conferir: null }))].map((v, i) => ({ ...v, numero: i + 1 }));
  const equipesFinais = [...equipes.filter((e) => e.codigo !== CODIGO_FORA), ...novas, ...equipes.filter((e) => e.codigo === CODIGO_FORA)];
  return {
    equipes: equipesFinais,
    vagas: todas,
    contratos: [...contratos.values()],
    resumo: { ligadas: porNome.size, encaixadas, extrasNaEquipe: extras, equipesDoCadastro: novas.length, apoioJaNaEquipe, equipesComContrato: comContrato },
    substituidas,
  };
}
