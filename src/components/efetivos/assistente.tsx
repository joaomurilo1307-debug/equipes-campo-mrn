"use client";

// Moldura dos assistentes (nova equipe, movimentar equipe, abrir vagas / novo cargo): à esquerda o que se preenche, à direita
// o resumo que acompanha e o botão de confirmar. É o mesmo jeito de montar uma campanha, agora para a equipe.
import Link from "next/link";
import type { ReactNode } from "react";
import { IcCheck } from "./icones";
import { CabecalhoPagina } from "./ui";

export function Assistente({ titulo, subtitulo, voltarHref, voltarRotulo = "Cancelar", topo, children, resumo }: { titulo: string; subtitulo?: ReactNode; voltarHref: string; voltarRotulo?: string; topo?: ReactNode; children: ReactNode; resumo: ReactNode }) {
  return (
    <div>
      <CabecalhoPagina
        titulo={titulo}
        subtitulo={subtitulo}
        acoes={
          <Link href={voltarHref} className="btn-ghost">
            {voltarRotulo}
          </Link>
        }
      />
      {topo && <div className="mb-4">{topo}</div>}
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-4">{children}</div>
        <aside className="space-y-3 xl:sticky xl:top-5">{resumo}</aside>
      </div>
    </div>
  );
}

/** Cartão de resumo da direita: cabeçalho escuro com o que está sendo feito, o corpo e o botão. */
export function ResumoCard({ rotulo, titulo, linhas, children, rodape }: { rotulo: string; titulo: string; linhas?: string[]; children?: ReactNode; rodape?: ReactNode }) {
  return (
    <section className="card overflow-hidden">
      <div className="border-b border-line bg-brand-deep px-4 py-3 text-white">
        <div className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-white/60">{rotulo}</div>
        <div className="mt-0.5 truncate font-display text-[16px] font-semibold tracking-tight">{titulo}</div>
        {linhas?.map((l, i) => (
          <div key={i} className="mt-0.5 text-[11.5px] text-white/70">
            {l}
          </div>
        ))}
      </div>
      <div className="space-y-3 px-4 py-3">
        {children}
        {rodape}
      </div>
    </section>
  );
}

export function Numeros({ itens }: { itens: { valor: number | string; rotulo: string; cor?: string }[] }) {
  return (
    <div className="grid gap-2 text-center" style={{ gridTemplateColumns: `repeat(${itens.length}, minmax(0, 1fr))` }}>
      {itens.map((i) => (
        <div key={i.rotulo}>
          <div className="num font-display text-xl font-semibold" style={{ color: i.cor ?? "#101B17" }}>
            {i.valor}
          </div>
          <div className="text-[10.5px] text-gray-500">{i.rotulo}</div>
        </div>
      ))}
    </div>
  );
}

export function Rotulo({ t, children, className = "" }: { t: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="label">{t}</span>
      {children}
    </label>
  );
}

/** Tela de "pronto" depois de confirmar. */
export function Pronto({ titulo, texto, acoes }: { titulo: string; texto: ReactNode; acoes: ReactNode }) {
  return (
    <div className="mx-auto max-w-xl pt-10">
      <div className="card p-8 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-ok-soft text-ok">
          <IcCheck tam={24} />
        </span>
        <h1 className="mt-4 font-display text-xl font-semibold tracking-tight">{titulo}</h1>
        <p className="mt-1 text-sm text-gray-600">{texto}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">{acoes}</div>
      </div>
    </div>
  );
}
