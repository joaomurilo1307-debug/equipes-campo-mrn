"use client";

// Gráficos em SVG, sem biblioteca: colunas empilhadas, barras horizontais, rosca e barra de proporção.
// Regras comuns: marcas finas, 2px de respiro entre as partes, grade discreta, texto sempre na cor do texto
// (a cor da série fica só na marca), legenda sempre presente e valor no tooltip de cada marca.
import { useState, type ReactNode } from "react";

export type Serie = { nome: string; cor: string; listrada?: boolean };

const TINTA = "#101B17";
const MUDO = "#6F7E77";
const GRADE = "#E1E7E3";

/** Maior valor "redondo" para o eixo (10, 20, 25, 50…) e os degraus da grade. */
export function escalaBonita(max: number, alvo = 4): { teto: number; passos: number[] } {
  if (max <= 0) return { teto: 4, passos: [0, 1, 2, 3, 4] };
  const bruto = max / alvo;
  const potencia = Math.pow(10, Math.floor(Math.log10(bruto)));
  const frac = bruto / potencia;
  const passo = (frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 2.5 ? 2.5 : frac <= 5 ? 5 : 10) * potencia;
  const teto = Math.ceil(max / passo) * passo;
  const passos: number[] = [];
  for (let v = 0; v <= teto + passo / 2; v += passo) passos.push(Math.round(v * 100) / 100);
  return { teto, passos };
}

export function Legenda({ series, className = "" }: { series: Serie[]; className?: string }) {
  return (
    <div className={`flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-gray-600 ${className}`}>
      {series.map((s) => (
        <span key={s.nome} className="inline-flex items-center gap-1.5">
          <span className={`inline-block h-2.5 w-2.5 rounded-[3px] ${s.listrada ? "listrado" : ""}`} style={{ background: s.cor }} />
          {s.nome}
        </span>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- barra de proporção

export function BarraPartes({ partes, alto = 8 }: { partes: { n: number; cor: string; rotulo: string; listrada?: boolean }[]; alto?: number }) {
  const total = partes.reduce((s, p) => s + p.n, 0) || 1;
  return (
    <div className="flex w-full gap-[2px] overflow-hidden rounded-full bg-gray-100" style={{ height: alto }} role="img" aria-label={partes.map((p) => `${p.n} ${p.rotulo}`).join(", ")}>
      {partes
        .filter((p) => p.n > 0)
        .map((p) => (
          <div key={p.rotulo} className={p.listrada ? "listrado" : ""} style={{ width: `${(p.n / total) * 100}%`, background: p.cor }} title={`${p.n} ${p.rotulo}`} />
        ))}
    </div>
  );
}

// ---------------------------------------------------------------- colunas empilhadas

export type Coluna = { rotulo: string; dica: string; valores: number[]; destaque?: boolean };

/**
 * Uma coluna por período, empilhada por série (valores na ordem de `series`, de baixo para cima).
 * Passar o mouse mostra os números; `aoClicar` abre o período.
 */
export function ColunasEmpilhadas({
  colunas,
  series,
  altura = 220,
  aoClicar,
  rotuloEixo,
}: {
  colunas: Coluna[];
  series: Serie[];
  altura?: number;
  aoClicar?: (i: number) => void;
  rotuloEixo?: string;
}) {
  const [ativa, setAtiva] = useState<number | null>(null);
  const W = 860;
  const esq = 34;
  const base = 22;
  const topo = 8;
  const H = altura;
  const ih = H - base - topo;
  const iw = W - esq - 6;
  const max = Math.max(1, ...colunas.map((c) => c.valores.reduce((s, v) => s + v, 0)));
  const { teto, passos } = escalaBonita(max);
  const largura = iw / Math.max(1, colunas.length);
  const larguraBarra = Math.min(34, largura - 6);
  const y = (v: number) => topo + ih - (v / teto) * ih;
  const passoRotulo = largura < 34 ? 2 : 1;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={rotuloEixo ?? "Gráfico de colunas"} onMouseLeave={() => setAtiva(null)}>
        {passos.map((v) => (
          <g key={v}>
            <line x1={esq} x2={W - 6} y1={y(v)} y2={y(v)} stroke={GRADE} strokeWidth={1} strokeDasharray={v === 0 ? undefined : "3 4"} />
            <text x={esq - 6} y={y(v) + 3.5} textAnchor="end" fontSize={10.5} fill={MUDO}>
              {v}
            </text>
          </g>
        ))}
        {colunas.map((c, i) => {
          const cx = esq + largura * i + largura / 2;
          let acumulado = 0;
          return (
            <g key={i} opacity={ativa === null || ativa === i ? 1 : 0.55}>
              {c.valores.map((v, k) => {
                if (v <= 0) return null;
                const y1 = y(acumulado + v);
                const h = y(acumulado) - y1;
                acumulado += v;
                return <rect key={k} x={cx - larguraBarra / 2} y={y1} width={larguraBarra} height={Math.max(0, h)} rx={2.5} fill={series[k].cor} stroke="#fff" strokeWidth={1.5} className={series[k].listrada ? "listrado" : ""} />;
              })}
              {i % passoRotulo === 0 && (
                <text x={cx} y={H - 6} textAnchor="middle" fontSize={10.5} fill={c.destaque ? TINTA : MUDO} fontWeight={c.destaque ? 700 : 400}>
                  {c.rotulo}
                </text>
              )}
              <rect
                x={esq + largura * i}
                y={0}
                width={largura}
                height={H - base}
                fill="transparent"
                style={{ cursor: aoClicar ? "pointer" : "default" }}
                onMouseEnter={() => setAtiva(i)}
                onClick={() => aoClicar?.(i)}
              />
            </g>
          );
        })}
      </svg>
      {ativa !== null && colunas[ativa] && (
        <div
          className="pointer-events-none absolute top-0 z-10 w-44 -translate-x-1/2 rounded-lg border border-line bg-white px-3 py-2 text-xs shadow-pop"
          style={{ left: `${Math.min(86, Math.max(14, ((esq + largura * ativa + largura / 2) / W) * 100))}%` }}
        >
          <div className="mb-1 font-semibold text-ink">{colunas[ativa].dica}</div>
          {series.map((s, k) => (
            <div key={s.nome} className="flex items-center justify-between gap-2 text-gray-600">
              <span className="inline-flex items-center gap-1.5">
                <span className={`inline-block h-2 w-2 rounded-sm ${s.listrada ? "listrado" : ""}`} style={{ background: s.cor }} />
                {s.nome}
              </span>
              <span className="num font-semibold text-ink">{colunas[ativa].valores[k]}</span>
            </div>
          ))}
          {aoClicar && <div className="mt-1 border-t border-line pt-1 text-[10.5px] text-gray-400">clique para ver quem está livre</div>}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- barras horizontais

export type ItemBarra = { rotulo: string; sub?: string; partes: number[]; extra?: ReactNode };

/** Barras horizontais ordenadas, cada uma podendo ser empilhada por série. O valor total aparece à direita. */
export function BarrasHorizontais({ itens, series, formatoTotal }: { itens: ItemBarra[]; series: Serie[]; formatoTotal?: (n: number) => string }) {
  const max = Math.max(1, ...itens.map((i) => i.partes.reduce((s, v) => s + v, 0)));
  return (
    <ul className="space-y-2.5">
      {itens.map((i) => {
        const total = i.partes.reduce((s, v) => s + v, 0);
        return (
          <li key={i.rotulo}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-[12.5px]">
              <span className="truncate font-medium text-ink" title={i.rotulo}>
                {i.rotulo}
              </span>
              <span className="num shrink-0 font-semibold text-ink">{formatoTotal ? formatoTotal(total) : total}</span>
            </div>
            <div className="flex h-2 gap-[2px]" style={{ width: `${(total / max) * 100}%`, minWidth: total > 0 ? 6 : 0 }} role="img" aria-label={`${i.rotulo}: ${total}`}>
              {i.partes.map((v, k) =>
                v > 0 ? <div key={k} className={`rounded-full ${series[k].listrada ? "listrado" : ""}`} style={{ flex: v, background: series[k].cor }} title={`${series[k].nome}: ${v}`} /> : null
              )}
            </div>
            {(i.sub || i.extra) && (
              <div className="mt-0.5 text-[11px] text-gray-500">
                {i.sub}
                {i.extra}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// ---------------------------------------------------------------- rosca

export function Rosca({ partes, tamanho = 132, centro }: { partes: { n: number; cor: string; rotulo: string }[]; tamanho?: number; centro?: { valor: string | number; rotulo: string } }) {
  const total = partes.reduce((s, p) => s + p.n, 0);
  const R = 52;
  const C = 2 * Math.PI * R;
  let acumulado = 0;
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 132 132" role="img" aria-label={partes.map((p) => `${p.rotulo}: ${p.n}`).join(", ")}>
      <circle cx={66} cy={66} r={R} fill="none" stroke={GRADE} strokeWidth={14} />
      {total > 0 &&
        partes
          .filter((p) => p.n > 0)
          .map((p) => {
            const fatia = (p.n / total) * C;
            const deslocamento = -acumulado;
            acumulado += fatia;
            return (
              <circle key={p.rotulo} cx={66} cy={66} r={R} fill="none" stroke={p.cor} strokeWidth={14} strokeDasharray={`${Math.max(0, fatia - 2)} ${C - Math.max(0, fatia - 2)}`} strokeDashoffset={deslocamento} transform="rotate(-90 66 66)">
                <title>{`${p.rotulo}: ${p.n}`}</title>
              </circle>
            );
          })}
      {centro && (
        <>
          <text x={66} y={65} textAnchor="middle" fontSize={22} fontWeight={600} fill={TINTA} style={{ fontVariantNumeric: "tabular-nums" }}>
            {centro.valor}
          </text>
          <text x={66} y={81} textAnchor="middle" fontSize={10} fill={MUDO}>
            {centro.rotulo}
          </text>
        </>
      )}
    </svg>
  );
}
