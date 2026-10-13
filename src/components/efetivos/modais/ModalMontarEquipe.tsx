"use client";

import { useMemo, useState } from "react";
import { livresNoPeriodo, ordenarGrupos } from "@/lib/efetivos/disponibilidade";
import { useDados } from "../DadosContext";
import { MOTIVO_CONFLITO, chamar, corDoContrato, fmtDia, rotuloContrato, type Campanha } from "../comum";
import { Aviso, Modal, PontoContrato, RodapeModal } from "../ui";

/**
 * "Montar equipe": mostra só quem está livre em TODOS os dias da campanha e grava exatamente o
 * conjunto escolhido. Não há composição mínima nem máxima.
 */
export default function ModalMontarEquipe({
  campanha,
  preselecionarEquipeId,
  onFechar,
  onSalvo,
}: {
  campanha: Campanha;
  preselecionarEquipeId?: string;
  onFechar: () => void;
  onSalvo: () => void | Promise<void>;
}) {
  const { dados, regra, recarregar, vagaPorId, equipePorId, campanhaPorId } = useDados();
  const grupos = ordenarGrupos(dados.equipes.map((e) => e.grupo));
  const [grupo, setGrupo] = useState(campanha.grupo);
  const [equipeId, setEquipeId] = useState("");
  const [empresa, setEmpresa] = useState("");
  const [cargo, setCargo] = useState("");
  const [busca, setBusca] = useState("");
  const [verIndisponiveis, setVerIndisponiveis] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [conflitos, setConflitos] = useState<{ nome: string | null; motivo: string }[]>([]);

  const { livres, indisponiveis } = useMemo(
    () => livresNoPeriodo(regra, campanha.inicio, campanha.fim, { ignorarCampanhaId: campanha.id, grupo: grupo || null }),
    [regra, campanha.inicio, campanha.fim, campanha.id, grupo]
  );
  const todosLivres = useMemo(() => livresNoPeriodo(regra, campanha.inicio, campanha.fim, { ignorarCampanhaId: campanha.id }).livres, [regra, campanha.inicio, campanha.fim, campanha.id]);

  const [sel, setSel] = useState<Set<string>>(() => {
    const atuais = dados.alocacoes.filter((a) => a.campanhaId === campanha.id).map((a) => a.vagaId);
    if (atuais.length > 0 || !preselecionarEquipeId) return new Set(atuais);
    // vindo do Quadro (arrastar sobre a linha da equipe): já marca quem da equipe está livre
    return new Set(todosLivres.filter((p) => p.equipeId === preselecionarEquipeId).map((p) => p.id));
  });

  const empresas = Array.from(new Set(dados.vagas.map((v) => v.empresa))).sort();
  const cargos = Array.from(new Set(dados.vagas.map((v) => v.cargo))).sort();
  const filtra = (p: { nome: string | null; equipeId: string; empresa: string; cargo: string }) =>
    (!equipeId || p.equipeId === equipeId) &&
    (!empresa || p.empresa === empresa) &&
    (!cargo || p.cargo === cargo) &&
    (!busca.trim() || (p.nome ?? "").toLowerCase().includes(busca.trim().toLowerCase()));

  const livresFiltrados = livres.filter(filtra);
  const porEquipe = useMemo(() => {
    const m = new Map<string, typeof livresFiltrados>();
    for (const p of livresFiltrados) {
      if (!m.has(p.equipeId)) m.set(p.equipeId, []);
      m.get(p.equipeId)!.push(p);
    }
    return [...m.entries()];
  }, [livresFiltrados]);

  const idsLivres = new Set(todosLivres.map((p) => p.id));
  const foraDaLista = [...sel].filter((id) => !idsLivres.has(id));
  const composicao = useMemo(() => {
    const c = new Map<string, number>();
    for (const id of sel) {
      const v = vagaPorId.get(id);
      if (v) c.set(v.cargo, (c.get(v.cargo) ?? 0) + 1);
    }
    return [...c.entries()].sort((a, b) => b[1] - a[1]);
  }, [sel, vagaPorId]);

  const alternar = (id: string) =>
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const marcar = (ids: string[], marcar: boolean) =>
    setSel((s) => {
      const n = new Set(s);
      ids.forEach((id) => (marcar ? n.add(id) : n.delete(id)));
      return n;
    });

  async function salvar() {
    setSalvando(true);
    setErro(null);
    setConflitos([]);
    const r = await chamar("PUT", `/api/efetivos/campanhas/${campanha.id}/alocacoes`, { vagaIds: [...sel] });
    setSalvando(false);
    if (!r.ok) {
      setErro(r.dados.error ?? "Não foi possível gravar a equipe");
      setConflitos((r.dados.conflitos ?? []).map((c: any) => ({ nome: c.nome, motivo: MOTIVO_CONFLITO[c.motivo] ?? c.motivo })));
      return;
    }
    await recarregar();
    await onSalvo();
  }

  return (
    <Modal
      titulo={`Montar equipe — ${campanha.codigo}`}
      subtitulo={`${rotuloContrato(campanha.projeto)} · ${campanha.grupo} · ${campanha.atividade} · ${fmtDia(campanha.inicio)} a ${fmtDia(campanha.fim)} · pede ${campanha.qtdEquipes} equipe${campanha.qtdEquipes > 1 ? "s" : ""}`}
      onFechar={onFechar}
      largo
    >
      <div className="px-6 pt-4">
        <Aviso tipo="info">
          Aparece só quem está livre em <strong>todos</strong> os dias do período: sem férias, atestado, afastamento, outro contrato nem outra campanha. Escolha quem quiser — não há composição mínima nem máxima.
        </Aviso>
      </div>

      <div className="flex flex-wrap items-end gap-3 px-6 py-4">
        <label className="text-xs">
          <span className="label">Grupo</span>
          <select value={grupo} onChange={(e) => setGrupo(e.target.value)} className="field">
            <option value="">Todos</option>
            {grupos.map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          <span className="label">Equipe-base</span>
          <select value={equipeId} onChange={(e) => setEquipeId(e.target.value)} className="field">
            <option value="">Todas</option>
            {dados.equipes
              .filter((e) => !grupo || e.grupo === grupo)
              .map((e) => (
                <option key={e.id} value={e.id}>
                  {e.codigo} · {e.nome}
                </option>
              ))}
          </select>
        </label>
        <label className="text-xs">
          <span className="label">Empresa</span>
          <select value={empresa} onChange={(e) => setEmpresa(e.target.value)} className="field">
            <option value="">Todas</option>
            {empresas.map((e) => (
              <option key={e}>{e}</option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          <span className="label">Função</span>
          <select value={cargo} onChange={(e) => setCargo(e.target.value)} className="field">
            <option value="">Todas</option>
            {cargos.map((e) => (
              <option key={e}>{e}</option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          <span className="label">Nome</span>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} className="field" />
        </label>
        <label className="flex items-center gap-2 pb-2 text-xs text-gray-600">
          <input type="checkbox" checked={verIndisponiveis} onChange={(e) => setVerIndisponiveis(e.target.checked)} className="accent-[#0A9E7F]" /> mostrar quem não está livre
        </label>
      </div>

      <div className="grid gap-5 px-6 pb-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="max-h-[50vh] space-y-4 overflow-y-auto rounded-xl border border-line p-4">
          {porEquipe.map(([eqId, pessoas]) => {
            const eq = equipePorId.get(eqId)!;
            const ids = pessoas.map((p) => p.id);
            const todos = ids.every((id) => sel.has(id));
            return (
              <div key={eqId}>
                <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
                  <span className="flex min-w-0 items-center gap-2 font-semibold text-ink">
                    <PontoContrato cor={corDoContrato(eq.projeto)} tam={9} />
                    <span className="truncate">
                      {eq.codigo} · {eq.nome}
                    </span>
                    <span className="font-normal text-gray-400">{rotuloContrato(eq.projeto)}</span>
                  </span>
                  <button onClick={() => marcar(ids, !todos)} className="shrink-0 font-semibold text-brand-dark hover:underline">
                    {todos ? "desmarcar" : "marcar"} os {ids.length} livres
                  </button>
                </div>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {pessoas.map((p) => {
                    const marcado = sel.has(p.id);
                    return (
                      <label key={p.id} className={`flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2 text-sm transition-colors ${marcado ? "border-brand bg-brand-soft" : "border-line hover:bg-gray-50"}`}>
                        <input type="checkbox" checked={marcado} onChange={() => alternar(p.id)} className="mt-0.5 accent-[#0A9E7F]" />
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-ink">{p.nome}</span>
                          <span className="block text-[11px] text-gray-500">
                            {p.cargo} · {p.empresa}
                            {vagaPorId.get(p.id)?.direcao4x4 ? " · dirige 4x4" : ""}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {porEquipe.length === 0 && <p className="py-10 text-center text-sm text-gray-400">Ninguém livre neste período com esses filtros.</p>}

          {verIndisponiveis && (
            <div className="border-t border-dashed border-line pt-4">
              <div className="mb-2 text-xs font-semibold text-gray-500">Não estão livres no período</div>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {indisponiveis.filter(filtra).map((p) => {
                  const outra = p.campanhaId ? campanhaPorId.get(p.campanhaId)?.codigo : null;
                  return (
                    <div key={p.id} className="rounded-lg border border-line bg-gray-50 px-3 py-2 text-sm text-gray-400">
                      <span className="block truncate">{p.nome}</span>
                      <span className="block text-[11px]">
                        {p.situacao === "ALOCADA" ? (outra ? `em ${outra}` : p.motivo ?? "ocupado") : p.motivo ?? "ausente"} · {p.equipeCodigo}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <aside className="space-y-3">
          <div className="rounded-xl border border-line bg-gray-50 p-4">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Equipe da campanha</div>
            <div className="num mt-1 font-display text-4xl font-semibold text-ink">{sel.size}</div>
            <div className="text-xs text-gray-500">pessoa{sel.size === 1 ? "" : "s"} escalada{sel.size === 1 ? "" : "s"}</div>
            <ul className="mt-3 space-y-1 text-xs text-gray-600">
              {composicao.map(([c, n]) => (
                <li key={c} className="flex justify-between gap-2">
                  <span className="truncate">{c}</span>
                  <span className="num font-semibold">{n}</span>
                </li>
              ))}
            </ul>
            <div className="mt-3 text-[11px] text-gray-400">{todosLivres.length} pessoas livres no período (todos os grupos)</div>
          </div>
          {foraDaLista.length > 0 && (
            <Aviso tipo="atencao">
              <div className="font-semibold">Escalados que deixaram de estar livres</div>
              <ul className="mt-1 space-y-1 text-xs">
                {foraDaLista.map((id) => (
                  <li key={id} className="flex items-center justify-between gap-2">
                    <span>{vagaPorId.get(id)?.nome ?? id}</span>
                    <button onClick={() => alternar(id)} className="rounded border border-warn/30 px-1.5 py-0.5 hover:bg-white">
                      remover
                    </button>
                  </li>
                ))}
              </ul>
            </Aviso>
          )}
        </aside>
      </div>

      {erro && (
        <div className="px-6 pb-4">
          <Aviso tipo="erro">
            {erro}
            {conflitos.length > 0 && (
              <ul className="mt-1 list-disc pl-5 text-xs">
                {conflitos.map((c, i) => (
                  <li key={i}>
                    {c.nome}: {c.motivo}
                  </li>
                ))}
              </ul>
            )}
          </Aviso>
        </div>
      )}
      <RodapeModal>
        <span className="mr-auto text-xs text-gray-400">Tudo fica no histórico.</span>
        <button onClick={onFechar} className="btn-ghost">
          Cancelar
        </button>
        <button onClick={salvar} disabled={salvando} className="btn-primary">
          {salvando ? "Gravando…" : `Gravar equipe (${sel.size})`}
        </button>
      </RodapeModal>
    </Modal>
  );
}
