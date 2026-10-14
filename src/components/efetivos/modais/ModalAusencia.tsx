"use client";

import { useMemo, useState } from "react";
import { TIPOS_AUSENCIA, temNome } from "@/lib/efetivos/disponibilidade";
import { useDados } from "../DadosContext";
import { chamar, corDaAusencia, corDoContrato, diasDoPeriodo, fmtDia, hojeBr, rotuloContrato, type Ausencia } from "../comum";
import { IcLixo } from "../icones";
import { Aviso, Campo, Modal, PontoContrato, RodapeModal } from "../ui";

/**
 * Lança férias/atestado/afastamento etc. para uma ou várias pessoas de uma vez (ex.: férias coletivas),
 * ou corrige/exclui uma ausência já lançada.
 */
export default function ModalAusencia({
  ausencia,
  vagaIds,
  periodo,
  onFechar,
}: {
  ausencia?: Ausencia | null;
  vagaIds?: string[];
  periodo?: { inicio: string; fim: string };
  onFechar: () => void;
}) {
  const { dados, recarregar, vagaPorId, equipePorId, nomeDe } = useDados();
  const editando = !!ausencia;
  const [tipo, setTipo] = useState(ausencia?.tipo && ausencia.tipo !== "Ausente" ? ausencia.tipo : "Férias");
  const [inicio, setInicio] = useState(ausencia?.inicio ?? periodo?.inicio ?? hojeBr());
  const [fim, setFim] = useState(ausencia?.fim ?? periodo?.fim ?? hojeBr());
  const [obs, setObs] = useState(ausencia?.observacao ?? "");
  const [sel, setSel] = useState<Set<string>>(new Set(vagaIds ?? []));
  const [busca, setBusca] = useState("");
  const [equipeFiltro, setEquipeFiltro] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [avisos, setAvisos] = useState<string[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [concluido, setConcluido] = useState<string | null>(null);

  const pessoa = ausencia ? vagaPorId.get(ausencia.vagaId) : null;
  const pessoas = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return dados.vagas
      .filter((v) => temNome(v) && (!equipeFiltro || v.equipeId === equipeFiltro) && (!t || `${v.nome} ${v.cargo}`.toLowerCase().includes(t)))
      .sort((a, b) => (equipePorId.get(a.equipeId)?.codigo ?? "").localeCompare(equipePorId.get(b.equipeId)?.codigo ?? "") || (a.nome ?? "").localeCompare(b.nome ?? "", "pt-BR"));
  }, [dados.vagas, busca, equipeFiltro, equipePorId]);
  const porEquipe = useMemo(() => {
    const m = new Map<string, typeof pessoas>();
    for (const v of pessoas) {
      if (!m.has(v.equipeId)) m.set(v.equipeId, []);
      m.get(v.equipeId)!.push(v);
    }
    return [...m.entries()];
  }, [pessoas]);

  const alternar = (id: string) =>
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const marcar = (ids: string[], marcado: boolean) =>
    setSel((s) => {
      const n = new Set(s);
      ids.forEach((id) => (marcado ? n.add(id) : n.delete(id)));
      return n;
    });

  async function salvar() {
    setSalvando(true);
    setErro(null);
    setAvisos([]);
    if (editando) {
      const r = await chamar("PATCH", `/api/efetivos/ausencias/${ausencia!.id}`, { tipo, inicio, fim, observacao: obs || null });
      setSalvando(false);
      if (!r.ok) return setErro(r.dados.error ?? "Não foi possível salvar");
      const c = (r.dados as any).conflitos as string[];
      await recarregar();
      if (c?.length) {
        setAvisos([`${pessoa ? nomeDe(pessoa) : "A pessoa"} está escalada em ${c.join(", ")} nesse período. Ajuste a equipe da campanha.`]);
        setConcluido("Ausência corrigida.");
        return;
      }
      return onFechar();
    }
    const r = await chamar("POST", "/api/efetivos/ausencias", { vagaIds: [...sel], tipo, inicio, fim, observacao: obs || null });
    setSalvando(false);
    if (!r.ok) return setErro(r.dados.error ?? "Não foi possível lançar");
    const conflitos = ((r.dados as any).conflitos ?? []) as { pessoa: string; campanha: string }[];
    await recarregar();
    if (conflitos.length) {
      setAvisos(conflitos.map((c) => `${c.pessoa} já está escalado(a) em ${c.campanha} nesse período. Ajuste a equipe da campanha.`));
      setConcluido(`${(r.dados as any).criadas} ausência(s) lançada(s).`);
      return;
    }
    onFechar();
  }

  async function excluir() {
    if (!ausencia || !window.confirm("Excluir esta ausência? A pessoa volta a contar como disponível nesse período.")) return;
    setSalvando(true);
    const r = await chamar("DELETE", `/api/efetivos/ausencias/${ausencia.id}`);
    setSalvando(false);
    if (!r.ok) return setErro(r.dados.error ?? "Não foi possível excluir");
    await recarregar();
    onFechar();
  }

  const invalido = !inicio || !fim || fim < inicio || (!editando && sel.size === 0);
  return (
    <Modal
      titulo={editando ? "Corrigir ausência" : "Lançar ausência"}
      subtitulo={editando ? (pessoa ? `${nomeDe(pessoa)} · ${pessoa.cargo}` : undefined) : "Férias, atestado, afastamento… quem estiver ausente aparece como indisponível ao montar equipes."}
      onFechar={onFechar}
      largo={!editando}
    >
      <div className={`grid gap-5 px-6 py-5 ${editando ? "" : "lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]"}`}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Campo rotulo="Tipo" className="col-span-2">
              <div className="mt-1 flex flex-wrap gap-1.5">
                {TIPOS_AUSENCIA.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTipo(t)}
                    className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${tipo === t ? "border-transparent text-white" : "border-line bg-white text-gray-600 hover:bg-gray-50"}`}
                    style={tipo === t ? { background: corDaAusencia(t) } : undefined}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </Campo>
            <Campo rotulo="Início">
              <input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} className="field" />
            </Campo>
            <Campo rotulo="Fim (último dia fora)">
              <input type="date" value={fim} min={inicio} onChange={(e) => setFim(e.target.value)} className="field" />
            </Campo>
          </div>
          {inicio && fim && fim >= inicio && (
            <p className="text-xs text-gray-500">
              {diasDoPeriodo(inicio, fim)} dia(s) · volta em <strong className="text-ink">{fmtDia(new Date(Date.parse(`${fim}T00:00:00Z`) + 86400000).toISOString().slice(0, 10))}</strong>
            </p>
          )}
          <Campo rotulo="Observação (só quem edita vê)">
            <textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2} className="field" />
          </Campo>
        </div>

        {!editando && (
          <div className="min-w-0">
            <div className="mb-2 flex items-center justify-between">
              <span className="label">Quem vai ficar ausente ({sel.size})</span>
              {sel.size > 0 && (
                <button onClick={() => setSel(new Set())} className="text-xs font-semibold text-brand-dark hover:underline">
                  limpar
                </button>
              )}
            </div>
            <div className="mb-2 flex gap-2">
              <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="buscar nome ou função" className="field !mt-0" />
              <select value={equipeFiltro} onChange={(e) => setEquipeFiltro(e.target.value)} className="field !mt-0 !w-auto max-w-[180px]">
                <option value="">Todas as equipes</option>
                {dados.equipes.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.codigo} · {e.nome}
                  </option>
                ))}
              </select>
            </div>
            <div className="max-h-[50vh] space-y-3 overflow-y-auto rounded-xl border border-line p-3">
              {porEquipe.map(([eqId, lista]) => {
                const eq = equipePorId.get(eqId)!;
                const ids = lista.map((v) => v.id);
                const todos = ids.every((id) => sel.has(id));
                return (
                  <div key={eqId}>
                    <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                      <span className="flex min-w-0 items-center gap-1.5 font-semibold">
                        <PontoContrato cor={corDoContrato(eq.projeto)} tam={8} />
                        <span className="truncate">{eq.codigo} · {eq.nome}</span>
                        <span className="font-normal text-gray-400">{rotuloContrato(eq.projeto)}</span>
                      </span>
                      <button onClick={() => marcar(ids, !todos)} className="shrink-0 font-semibold text-brand-dark hover:underline">
                        {todos ? "desmarcar" : "marcar"} equipe toda
                      </button>
                    </div>
                    <div className="grid gap-1 sm:grid-cols-2">
                      {lista.map((v) => (
                        <label key={v.id} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm ${sel.has(v.id) ? "border-brand bg-brand-soft" : "border-line hover:bg-gray-50"}`}>
                          <input type="checkbox" checked={sel.has(v.id)} onChange={() => alternar(v.id)} className="accent-[#0A9E7F]" />
                          <span className="min-w-0">
                            <span className="block truncate font-medium">{nomeDe(v)}</span>
                            <span className="block truncate text-[11px] text-gray-500">{v.cargo}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
              {porEquipe.length === 0 && <p className="py-6 text-center text-sm text-gray-400">Ninguém encontrado.</p>}
            </div>
          </div>
        )}
      </div>

      {concluido && (
        <div className="px-6 pb-3">
          <Aviso tipo="ok">{concluido}</Aviso>
        </div>
      )}
      {avisos.length > 0 && (
        <div className="space-y-1.5 px-6 pb-3">
          {avisos.map((a, i) => (
            <Aviso key={i} tipo="atencao">
              {a}
            </Aviso>
          ))}
        </div>
      )}
      {erro && (
        <div className="px-6 pb-3">
          <Aviso tipo="erro">{erro}</Aviso>
        </div>
      )}
      <RodapeModal>
        {editando && !concluido && (
          <button onClick={excluir} disabled={salvando} className="btn-danger mr-auto">
            <IcLixo tam={15} /> Excluir
          </button>
        )}
        <button onClick={onFechar} className="btn-ghost">
          {concluido ? "Fechar" : "Cancelar"}
        </button>
        {!concluido && (
          <button onClick={salvar} disabled={salvando || invalido} className="btn-primary">
            {salvando ? "Salvando…" : editando ? "Salvar correção" : `Lançar${sel.size > 1 ? ` para ${sel.size} pessoas` : ""}`}
          </button>
        )}
      </RodapeModal>
    </Modal>
  );
}
