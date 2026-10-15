"use client";

// Carrega uma vez os dados do sistema (poucas centenas de linhas) e entrega para todas as telas,
// já com a regra de disponibilidade pronta para calcular qualquer data no próprio navegador.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { indexar, type Dia, type DadosEfetivos, type Indice } from "@/lib/efetivos/disponibilidade";
import { contar, resumirDia, situacaoDaPosicao, type Contagem, type ResumoDoDia, type SituacaoDaPosicao } from "@/lib/efetivos/situacao";
import { localizacaoNoDia, type MovimentoBase } from "@/lib/efetivos/veiculos";
import { chamar, ehReserva, hojeBr, type DadosTela, type Equipe, type MovimentoEquipe, type Vaga, type Veiculo } from "./comum";

type Ctx = {
  dados: DadosTela;
  regra: DadosEfetivos;
  idx: Indice;
  hoje: string;
  recarregar: () => Promise<void>;
  ocultarNomes: boolean;
  setOcultarNomes: (v: boolean) => void;
  /** As equipes de campo (sem a reserva de apoio). */
  equipesCampo: Equipe[];
  equipePorId: Map<string, Equipe>;
  vagaPorId: Map<string, Vaga>;
  veiculoPorId: Map<string, Veiculo>;
  vagasPorEquipe: Map<string, Vaga[]>;
  /** Viaturas de cada equipe: as em que as pessoas da equipe vão (planilha) mais as que passaram para ela. A mesma viatura pode estar em várias equipes. */
  veiculosPorEquipe: Map<string, Veiculo[]>;
  /** As equipes que usam cada viatura (ids). Uma viatura é uma só, mesmo usada por várias equipes. */
  equipesPorVeiculo: Map<string, string[]>;
  /** Pessoas que vao em cada viatura. */
  ocupantesPorVeiculo: Map<string, Vaga[]>;
  /** Nome para exibir: no modo apresentação mostra o cargo no lugar do nome. */
  nomeDe: (v: Pick<Vaga, "nome" | "cargo">) => string;
  // ---- a regra única de situação (Em equipe / Disponível / Ausente...): todas as telas contam por aqui
  /** Onde a posição está no dia (hoje, se não informado). */
  situacaoDe: (v: Vaga, dia?: Dia) => SituacaoDaPosicao;
  /** Contagem das posições de uma equipe (ou de uma lista de equipes) no dia. */
  contagemDe: (equipeIds: string[], dia?: Dia) => Contagem;
  /** Os números do painel no dia. */
  resumoDoDia: (dia?: Dia) => ResumoDoDia;
  /** Passagens de cada equipe por contrato/frente (movimentações). */
  movimentosPorEquipe: Map<string, MovimentoEquipe[]>;
  /** Contrato em que a equipe está no dia: o da passagem que cobre o dia, ou o cadastrado. */
  contratoNoDia: (e: Equipe, dia?: Dia) => string;
};

const Contexto = createContext<Ctx | null>(null);

type Shell = { ocultarNomes: boolean; setOcultarNomes: (v: boolean) => void; nivel: DadosTela["nivel"] | null; podeEditar: boolean; carregado: boolean };
const ContextoShell = createContext<Shell | null>(null);
const ContextoErro = createContext<{ erro: { status: number; texto: string } | null; tentar: () => void }>({ erro: null, tentar: () => {} });

export function useDados(): Ctx {
  const c = useContext(Contexto);
  if (!c) throw new Error("useDados fora do DadosGate");
  return c;
}

/** Estado que o menu lateral precisa antes mesmo dos dados chegarem. */
export function useShell(): Shell {
  const c = useContext(ContextoShell);
  if (!c) throw new Error("useShell fora do DadosProvider");
  return c;
}

export function DadosProvider({ children }: { children: ReactNode }) {
  const [dados, setDados] = useState<DadosTela | null>(null);
  const [erro, setErro] = useState<{ status: number; texto: string } | null>(null);
  const [ocultarNomes, setOcultarNomes] = useState(false);
  const [hoje, setHoje] = useState(hojeBr());

  const recarregar = useCallback(async () => {
    const r = await chamar<DadosTela>("GET", "/api/efetivos/dados");
    if (!r.ok) {
      setErro({ status: r.status, texto: r.dados.error ?? "Não foi possível carregar os dados" });
      return;
    }
    setErro(null);
    setDados(r.dados as DadosTela);
    setHoje(hojeBr());
  }, []);

  useEffect(() => {
    recarregar();
    // ao voltar para a aba, atualiza (o Samuel e o João podem estar editando ao mesmo tempo)
    const h = () => document.visibilityState === "visible" && recarregar();
    document.addEventListener("visibilitychange", h);
    return () => document.removeEventListener("visibilitychange", h);
  }, [recarregar]);

  const pronto = useMemo(() => {
    if (!dados) return null;
    const regra: DadosEfetivos = {
      equipes: dados.equipes,
      vagas: dados.vagas,
      ausencias: dados.ausencias,
      alocacoes: [], // campanhas deixaram de existir na tela: a pessoa está em equipe, não em campanha
    };
    const vagasPorEquipe = new Map<string, Vaga[]>();
    for (const v of dados.vagas) {
      if (!vagasPorEquipe.has(v.equipeId)) vagasPorEquipe.set(v.equipeId, []);
      vagasPorEquipe.get(v.equipeId)!.push(v);
    }
    const ocupantesPorVeiculo = new Map<string, Vaga[]>();
    for (const v of dados.vagas) {
      if (!v.veiculoId) continue;
      if (!ocupantesPorVeiculo.has(v.veiculoId)) ocupantesPorVeiculo.set(v.veiculoId, []);
      ocupantesPorVeiculo.get(v.veiculoId)!.push(v);
    }
    const movsPorVeiculo = new Map<string, MovimentoBase[]>();
    for (const m of dados.movimentos) {
      if (!movsPorVeiculo.has(m.veiculoId)) movsPorVeiculo.set(m.veiculoId, []);
      movsPorVeiculo.get(m.veiculoId)!.push(m);
    }
    // a viatura de cada equipe: onde as pessoas da equipe vão (a planilha) + a última passagem registrada. Uma viatura = um registro só.
    const equipesPorVeiculo = new Map<string, string[]>();
    const noVeiculo = (veiculoId: string, equipeId: string) => {
      const l = equipesPorVeiculo.get(veiculoId) ?? [];
      if (!l.includes(equipeId)) l.push(equipeId);
      equipesPorVeiculo.set(veiculoId, l);
    };
    for (const v of dados.vagas) if (v.veiculoId) noVeiculo(v.veiculoId, v.equipeId);
    for (const ve of dados.veiculos) {
      const loc = localizacaoNoDia(movsPorVeiculo.get(ve.id) ?? [], hoje);
      if (loc?.equipeId) noVeiculo(ve.id, loc.equipeId);
    }
    const ordemEquipe = new Map(dados.equipes.map((e, i) => [e.id, i]));
    for (const l of equipesPorVeiculo.values()) l.sort((a, b) => (ordemEquipe.get(a) ?? 0) - (ordemEquipe.get(b) ?? 0));
    const veiculosPorEquipe = new Map<string, Veiculo[]>();
    for (const ve of dados.veiculos) {
      for (const eid of equipesPorVeiculo.get(ve.id) ?? []) {
        if (!veiculosPorEquipe.has(eid)) veiculosPorEquipe.set(eid, []);
        veiculosPorEquipe.get(eid)!.push(ve);
      }
    }
    for (const l of veiculosPorEquipe.values()) l.sort((a, b) => a.identificacao.localeCompare(b.identificacao, "pt-BR", { numeric: true }));
    const movimentosPorEquipe = new Map<string, MovimentoEquipe[]>();
    for (const m of dados.movimentosEquipe ?? []) {
      if (!movimentosPorEquipe.has(m.equipeId)) movimentosPorEquipe.set(m.equipeId, []);
      movimentosPorEquipe.get(m.equipeId)!.push(m);
    }
    for (const l of movimentosPorEquipe.values()) l.sort((a, b) => a.inicio.localeCompare(b.inicio));
    return {
      movimentosPorEquipe,
      regra,
      idx: indexar(regra),
      veiculosPorEquipe,
      equipesPorVeiculo,
      ocupantesPorVeiculo,
      equipesCampo: dados.equipes.filter((e) => !ehReserva(e)),
      equipePorId: new Map(dados.equipes.map((e) => [e.id, e])),
      vagaPorId: new Map(dados.vagas.map((v) => [v.id, v])),
      veiculoPorId: new Map(dados.veiculos.map((v) => [v.id, v])),
      vagasPorEquipe,
    };
  }, [dados, hoje]);

  const hojeDia = hoje;
  const shell: Shell = { ocultarNomes, setOcultarNomes, nivel: dados?.nivel ?? null, podeEditar: dados?.podeEditar ?? false, carregado: !!dados };
  const valor: Ctx | null =
    dados && pronto
      ? {
          dados,
          ...pronto,
          hoje,
          recarregar,
          ocultarNomes,
          setOcultarNomes,
          nomeDe: (v) => (ocultarNomes ? v.cargo : v.nome ?? "—"),
          situacaoDe: (v, dia = hojeDia) => situacaoDaPosicao(v, pronto.equipePorId.get(v.equipeId), pronto.idx, dia),
          contagemDe: (ids, dia = hojeDia) => contar(ids.flatMap((id) => pronto.vagasPorEquipe.get(id) ?? []), pronto.equipePorId, pronto.idx, dia),
          resumoDoDia: (dia = hojeDia) => resumirDia({ equipes: dados.equipes, vagas: dados.vagas }, pronto.idx, dia),
          contratoNoDia: (e, dia = hojeDia) => {
            const m = (pronto.movimentosPorEquipe.get(e.id) ?? []).find((x) => x.inicio <= dia && (!x.fim || dia <= x.fim));
            return m ? m.projeto : e.projeto;
          },
        }
      : null;

  return (
    <ContextoShell.Provider value={shell}>
      <ContextoErro.Provider value={{ erro, tentar: recarregar }}>
        <Contexto.Provider value={valor}>{children}</Contexto.Provider>
      </ContextoErro.Provider>
    </ContextoShell.Provider>
  );
}

function ErroDados({ erro, tentar }: { erro: { status: number; texto: string }; tentar: () => void }) {
  return (
    <div className="mx-auto mt-24 max-w-md rounded-2xl border border-bad/25 bg-bad-soft p-6 text-sm text-bad">
      <div className="font-display text-base font-semibold">Não foi possível abrir os dados</div>
      <p className="mt-1">{erro.status === 403 ? "Seu usuário não tem acesso a esta área. Fale com o administrador." : erro.texto}</p>
      <button onClick={tentar} className="btn-ghost mt-3">
        Tentar de novo
      </button>
    </div>
  );
}

/** Só mostra a página quando os dados já chegaram (as telas assumem dados prontos). */
export function DadosGate({ children }: { children: ReactNode }) {
  const c = useContext(Contexto);
  const { erro, tentar } = useContext(ContextoErro);
  if (erro) return <ErroDados erro={erro} tentar={tentar} />;
  if (!c) {
    return (
      <div className="flex h-[60vh] items-center justify-center text-sm text-gray-500" role="status">
        Carregando as equipes…
      </div>
    );
  }
  return <>{children}</>;
}
