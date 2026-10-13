"use client";

// Carrega uma vez os dados do sistema (poucas centenas de linhas) e entrega para todas as telas,
// já com a regra de disponibilidade pronta para calcular qualquer data no próprio navegador.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { alocacoesQueSeguram, indexar, type DadosEfetivos, type Indice } from "@/lib/efetivos/disponibilidade";
import { chamar, hojeBr, type Campanha, type DadosTela, type Equipe, type Vaga, type Veiculo } from "./comum";

type Ctx = {
  dados: DadosTela;
  regra: DadosEfetivos;
  idx: Indice;
  hoje: string;
  recarregar: () => Promise<void>;
  ocultarNomes: boolean;
  setOcultarNomes: (v: boolean) => void;
  equipePorId: Map<string, Equipe>;
  vagaPorId: Map<string, Vaga>;
  campanhaPorId: Map<string, Campanha>;
  veiculoPorId: Map<string, Veiculo>;
  vagasPorEquipe: Map<string, Vaga[]>;
  /** Nome para exibir: no modo apresentação mostra o cargo no lugar do nome. */
  nomeDe: (v: Pick<Vaga, "nome" | "cargo">) => string;
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
      alocacoes: alocacoesQueSeguram(dados.alocacoes, dados.campanhas),
    };
    const vagasPorEquipe = new Map<string, Vaga[]>();
    for (const v of dados.vagas) {
      if (!vagasPorEquipe.has(v.equipeId)) vagasPorEquipe.set(v.equipeId, []);
      vagasPorEquipe.get(v.equipeId)!.push(v);
    }
    return {
      regra,
      idx: indexar(regra),
      equipePorId: new Map(dados.equipes.map((e) => [e.id, e])),
      vagaPorId: new Map(dados.vagas.map((v) => [v.id, v])),
      campanhaPorId: new Map(dados.campanhas.map((c) => [c.id, c])),
      veiculoPorId: new Map(dados.veiculos.map((v) => [v.id, v])),
      vagasPorEquipe,
    };
  }, [dados]);

  const shell: Shell = { ocultarNomes, setOcultarNomes, nivel: dados?.nivel ?? null, podeEditar: dados?.podeEditar ?? false, carregado: !!dados };
  const valor: Ctx | null =
    dados && pronto
      ? { dados, ...pronto, hoje, recarregar, ocultarNomes, setOcultarNomes, nomeDe: (v) => (ocultarNomes ? v.cargo : v.nome ?? "—") }
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
