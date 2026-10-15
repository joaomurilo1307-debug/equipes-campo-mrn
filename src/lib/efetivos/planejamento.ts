// Atualizar o PLANEJAMENTO a partir da base em Excel preenchida: as colunas que as planilhas do Samuel não trazem (início e fim das
// equipes, previsão de entrada, contrato atual/disponível a partir de/destino, placa e modelo das viaturas, períodos de ausência).
// Regras: só preenche; uma célula em branco NUNCA apaga o que já está no sistema; nada do que veio das planilhas (nomes, cargos,
// empresas, status) é tocado. Puro: recebe o que foi lido e o que o sistema tem, devolve o que mudaria.
import { normalizar, type ResultadoImportacao } from "./importarPlanilha";
import type { Dia } from "./disponibilidade";

export type AtuaisEquipe = { id: string; codigo: string; nome: string; projeto: string; inicio: Dia | null; fim: Dia | null; local: string | null; gestor: string | null; observacao: string | null };
export type AtuaisVaga = { id: string; equipeId: string; numero: number | null; origem: string | null; nome: string | null; cargo: string; previsaoInicio: Dia | null; contratoAtual: string | null; disponivelAPartir: Dia | null; destino: string | null; observacao: string | null };
export type AtuaisVeiculo = { id: string; identificacao: string; placa: string | null; modelo: string | null; tracao4x4: boolean | null; status: string; observacao: string | null };
export type AtuaisContrato = { codigo: string; nome: string | null; cliente: string | null; gestor: string | null; local: string | null; observacao: string | null };
export type AtuaisAusencia = { vagaId: string; tipo: string; inicio: Dia; fim: Dia };

export type Atuais = { equipes: AtuaisEquipe[]; vagas: AtuaisVaga[]; veiculos: AtuaisVeiculo[]; contratos: AtuaisContrato[]; ausencias: AtuaisAusencia[] };

export type PlanoAtualizacao = {
  equipes: { id: string; rotulo: string; mudancas: Partial<Pick<AtuaisEquipe, "inicio" | "fim" | "local" | "gestor" | "observacao">> }[];
  vagas: { id: string; rotulo: string; mudancas: Partial<Pick<AtuaisVaga, "previsaoInicio" | "contratoAtual" | "disponivelAPartir" | "destino" | "observacao">> }[];
  veiculos: { id: string; rotulo: string; mudancas: Partial<Pick<AtuaisVeiculo, "placa" | "modelo" | "tracao4x4" | "status" | "observacao">> }[];
  contratos: { codigo: string; mudancas: Partial<Pick<AtuaisContrato, "nome" | "cliente" | "gestor" | "local" | "observacao">> }[];
  ausencias: { vagaId: string; rotulo: string; tipo: string; inicio: Dia; fim: Dia }[];
  /** linhas do Excel que não acharam par no sistema, e datas recusadas */
  avisos: string[];
};

export const totalDeMudancas = (p: PlanoAtualizacao) => p.equipes.length + p.vagas.length + p.veiculos.length + p.contratos.length + p.ausencias.length;

const STATUS_VEICULO_OK = ["Em operação", "Disponível", "Em manutenção", "Parado", "Devolvido"];

/** Só entra o que a célula traz e que difere do que já está. */
function diferencas<T extends Record<string, unknown>>(novo: Partial<T>, atual: T): Partial<T> {
  const out: Partial<T> = {};
  for (const k of Object.keys(novo) as (keyof T)[]) {
    const v = novo[k];
    if (v === undefined || v === null || v === "") continue;
    if (atual[k] !== v) out[k] = v as T[keyof T];
  }
  return out;
}

export function planejarAtualizacao(lido: ResultadoImportacao, atual: Atuais): PlanoAtualizacao {
  const plano: PlanoAtualizacao = { equipes: [], vagas: [], veiculos: [], contratos: [], ausencias: [], avisos: [] };

  // ---- equipes: pelo nome (o código do Excel pode não ser o do sistema)
  const equipePorNome = new Map<string, AtuaisEquipe[]>();
  for (const e of atual.equipes) equipePorNome.set(normalizar(e.nome), [...(equipePorNome.get(normalizar(e.nome)) ?? []), e]);
  const equipeDoArquivo = new Map<string, AtuaisEquipe>(); // código no Excel -> equipe do sistema
  for (const e of lido.equipes) {
    if (e.codigo === "APOIO") continue;
    const achadas = equipePorNome.get(normalizar(e.nome)) ?? [];
    if (achadas.length !== 1) {
      plano.avisos.push(achadas.length === 0 ? `Equipe «${e.nome}» do Excel não existe no sistema: ignorada (use Nova equipe se for uma equipe nova).` : `Equipe «${e.nome}» aparece ${achadas.length} vezes no sistema: ignorada para não errar de equipe.`);
      continue;
    }
    const s = achadas[0];
    equipeDoArquivo.set(e.codigo, s);
    const m = diferencas({ inicio: e.inicio ?? null, fim: e.fim ?? null, local: e.local ?? null, gestor: e.gestor, observacao: e.observacao ?? null }, { inicio: s.inicio, fim: s.fim, local: s.local, gestor: s.gestor, observacao: s.observacao } as Record<string, unknown>) as PlanoAtualizacao["equipes"][number]["mudancas"];
    const inicio = (m.inicio ?? s.inicio) as Dia | null;
    const fim = (m.fim ?? s.fim) as Dia | null;
    if (inicio && fim && fim < inicio) {
      plano.avisos.push(`Equipe «${e.nome}»: o fim (${fim}) é antes do início (${inicio}); as datas não foram aplicadas.`);
      delete m.inicio;
      delete m.fim;
    }
    if (Object.keys(m).length) plano.equipes.push({ id: s.id, rotulo: e.nome, mudancas: m });
  }

  // ---- posições: pela origem (planilha e linha); sem origem, pela equipe + Nº + cargo
  const vagaPorOrigem = new Map<string, AtuaisVaga>();
  for (const v of atual.vagas) if (v.origem) vagaPorOrigem.set(v.origem, v);
  const vagaPorNumero = new Map<string, AtuaisVaga>();
  for (const v of atual.vagas) if (v.numero != null) vagaPorNumero.set(`${v.equipeId}|${v.numero}|${normalizar(v.cargo)}`, v);
  const vagaDeAusencia = new Map<string, AtuaisVaga>();
  for (const v of lido.vagas) {
    if (v.equipeCodigo === "APOIO") continue;
    const s = (v.origem ? vagaPorOrigem.get(v.origem) : undefined) ?? (() => {
      const eq = equipeDoArquivo.get(v.equipeCodigo);
      return eq && v.numero != null ? vagaPorNumero.get(`${eq.id}|${v.numero}|${normalizar(v.cargo)}`) : undefined;
    })();
    const rotulo = `${v.nome ?? v.cargo} (${v.origem ?? `Nº ${v.numero}`})`;
    const traz = v.previsaoInicio || v.contratoAtual || v.disponivelAPartir || v.destino || (v.ausencias?.length ?? 0) > 0;
    if (!s) {
      if (traz) plano.avisos.push(`Posição «${rotulo}» do Excel não foi encontrada no sistema: o que foi preenchido nela foi ignorado.`);
      continue;
    }
    const m = diferencas({ previsaoInicio: v.previsaoInicio ?? null, contratoAtual: v.contratoAtual ?? null, disponivelAPartir: v.disponivelAPartir ?? null, destino: v.destino ?? null, observacao: v.observacao }, { previsaoInicio: s.previsaoInicio, contratoAtual: s.contratoAtual, disponivelAPartir: s.disponivelAPartir, destino: s.destino, observacao: s.observacao } as Record<string, unknown>) as PlanoAtualizacao["vagas"][number]["mudancas"];
    if (Object.keys(m).length) plano.vagas.push({ id: s.id, rotulo, mudancas: m });
    if (v.ausencias?.length) vagaDeAusencia.set(v.origem ?? rotulo, s);
    for (const a of v.ausencias ?? []) {
      const ja = atual.ausencias.some((x) => x.vagaId === s.id && x.tipo === a.tipo && x.inicio === a.inicio && x.fim === a.fim) || plano.ausencias.some((x) => x.vagaId === s.id && x.tipo === a.tipo && x.inicio === a.inicio && x.fim === a.fim);
      if (!ja) plano.ausencias.push({ vagaId: s.id, rotulo, tipo: a.tipo, inicio: a.inicio, fim: a.fim });
    }
  }

  // ---- viaturas: pela identificação
  const veiculoPorId = new Map(atual.veiculos.map((x) => [normalizar(x.identificacao), x]));
  const vistos = new Set<string>();
  for (const u of lido.veiculos) {
    const chave = normalizar(u.identificacao);
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    const s = veiculoPorId.get(chave);
    if (!s) {
      if (u.placa || u.modelo) plano.avisos.push(`Viatura «${u.identificacao}» do Excel não existe no sistema: ignorada.`);
      continue;
    }
    const status = u.status && STATUS_VEICULO_OK.includes(u.status) ? u.status : null;
    if (u.status && !status) plano.avisos.push(`Viatura «${u.identificacao}»: status «${u.status}» não é um dos status do sistema (${STATUS_VEICULO_OK.join(", ")}); ignorado.`);
    const m = diferencas({ placa: u.placa ?? null, modelo: u.modelo ?? null, tracao4x4: u.tracao4x4 ?? null, status, observacao: u.observacao ?? null }, { placa: s.placa, modelo: s.modelo, tracao4x4: s.tracao4x4, status: s.status, observacao: s.observacao } as Record<string, unknown>) as PlanoAtualizacao["veiculos"][number]["mudancas"];
    if (Object.keys(m).length) plano.veiculos.push({ id: s.id, rotulo: u.identificacao, mudancas: m });
  }

  // ---- contratos: pelo código
  const contratoPorCodigo = new Map(atual.contratos.map((c) => [c.codigo, c]));
  for (const c of lido.contratos) {
    const s = contratoPorCodigo.get(c.codigo);
    if (!s) continue;
    const m = diferencas({ nome: c.nome ?? null, cliente: c.cliente, gestor: c.gestor, local: c.local ?? null, observacao: c.observacao ?? null }, { nome: s.nome, cliente: s.cliente, gestor: s.gestor, local: s.local, observacao: s.observacao } as Record<string, unknown>) as PlanoAtualizacao["contratos"][number]["mudancas"];
    if (Object.keys(m).length) plano.contratos.push({ codigo: c.codigo, mudancas: m });
  }
  return plano;
}
