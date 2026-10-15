"use client";

// Dica flutuante (hover) do quadro: mostra a informação específica de cada barra, célula ou pessoa quando o mouse passa.
// A tela usa `zoom: 0.75` no html; o navegador entrega o mouse e as medidas em pixels visuais, então tudo aqui divide pelo zoom.
import { createContext, useCallback, useContext, useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";

/** Fator do zoom da página (0.75 nesta tela): pixels visuais / pixels CSS. */
export function fatorZoom(): number {
  const b = document.body;
  const w = b.offsetWidth;
  return w ? b.getBoundingClientRect().width / w : 1;
}

type Estado = { x: number; y: number; conteudo: ReactNode } | null;
type Api = {
  mostrar: (e: MouseEvent, conteudo: ReactNode | string) => void;
  mover: (e: MouseEvent) => void;
  esconder: () => void;
};

const Contexto = createContext<Api | null>(null);

export function useDica(): Api {
  const c = useContext(Contexto);
  if (!c) throw new Error("useDica fora do DicaProvider");
  return c;
}

/** Texto simples em várias linhas: a primeira é o título. */
export function TextoDica({ texto }: { texto: string }) {
  const [titulo, ...resto] = texto.split("\n");
  return (
    <>
      <div className="font-semibold text-ink">{titulo}</div>
      {resto.map((l, i) => (
        <div key={i} className="text-gray-600">
          {l}
        </div>
      ))}
    </>
  );
}

/** Uma linha "rótulo: valor" da dica. */
export function LinhaDica({ rotulo, children, cor }: { rotulo: string; children: ReactNode; cor?: string }) {
  return (
    <div className="flex items-start justify-between gap-3 text-[11.5px]">
      <span className="inline-flex shrink-0 items-center gap-1.5 text-gray-500">
        {cor && <span className="inline-block h-2 w-2 rounded-sm" style={{ background: cor }} />}
        {rotulo}
      </span>
      <span className="text-right text-ink">{children}</span>
    </div>
  );
}

export function DicaProvider({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<Estado>(null);
  const mostrar = useCallback((e: MouseEvent, conteudo: ReactNode | string) => setEstado({ x: e.clientX, y: e.clientY, conteudo: typeof conteudo === "string" ? <TextoDica texto={conteudo} /> : conteudo }), []);
  const mover = useCallback((e: MouseEvent) => setEstado((s) => (s ? { ...s, x: e.clientX, y: e.clientY } : s)), []);
  const esconder = useCallback(() => setEstado(null), []);
  return (
    <Contexto.Provider value={{ mostrar, mover, esconder }}>
      {children}
      {estado && <Flutuante x={estado.x} y={estado.y}>{estado.conteudo}</Flutuante>}
    </Contexto.Provider>
  );
}

function Flutuante({ x, y, children }: { x: number; y: number; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: -9999, top: -9999 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const z = fatorZoom();
    const r = el.getBoundingClientRect(); // visual
    const margem = 14;
    let left = x + margem;
    let top = y + margem;
    if (left + r.width > window.innerWidth - 8) left = x - margem - r.width; // vira para a esquerda
    if (top + r.height > window.innerHeight - 8) top = Math.max(8, y - margem - r.height); // vira para cima
    setPos({ left: Math.max(8, left) / z, top: top / z });
  }, [x, y, children]);
  return (
    <div ref={ref} role="tooltip" className="pointer-events-none fixed z-[70] w-max max-w-[340px] rounded-xl border border-line bg-white px-3 py-2 text-xs shadow-pop" style={{ left: pos.left, top: pos.top }}>
      {children}
    </div>
  );
}

/** Props para ligar uma dica a um elemento: <div {...dica.de(...)}>. */
export function ligarDica(api: Api, conteudo: ReactNode | string) {
  return {
    onMouseEnter: (e: MouseEvent) => api.mostrar(e, conteudo),
    onMouseMove: (e: MouseEvent) => api.mover(e),
    onMouseLeave: () => api.esconder(),
  };
}
