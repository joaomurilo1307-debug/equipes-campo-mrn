"use client";

// Visão do período todo numa faixa só: cada semana é uma coluna (vermelho = ausentes, amarelo = vagas abertas) e o retângulo
// mostra a janela que está na tela. Clique ou arraste para levar a janela a qualquer semana, sem rolar uma linha do tempo enorme.
import { useRef } from "react";
import { somarDias, type Dia } from "@/lib/efetivos/disponibilidade";
import { fmtDia, fmtDiaCurto, mesCurto } from "../comum";
import { ligarDica, useDica } from "./dicas";

export type PontoMapa = { seg: Dia; total: number; ausentes: number; abertas: number };

export default function MiniMapa({ pontos, inicioJanela, semanasJanela, hoje, aoIr }: { pontos: PontoMapa[]; inicioJanela: Dia; semanasJanela: number; hoje: Dia; aoIr: (seg: Dia) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const arrastando = useRef(false);
  const tip = useDica();
  const n = pontos.length;
  if (n === 0) return null;
  // altura = parte das posições com ausência ou vaga aberta; a escala cobre no mínimo 30% para uma semana normal não parecer cheia
  const maximo = Math.max(0.3, ...pontos.map((p) => (p.total ? (p.ausentes + p.abertas) / p.total : 0)));
  const iJanela = Math.max(0, pontos.findIndex((p) => p.seg >= inicioJanela));
  const iHoje = pontos.findIndex((p) => p.seg > hoje) - 1;

  const irPara = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect(); // mesma unidade do clientX: a razão não depende do zoom
    const f = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    const centro = Math.round(f * n - semanasJanela / 2);
    const i = Math.max(0, Math.min(n - 1, centro));
    aoIr(pontos[i].seg);
  };

  // marcas de mês
  const meses: { i: number; rotulo: string }[] = [];
  pontos.forEach((p, i) => {
    if (i === 0 || p.seg.slice(5, 7) !== pontos[i - 1].seg.slice(5, 7)) meses.push({ i, rotulo: `${mesCurto(p.seg)}${p.seg.slice(5, 7) === "01" ? `/${p.seg.slice(2, 4)}` : ""}` });
  });

  return (
    <div className="card mb-3 px-3 pb-2 pt-1.5">
      <div className="mb-1 flex items-center justify-between text-[10.5px] text-gray-500">
        <span className="font-semibold uppercase tracking-wide">Visão geral do período</span>
        <span>
          {fmtDiaCurto(pontos[0].seg)} → {fmtDiaCurto(somarDias(pontos[n - 1].seg, 6))} · clique ou arraste para mudar a janela
        </span>
      </div>
      <div
        ref={ref}
        className="relative h-[46px] cursor-pointer select-none touch-none"
        onPointerDown={(e) => {
          arrastando.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          irPara(e.clientX);
        }}
        onPointerMove={(e) => arrastando.current && irPara(e.clientX)}
        onPointerUp={(e) => {
          arrastando.current = false;
          if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
        }}
      >
        {/* colunas */}
        <div className="absolute inset-x-0 bottom-3 top-0 flex items-end gap-px">
          {pontos.map((p) => {
            const hA = (p.total ? p.ausentes / p.total / maximo : 0) * 100;
            const hV = (p.total ? p.abertas / p.total / maximo : 0) * 100;
            return (
              <div
                key={p.seg}
                className="flex h-full flex-1 flex-col justify-end"
                {...ligarDica(tip, `Semana de ${fmtDia(p.seg)}\n${p.ausentes} ausente(s) · ${p.abertas} vaga(s) aberta(s)\n${p.total} posições nas equipes visíveis`)}
              >
                <div style={{ height: `${hV}%`, background: "#E0A100" }} className="min-h-0 rounded-t-[1px]" />
                <div style={{ height: `${hA}%`, background: "#E63329" }} />
                <div className="h-[2px] shrink-0 bg-ok/40" />
              </div>
            );
          })}
        </div>
        {/* meses */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-3">
          {meses.map((m) => (
            <span key={m.i} className="absolute text-[9.5px] uppercase text-gray-400" style={{ left: `${(m.i / n) * 100}%` }}>
              {m.rotulo}
            </span>
          ))}
        </div>
        {/* hoje */}
        {iHoje >= 0 && <div className="pointer-events-none absolute bottom-3 top-0 w-px bg-accent" style={{ left: `${((iHoje + 0.5) / n) * 100}%` }} />}
        {/* janela */}
        <div className="pointer-events-none absolute bottom-3 top-0 rounded-md border-2 border-brand bg-brand/10" style={{ left: `${(iJanela / n) * 100}%`, width: `${(Math.min(semanasJanela, n - iJanela) / n) * 100}%` }} />
      </div>
    </div>
  );
}
