"use client";

import { useRef, useState, type ReactNode } from "react";
import { somarDias, type Dia } from "@/lib/efetivos/disponibilidade";
import { fmtDiaCurto } from "../comum";
import { recortar, ALTURA_FAIXA, type Barra } from "./geometria";

type Props = {
  inicio: Dia;
  totalDias: number;
  dw: number;
  altura: number;
  /** Se informado, arrastar sobre a faixa seleciona um período e chama esta função. */
  onSelecionar?: (ini: Dia, fim: Dia) => void;
  /** Permite selecionar um único dia com um clique (só no zoom por dia). */
  umDia?: boolean;
  dica?: string;
  barras?: { barra: Barra; faixa: number }[];
  topoBarras?: number;
  alturaBarra?: number;
  children?: ReactNode;
};

/**
 * Faixa horizontal da linha do tempo: desenha as barras e, quando editável, deixa arrastar
 * com o mouse (ou o dedo) para escolher um período — é daqui que se cria campanha, ausência etc.
 */
export default function Lane({ inicio, totalDias, dw, altura, onSelecionar, umDia, dica, barras = [], topoBarras = 6, alturaBarra = ALTURA_FAIXA - 4, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const arrastando = useRef<{ a: number } | null>(null);
  const [sel, setSel] = useState<{ a: number; b: number } | null>(null);
  const fimJanela = somarDias(inicio, totalDias - 1);

  const celula = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect();
    return Math.max(0, Math.min(totalDias - 1, Math.floor((clientX - r.left) / dw)));
  };

  function descer(e: React.PointerEvent<HTMLDivElement>) {
    if (!onSelecionar || e.button !== 0) return;
    if ((e.target as HTMLElement).closest("[data-barra]")) return;
    const a = celula(e.clientX);
    arrastando.current = { a };
    setSel({ a, b: a });
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function mover(e: React.PointerEvent<HTMLDivElement>) {
    if (!arrastando.current) return;
    setSel({ a: arrastando.current.a, b: celula(e.clientX) });
  }
  function soltar(e: React.PointerEvent<HTMLDivElement>) {
    if (!arrastando.current) return;
    const a = arrastando.current.a;
    const b = celula(e.clientX);
    arrastando.current = null;
    setSel(null);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (a === b && !umDia) return; // um clique solto não cria nada
    const ini = Math.min(a, b);
    const fim = Math.max(a, b);
    onSelecionar?.(somarDias(inicio, ini), somarDias(inicio, fim));
  }

  const largura = totalDias * dw;
  const grade = {
    backgroundImage: [
      `repeating-linear-gradient(to right, transparent 0, transparent ${5 * dw}px, rgba(16,27,23,0.035) ${5 * dw}px, rgba(16,27,23,0.035) ${7 * dw}px)`,
      `repeating-linear-gradient(to right, #E1E7E3 0, #E1E7E3 1px, transparent 1px, transparent ${7 * dw}px)`,
    ].join(","),
  } as const;

  return (
    <div
      ref={ref}
      className={`relative select-none ${onSelecionar ? "cursor-crosshair" : ""}`}
      style={{ width: largura, height: altura, touchAction: onSelecionar ? "pan-y" : undefined, ...grade }}
      title={onSelecionar ? dica : undefined}
      onPointerDown={descer}
      onPointerMove={mover}
      onPointerUp={soltar}
      onPointerCancel={() => {
        arrastando.current = null;
        setSel(null);
      }}
    >
      {children}
      {barras.map(({ barra, faixa }) => {
        const r = recortar(barra, inicio, fimJanela);
        if (!r) return null;
        const larg = r.larg * dw;
        return (
          <div
            key={barra.id}
            data-barra
            role={barra.onClick ? "button" : undefined}
            tabIndex={barra.onClick ? 0 : undefined}
            onClick={barra.onClick}
            onKeyDown={(e) => barra.onClick && (e.key === "Enter" || e.key === " ") && barra.onClick()}
            title={barra.dica}
            className={`absolute z-[6] flex cursor-pointer items-center overflow-hidden whitespace-nowrap px-2 text-[11px] font-semibold shadow-sm transition-[filter] hover:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink ${r.cortadaEsq ? "rounded-l-none" : "rounded-l-md"} ${r.cortadaDir ? "rounded-r-none" : "rounded-r-md"} ${barra.listrada ? "listrado" : ""}`}
            style={{ left: r.esq * dw, width: Math.max(larg - 1, 4), top: topoBarras + faixa * ALTURA_FAIXA, height: alturaBarra, background: barra.cor, color: barra.corTexto ?? "#fff" }}
          >
            {larg > 46 ? barra.rotulo : ""}
          </div>
        );
      })}
      {sel && (
        <div
          className="pointer-events-none absolute inset-y-0 z-10 rounded-md border-2 border-brand bg-brand/15"
          style={{ left: Math.min(sel.a, sel.b) * dw, width: (Math.abs(sel.b - sel.a) + 1) * dw }}
        >
          <span className="absolute -top-0.5 left-1 whitespace-nowrap rounded bg-brand px-1.5 py-0.5 text-[10px] font-semibold text-white">
            {fmtDiaCurto(somarDias(inicio, Math.min(sel.a, sel.b)))} → {fmtDiaCurto(somarDias(inicio, Math.max(sel.a, sel.b)))} · {Math.abs(sel.b - sel.a) + 1} dias
          </span>
        </div>
      )}
    </div>
  );
}
