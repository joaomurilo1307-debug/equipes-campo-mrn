"use client";

import { useState } from "react";
import { duracaoTexto } from "@/lib/efetivos/linhaDoTempo";
import { conferirUso } from "@/lib/efetivos/usosVeiculo";
import { useDados } from "../DadosContext";
import { chamar, fmtDia, rotuloContrato, type Equipe } from "../comum";
import { Aviso, Campo, Modal, RodapeModal } from "../ui";

/** Define quando a equipe começa e termina (a linha do tempo e o histograma se desenham a partir disso). */
export default function ModalPeriodo({ equipe, onFechar }: { equipe: Equipe; onFechar: () => void }) {
  const { recarregar, usosPorEquipe, veiculoPorId, contagemDe, hoje } = useDados();
  const [inicio, setInicio] = useState(equipe.inicio ?? "");
  const [fim, setFim] = useState(equipe.fim ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const c = contagemDe([equipe.id], hoje);
  const usos = (usosPorEquipe.get(equipe.id) ?? []).map((u) => ({ u, v: veiculoPorId.get(u.veiculoId) })).filter((x) => x.v);
  // a conferência das viaturas já com as datas que estão sendo digitadas
  const conferir = (u: { inicio: string | null; fim: string | null }) => conferirUso(u, { inicio: inicio || null, fim: fim || null });
  const invalido = !!inicio && !!fim && fim < inicio;

  async function salvar() {
    setSalvando(true);
    setErro(null);
    const r = await chamar("PATCH", `/api/efetivos/equipes/${equipe.id}`, { inicio: inicio || null, fim: fim || null });
    setSalvando(false);
    if (!r.ok) return setErro(r.dados.error ?? "Não foi possível salvar");
    await recarregar();
    onFechar();
  }

  return (
    <Modal titulo={`Período — ${equipe.nome}`} subtitulo={`${equipe.codigo} · ${rotuloContrato(equipe.projeto)}`} onFechar={onFechar}>
      <div className="grid gap-4 px-6 py-5 sm:grid-cols-2">
        <Campo rotulo="A equipe começa em">
          <input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} className="field" />
        </Campo>
        <Campo rotulo="A equipe termina em" dica="Em branco = ainda sem data de fim.">
          <input type="date" value={fim} min={inicio || undefined} onChange={(e) => setFim(e.target.value)} className="field" />
        </Campo>
        <div className="rounded-xl border border-line bg-gray-50 p-3 text-[12.5px] sm:col-span-2">
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-gray-600">
            <span>
              Duração: <b className="text-ink">{duracaoTexto(inicio || null, fim || null) || "—"}</b>
            </span>
            <span>
              Hoje: <b className="text-ink">{c.emEquipe}</b> em equipe de <b className="text-ink">{c.posicoes}</b> posições
            </span>
          </div>
          {usos.length > 0 && (
            <ul className="mt-2 space-y-1 border-t border-line pt-2">
              {usos.map(({ u, v }) => {
                const conf = conferir(u);
                return (
                  <li key={u.id} className="flex flex-wrap items-center gap-2 text-[12px]">
                    <span className="font-semibold text-ink">{v!.identificacao}</span>
                    <span className="text-gray-500">
                      {u.inicio || u.fim ? `${u.inicio ? fmtDia(u.inicio) : "?"} → ${u.fim ? fmtDia(u.fim) : "?"}` : "sem datas"}
                    </span>
                    <span className={`${conf.nivel === "ok" ? "chip-ok" : conf.nivel === "atencao" ? "chip-warn" : "chip-mute"} !px-1.5 !py-0 !text-[10px]`}>{conf.texto}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        {invalido && (
          <div className="sm:col-span-2">
            <Aviso tipo="atencao">O fim não pode ser antes do início.</Aviso>
          </div>
        )}
        {erro && (
          <div className="sm:col-span-2">
            <Aviso tipo="erro">{erro}</Aviso>
          </div>
        )}
      </div>
      <RodapeModal>
        <button onClick={onFechar} className="btn-ghost">
          Cancelar
        </button>
        <button onClick={salvar} disabled={salvando || invalido} className="btn-primary">
          {salvando ? "Salvando…" : "Salvar período"}
        </button>
      </RodapeModal>
    </Modal>
  );
}
