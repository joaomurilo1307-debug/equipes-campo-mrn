"use client";

// Peças visuais compartilhadas por todas as telas.
import { useEffect, type ReactNode } from "react";
import { IcAlerta, IcCheck, IcFechar } from "./icones";

export function Modal({ titulo, subtitulo, onFechar, children, largo }: { titulo: string; subtitulo?: string; onFechar: () => void; children: ReactNode; largo?: boolean }) {
  useEscape(onFechar);
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/45 p-4 backdrop-blur-[2px]" onMouseDown={(e) => e.target === e.currentTarget && onFechar()}>
      <div role="dialog" aria-modal="true" aria-label={titulo} className={`my-8 w-full rounded-2xl bg-white shadow-pop ${largo ? "max-w-5xl" : "max-w-xl"}`}>
        <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
          <div className="min-w-0">
            <h3 className="font-display text-lg font-semibold tracking-tight text-ink">{titulo}</h3>
            {subtitulo && <p className="mt-0.5 text-xs text-gray-500">{subtitulo}</p>}
          </div>
          <button onClick={onFechar} className="-mr-1.5 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-ink" aria-label="Fechar">
            <IcFechar />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Drawer({ titulo, subtitulo, onFechar, children, rodape }: { titulo: ReactNode; subtitulo?: ReactNode; onFechar: () => void; children: ReactNode; rodape?: ReactNode }) {
  useEscape(onFechar);
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-ink/25" onMouseDown={(e) => e.target === e.currentTarget && onFechar()}>
      <aside role="dialog" aria-label="Detalhes" className="flex h-full w-full max-w-[440px] flex-col bg-white shadow-pop">
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <div className="font-display text-lg font-semibold leading-tight tracking-tight text-ink">{titulo}</div>
            {subtitulo && <div className="mt-0.5 text-xs text-gray-500">{subtitulo}</div>}
          </div>
          <button onClick={onFechar} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-ink" aria-label="Fechar">
            <IcFechar />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {rodape && <div className="border-t border-line px-5 py-3">{rodape}</div>}
      </aside>
    </div>
  );
}

function useEscape(fn: () => void) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && fn();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [fn]);
}

export function Aviso({ tipo, children }: { tipo: "erro" | "ok" | "atencao" | "info"; children: ReactNode }) {
  const cls = {
    erro: "border-bad/25 bg-bad-soft text-bad",
    ok: "border-ok/25 bg-ok-soft text-ok",
    atencao: "border-warn/25 bg-warn-soft text-warn",
    info: "border-info/25 bg-info-soft text-info",
  }[tipo];
  return (
    <div className={`flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-sm ${cls}`} role={tipo === "erro" ? "alert" : "status"}>
      <span className="mt-0.5 shrink-0">{tipo === "ok" ? <IcCheck tam={16} /> : <IcAlerta tam={16} />}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function Campo({ rotulo, dica, children, className }: { rotulo: string; dica?: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className ?? ""}`}>
      <span className="label">{rotulo}</span>
      {children}
      {dica && <span className="mt-1 block text-[11px] text-gray-400">{dica}</span>}
    </label>
  );
}

export function RodapeModal({ children }: { children: ReactNode }) {
  return <div className="flex items-center justify-end gap-2 border-t border-line px-6 py-3.5">{children}</div>;
}

export function Vazio({ titulo, texto, acao }: { titulo: string; texto?: string; acao?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 px-6 py-14 text-center">
      <div className="font-display text-base font-semibold text-gray-700">{titulo}</div>
      {texto && <p className="max-w-md text-sm text-gray-500">{texto}</p>}
      {acao && <div className="mt-2">{acao}</div>}
    </div>
  );
}

/** Controle segmentado (ex.: Cards | Tabela). */
export function Segmentado<T extends string>({ valor, opcoes, onChange }: { valor: T; opcoes: { id: T; rotulo: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex rounded-lg border border-line bg-gray-50 p-0.5" role="tablist">
      {opcoes.map((o) => (
        <button
          key={o.id}
          role="tab"
          aria-selected={valor === o.id}
          onClick={() => onChange(o.id)}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${valor === o.id ? "bg-white text-ink shadow-sm" : "text-gray-500 hover:text-ink"}`}
        >
          {o.rotulo}
        </button>
      ))}
    </div>
  );
}

export function CabecalhoPagina({ titulo, subtitulo, acoes }: { titulo: string; subtitulo?: ReactNode; acoes?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="font-display text-[22px] font-semibold leading-tight tracking-tight text-ink">{titulo}</h1>
        {subtitulo && <p className="mt-0.5 max-w-3xl text-[13px] text-gray-500">{subtitulo}</p>}
      </div>
      {acoes && <div className="no-print flex flex-wrap items-center gap-2">{acoes}</div>}
    </div>
  );
}

/** Ponto colorido do contrato. */
export function PontoContrato({ cor, tam = 10 }: { cor: string; tam?: number }) {
  return <span className="inline-block shrink-0 rounded-[3px]" style={{ width: tam, height: tam, background: cor, transform: "rotate(45deg) scale(.82)" }} aria-hidden="true" />;
}
