"use client";

import { useState } from "react";
import { TIPOS_AUSENCIA } from "@/lib/efetivos/disponibilidade";
import { useDados } from "../DadosContext";
import { chamar, fmtDia, hojeBr, type Vaga } from "../comum";
import { Aviso, Campo, Modal } from "../ui";

/** Lista as ausências da pessoa e lança novas (pode abrir já com o período arrastado no quadro). */
export default function ModalAusencias({ vaga, periodo, onFechar }: { vaga: Vaga; periodo?: { inicio: string; fim: string }; onFechar: () => void }) {
  const { dados, recarregar, nomeDe } = useDados();
  const lista = dados.ausencias.filter((a) => a.vagaId === vaga.id).sort((a, b) => a.inicio.localeCompare(b.inicio));
  const [f, setF] = useState({ tipo: "Férias", inicio: periodo?.inicio ?? hojeBr(), fim: periodo?.fim ?? hojeBr(), observacao: "" });
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function adicionar() {
    setOcupado(true);
    setErro(null);
    setAviso(null);
    const r = await chamar("POST", "/api/efetivos/ausencias", { vagaId: vaga.id, tipo: f.tipo, inicio: f.inicio, fim: f.fim, observacao: f.observacao || null });
    setOcupado(false);
    if (!r.ok) return setErro(r.dados.error ?? "Não foi possível lançar");
    const conflitos = (r.dados as any).conflitos as string[] | undefined;
    if (conflitos?.length) setAviso(`Atenção: ${nomeDe(vaga)} está escalado(a) em ${conflitos.join(", ")} nesse período. Ajuste a equipe da campanha.`);
    await recarregar();
  }
  async function remover(id: string) {
    setOcupado(true);
    const r = await chamar("DELETE", `/api/efetivos/ausencias/${id}`);
    setOcupado(false);
    if (!r.ok) return setErro(r.dados.error ?? "Não foi possível remover");
    await recarregar();
  }

  return (
    <Modal titulo={`Ausências — ${nomeDe(vaga)}`} subtitulo={vaga.cargo} onFechar={onFechar}>
      <div className="space-y-4 px-6 py-5">
        {lista.length === 0 ? (
          <p className="text-sm text-gray-400">Nenhuma ausência lançada.</p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {lista.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-2">
                <span>
                  <span className="font-semibold text-ink">{a.tipo}</span> <span className="text-gray-500">· {fmtDia(a.inicio)} a {fmtDia(a.fim)}</span>
                  {a.observacao && <span className="block text-[11px] text-gray-400">{a.observacao}</span>}
                </span>
                {dados.podeEditar && (
                  <button onClick={() => remover(a.id)} disabled={ocupado} className="btn-ghost btn-sm">
                    remover
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {dados.podeEditar && (
          <div className="grid gap-3 rounded-xl border border-line bg-gray-50 p-4 sm:grid-cols-4">
            <Campo rotulo="Tipo">
              <select value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })} className="field">
                {TIPOS_AUSENCIA.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </Campo>
            <Campo rotulo="Início">
              <input type="date" value={f.inicio} onChange={(e) => setF({ ...f, inicio: e.target.value })} className="field" />
            </Campo>
            <Campo rotulo="Fim">
              <input type="date" value={f.fim} min={f.inicio} onChange={(e) => setF({ ...f, fim: e.target.value })} className="field" />
            </Campo>
            <div className="flex items-end">
              <button onClick={adicionar} disabled={ocupado || !f.inicio || !f.fim || f.fim < f.inicio} className="btn-primary w-full">
                Lançar
              </button>
            </div>
          </div>
        )}
        {aviso && <Aviso tipo="atencao">{aviso}</Aviso>}
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
        {!dados.podeEditar && <p className="text-[11px] text-gray-400">O motivo da ausência é restrito a quem monta as equipes.</p>}
      </div>
    </Modal>
  );
}
