"use client";

// Página com abas: o título e as abas ficam em cima, cada aba é uma tela já pronta. A aba escolhida vai na URL (?aba=...),
// então o link de uma aba abre direto nela e o botão voltar do navegador funciona.
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { EmAbas } from "./ui";

export type Aba = { id: string; rotulo: string; dica?: string; conteudo: () => ReactNode };

export default function PaginaComAbas({ titulo, subtitulo, abas, padrao }: { titulo: string; subtitulo?: ReactNode; abas: Aba[]; padrao: string }) {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const atual = abas.find((a) => a.id === sp.get("aba")) ?? abas.find((a) => a.id === padrao) ?? abas[0];

  return (
    <div>
      <div className="mb-4">
        <h1 className="font-display text-[22px] font-semibold leading-tight tracking-tight text-ink">{titulo}</h1>
        {subtitulo && <p className="mt-0.5 max-w-3xl text-[13px] text-gray-500">{subtitulo}</p>}
        <div className="mt-3 flex flex-wrap gap-1 border-b border-line" role="tablist" aria-label={titulo}>
          {abas.map((a) => {
            const ativa = a.id === atual.id;
            return (
              <button
                key={a.id}
                role="tab"
                aria-selected={ativa}
                title={a.dica}
                onClick={() => router.replace(`${pathname}?aba=${a.id}`, { scroll: false })}
                className={`-mb-px rounded-t-lg border-b-2 px-4 py-2 text-[13.5px] font-semibold transition-colors ${ativa ? "border-brand bg-white text-brand-dark" : "border-transparent text-gray-500 hover:text-ink"}`}
              >
                {a.rotulo}
              </button>
            );
          })}
        </div>
      </div>
      <EmAbas.Provider value={true}>{atual.conteudo()}</EmAbas.Provider>
    </div>
  );
}
