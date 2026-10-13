"use client";

import { useMemo, type ReactNode } from "react";
import { somarDias, type Dia } from "@/lib/efetivos/disponibilidade";
import { diaDaSemana, ehFimDeSemana, fmtDiaCurto, mesCurto, semanaIso } from "../comum";
import { ESQ } from "./geometria";

/** Régua do tempo (meses, semanas e, no zoom por dia, os dias) para as telas em linha do tempo. */
export default function CabecalhoTempo({ inicio, totalDias, dw, hoje, esquerda }: { inicio: Dia; totalDias: number; dw: number; hoje: Dia; esquerda: ReactNode }) {
  const dias = useMemo(() => Array.from({ length: totalDias }, (_, i) => somarDias(inicio, i)), [inicio, totalDias]);
  const semanas = useMemo(() => Array.from({ length: Math.ceil(totalDias / 7) }, (_, k) => somarDias(inicio, k * 7)), [inicio, totalDias]);
  const meses = useMemo(() => {
    const blocos: { rotulo: string; dias: number }[] = [];
    for (const d of dias) {
      const r = `${mesCurto(d)}/${d.slice(2, 4)}`;
      if (blocos.length && blocos[blocos.length - 1].rotulo === r) blocos[blocos.length - 1].dias++;
      else blocos.push({ rotulo: r, dias: 1 });
    }
    return blocos;
  }, [dias]);

  return (
    <div className="sticky top-0 z-20 flex border-b border-line bg-white">
      <div className="sticky left-0 z-30 flex shrink-0 items-end border-r border-line bg-white px-4 pb-2" style={{ width: ESQ, height: dw >= 20 ? 78 : 56 }}>
        {esquerda}
      </div>
      <div style={{ width: totalDias * dw }}>
        <div className="flex">
          {meses.map((m, i) => (
            <div key={i} className="overflow-hidden whitespace-nowrap border-r border-line px-2 py-1 font-display text-[12px] font-semibold uppercase tracking-wide text-gray-700" style={{ width: m.dias * dw }}>
              {m.rotulo}
            </div>
          ))}
        </div>
        <div className="flex">
          {semanas.map((s) => (
            <div key={s} className="overflow-hidden whitespace-nowrap border-r border-line px-1.5 py-1 text-[10px] text-gray-500" style={{ width: 7 * dw }}>
              {dw >= 10 ? `S${semanaIso(s)} · ${fmtDiaCurto(s)}` : dw >= 5 ? `S${semanaIso(s)}` : ""}
            </div>
          ))}
        </div>
        {dw >= 20 && (
          <div className="flex">
            {dias.map((d) => (
              <div key={d} className={`flex flex-col items-center py-0.5 text-[10px] leading-tight ${ehFimDeSemana(d) ? "bg-gray-50 text-gray-400" : "text-gray-600"} ${d === hoje ? "font-bold text-accent" : ""}`} style={{ width: dw }}>
                <span>{diaDaSemana(d)[0].toUpperCase()}</span>
                <span className="num">{d.slice(8, 10)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
