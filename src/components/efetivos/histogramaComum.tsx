"use client";

// Peças que o histograma de pessoas e o de viaturas dividem: paleta, rampa da tabela, formatos de mês/número e a lista com várias escolhas.
import { useState } from "react";
import { nomeDoMes } from "@/lib/efetivos/linhaDoTempo";

// Paleta categórica de 8 posições (azul, laranja, água, amarelo, magenta, verde, violeta, vermelho), na ordem validada para
// colunas empilhadas: vizinhos sempre distinguíveis, inclusive por quem não enxerga bem as cores. O resto vai em cinza ("Outros").
export const SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7"];
export const OUTROS = "#9AA8A1";
// Sequencial de um tom só (azul), do claro ao escuro, para a tabela equipe × mês.
export const RAMPA = ["#cde2fb", "#b7d3f6", "#9ec5f4", "#86b6ef", "#6da7ec", "#5598e7", "#3987e5", "#2a78d6", "#256abf", "#1c5cab", "#184f95", "#104281"];
export const TOPO = SERIES.length;

export const rotuloMes = (m: string) => `${nomeDoMes(Number(m.slice(5, 7)))}/${m.slice(2, 4)}`;
export const nomeLongoDoMes = (m: string) => `${nomeDoMes(Number(m.slice(5, 7)), true)} de ${m.slice(0, 4)}`;
export const nomeLongoMaiusculo = (m: string) => nomeLongoDoMes(m).replace(/^./, (c) => c.toUpperCase());
export const fmtNum = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace(".", ","));

export function corDaRampa(v: number, max: number): { fundo: string; texto: string } {
  if (v <= 0 || max <= 0) return { fundo: "transparent", texto: "#9AA8A1" };
  const i = Math.min(RAMPA.length - 1, Math.round((v / max) * (RAMPA.length - 1)));
  return { fundo: RAMPA[i], texto: i >= 6 ? "#FFFFFF" : "#101B17" };
}

export type Janelas = "auto" | "6m" | "12m" | "ano" | "personalizado";


/** Lista suspensa com várias escolhas: o botão diz quantas estão marcadas. */
export function MultiSelecao({ rotulo, opcoes, valor, onChange }: { rotulo: string; opcoes: { id: string; rotulo: string }[]; valor: string[]; onChange: (v: string[]) => void }) {
  const [busca, setBusca] = useState("");
  const t = busca.trim().toLowerCase();
  const lista = opcoes.filter((o) => !t || o.rotulo.toLowerCase().includes(t));
  return (
    <div className="relative">
      <span className="label">{rotulo}</span>
      <details className="group">
        <summary className="field flex min-w-[150px] cursor-pointer list-none items-center justify-between gap-2">
          <span className="truncate">{valor.length === 0 ? "Todos" : valor.length === 1 ? opcoes.find((o) => o.id === valor[0])?.rotulo ?? valor[0] : `${valor.length} escolhidos`}</span>
          <span className="text-gray-400 group-open:rotate-180">▾</span>
        </summary>
        <div className="absolute left-0 z-40 mt-1 w-72 rounded-xl border border-line bg-white p-2 shadow-pop">
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar…" className="field mb-2" />
          <div className="max-h-60 overflow-y-auto">
            {lista.map((o) => {
              const marcado = valor.includes(o.id);
              return (
                <label key={o.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-[12.5px] hover:bg-gray-50">
                  <input type="checkbox" checked={marcado} onChange={() => onChange(marcado ? valor.filter((x) => x !== o.id) : [...valor, o.id])} className="h-4 w-4 accent-[#0A9E7F]" />
                  <span className="truncate">{o.rotulo}</span>
                </label>
              );
            })}
            {lista.length === 0 && <p className="px-2 py-1 text-[12px] text-gray-400">Nada encontrado.</p>}
          </div>
          {valor.length > 0 && (
            <button onClick={() => onChange([])} className="mt-1 w-full rounded-md px-2 py-1 text-left text-[12px] font-semibold text-brand-dark hover:bg-gray-50">
              Limpar escolha
            </button>
          )}
        </div>
      </details>
    </div>
  );
}
