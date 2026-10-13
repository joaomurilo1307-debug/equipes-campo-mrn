"use client";

import { useRef, useState } from "react";

/**
 * Campo que salva sozinho ao sair dele (ou ao dar Enter): para as "fichas" editáveis, sem botão Salvar.
 * Mostra um "salvo" discreto quando grava e o erro quando não consegue.
 */
export function CampoInline({
  rotulo,
  valor,
  onSalvar,
  lista,
  placeholder,
  linhas,
  tipo = "text",
  desabilitado,
  className = "",
}: {
  rotulo: string;
  valor: string;
  onSalvar: (novo: string) => Promise<string | null | void>;
  lista?: string[];
  placeholder?: string;
  linhas?: number;
  tipo?: "text" | "date";
  desabilitado?: boolean;
  className?: string;
}) {
  const [estado, setEstado] = useState<"" | "salvando" | "salvo" | "erro">("");
  const [msg, setMsg] = useState<string | null>(null);
  const idLista = useRef(`lista-${Math.random().toString(36).slice(2, 8)}`).current;

  async function aoSair(novo: string) {
    if (novo.trim() === (valor ?? "").trim() || desabilitado) return;
    setEstado("salvando");
    const erro = await onSalvar(novo.trim());
    if (erro) {
      setEstado("erro");
      setMsg(erro);
    } else {
      setEstado("salvo");
      setMsg(null);
      setTimeout(() => setEstado(""), 1400);
    }
  }

  const cls = "mt-1 block w-full rounded-md border border-line bg-white px-2.5 py-1.5 text-[13px] text-ink placeholder:text-gray-400 hover:border-gray-300 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 disabled:bg-gray-50 disabled:text-gray-500";
  return (
    <label className={`block ${className}`}>
      <span className="flex items-center justify-between text-[11px] font-medium text-gray-500">
        {rotulo}
        <span className={`text-[10px] font-semibold ${estado === "salvo" ? "text-ok" : estado === "erro" ? "text-bad" : "text-gray-400"}`}>{estado === "salvando" ? "salvando…" : estado === "salvo" ? "salvo ✓" : estado === "erro" ? "não salvou" : ""}</span>
      </span>
      {linhas ? (
        <textarea key={valor} defaultValue={valor} rows={linhas} placeholder={placeholder} disabled={desabilitado} onBlur={(e) => aoSair(e.target.value)} className={cls} />
      ) : (
        <>
          <input
            key={valor}
            type={tipo}
            defaultValue={valor}
            placeholder={placeholder}
            disabled={desabilitado}
            list={lista ? idLista : undefined}
            onBlur={(e) => aoSair(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            className={cls}
          />
          {lista && (
            <datalist id={idLista}>
              {lista.map((x) => (
                <option key={x} value={x} />
              ))}
            </datalist>
          )}
        </>
      )}
      {estado === "erro" && msg && <span className="mt-0.5 block text-[11px] text-bad">{msg}</span>}
    </label>
  );
}
