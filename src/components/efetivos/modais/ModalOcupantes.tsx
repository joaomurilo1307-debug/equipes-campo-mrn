"use client";

import { useMemo, useState } from "react";
import { temNome } from "@/lib/efetivos/disponibilidade";
import { useDados } from "../DadosContext";
import { chamar, type Vaga, type Veiculo } from "../comum";
import { Aviso, Modal, RodapeModal } from "../ui";

/** Quem vai em cada viatura (a coluna CARROS da planilha). Marcar quem for; quem estava em outro carro passa para este. */
export default function ModalOcupantes({ veiculo, equipeId, onFechar }: { veiculo: Veiculo; equipeId: string; onFechar: () => void }) {
  const { dados, recarregar, vagasPorEquipe, equipePorId, veiculoPorId, nomeDe } = useDados();
  const equipe = equipePorId.get(equipeId);
  const [sel, setSel] = useState<Set<string>>(() => new Set(dados.vagas.filter((v) => v.veiculoId === veiculo.id).map((v) => v.id)));
  const [outras, setOutras] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const daEquipe = useMemo(() => vagasPorEquipe.get(equipeId) ?? [], [vagasPorEquipe, equipeId]);
  const deOutras = useMemo(() => dados.vagas.filter((v) => v.equipeId !== equipeId && temNome(v)), [dados.vagas, equipeId]);

  const alternar = (id: string) =>
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  async function salvar() {
    setSalvando(true);
    setErro(null);
    const atuais = new Set(dados.vagas.filter((v) => v.veiculoId === veiculo.id).map((v) => v.id));
    const mudancas: { id: string; veiculoId: string | null }[] = [];
    for (const id of sel) if (!atuais.has(id)) mudancas.push({ id, veiculoId: veiculo.id });
    for (const id of atuais) if (!sel.has(id)) mudancas.push({ id, veiculoId: null });
    for (const m of mudancas) {
      const r = await chamar("PATCH", `/api/efetivos/vagas/${m.id}`, { veiculoId: m.veiculoId });
      if (!r.ok) {
        setSalvando(false);
        await recarregar();
        return setErro(r.dados.error ?? "Não foi possível salvar");
      }
    }
    await recarregar();
    onFechar();
  }

  const linha = (v: Vaga) => {
    const outroCarro = v.veiculoId && v.veiculoId !== veiculo.id ? veiculoPorId.get(v.veiculoId)?.identificacao : null;
    return (
      <label key={v.id} className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-1.5 text-[13px] ${sel.has(v.id) ? "border-brand bg-brand-soft" : "border-line hover:bg-gray-50"}`}>
        <input type="checkbox" checked={sel.has(v.id)} onChange={() => alternar(v.id)} className="accent-[#0A9E7F]" />
        <span className="min-w-0 flex-1">
          <span className={`block truncate ${temNome(v) ? "font-medium" : "italic text-gray-400"}`}>{temNome(v) ? nomeDe(v) : "vaga aberta"}</span>
          <span className="block truncate text-[11px] text-gray-500">{v.cargo}</span>
        </span>
        {v.direcao4x4 && <span className="chip-info">4x4</span>}
        {outroCarro && !sel.has(v.id) && <span className="chip-mute">em {outroCarro}</span>}
      </label>
    );
  };

  return (
    <Modal titulo={`Quem vai na ${veiculo.identificacao}`} subtitulo={equipe ? equipe.nome : undefined} onFechar={onFechar}>
      <div className="space-y-4 px-6 py-5">
        <div className="grid gap-1.5 sm:grid-cols-2">{daEquipe.map(linha)}</div>
        {daEquipe.length === 0 && <p className="text-sm text-gray-500">Esta equipe ainda não tem pessoas.</p>}
        <label className="flex items-center gap-2 text-xs text-gray-600">
          <input type="checkbox" checked={outras} onChange={(e) => setOutras(e.target.checked)} className="accent-[#0A9E7F]" /> incluir pessoas de outras equipes
        </label>
        {outras && <div className="grid max-h-56 gap-1.5 overflow-y-auto sm:grid-cols-2">{deOutras.map(linha)}</div>}
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
      </div>
      <RodapeModal>
        <span className="mr-auto text-xs text-gray-500">{sel.size} na viatura</span>
        <button onClick={onFechar} className="btn-ghost">
          Cancelar
        </button>
        <button onClick={salvar} disabled={salvando} className="btn-primary">
          {salvando ? "Salvando…" : "Salvar"}
        </button>
      </RodapeModal>
    </Modal>
  );
}
