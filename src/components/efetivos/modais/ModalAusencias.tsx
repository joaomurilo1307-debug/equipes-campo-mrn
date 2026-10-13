"use client";

import { useState } from "react";
import { useDados } from "../DadosContext";
import { corDaAusencia, diasDoPeriodo, fmtDia, situacaoDaAusencia, type Ausencia, type Vaga } from "../comum";
import { IcLapis, IcMais } from "../icones";
import { Modal } from "../ui";
import ModalAusencia from "./ModalAusencia";

/** Ausências de uma pessoa: lista, com corrigir/excluir e lançar nova. */
export default function ModalAusencias({ vaga, onFechar }: { vaga: Vaga; onFechar: () => void }) {
  const { dados, hoje, nomeDe } = useDados();
  const lista = dados.ausencias.filter((a) => a.vagaId === vaga.id).sort((a, b) => a.inicio.localeCompare(b.inicio));
  const [edicao, setEdicao] = useState<{ ausencia?: Ausencia } | null>(null);

  return (
    <>
      <Modal titulo={`Ausências — ${nomeDe(vaga)}`} subtitulo={vaga.cargo} onFechar={onFechar}>
        <div className="space-y-3 px-6 py-5">
          {lista.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm text-gray-500">Nenhuma ausência lançada para esta pessoa.</p>
          ) : (
            <ul className="divide-y divide-line rounded-xl border border-line">
              {lista.map((a) => {
                const sit = situacaoDaAusencia(a, hoje);
                return (
                  <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                    <span className="flex min-w-0 items-center gap-3">
                      <span className="h-8 w-1.5 shrink-0 rounded-full" style={{ background: corDaAusencia(a.tipo) }} />
                      <span className="min-w-0">
                        <span className="font-semibold">{a.tipo}</span>{" "}
                        <span className={sit === "em curso" ? "chip-warn" : sit === "futura" ? "chip-info" : "chip-mute"}>{sit}</span>
                        <span className="block text-xs text-gray-500">
                          {fmtDia(a.inicio)} a {fmtDia(a.fim)} · {diasDoPeriodo(a.inicio, a.fim)} dia(s)
                        </span>
                        {a.observacao && <span className="block text-[11px] text-gray-400">{a.observacao}</span>}
                      </span>
                    </span>
                    {dados.podeEditar && (
                      <button onClick={() => setEdicao({ ausencia: a })} className="btn-ghost btn-sm shrink-0">
                        <IcLapis tam={13} /> Corrigir
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {dados.podeEditar ? (
            <button onClick={() => setEdicao({})} className="btn-primary w-full">
              <IcMais tam={16} /> Lançar ausência
            </button>
          ) : (
            <p className="text-[11px] text-gray-400">O motivo da ausência é restrito a quem monta as equipes.</p>
          )}
        </div>
      </Modal>
      {edicao && <ModalAusencia ausencia={edicao.ausencia} vagaIds={[vaga.id]} onFechar={() => setEdicao(null)} />}
    </>
  );
}
