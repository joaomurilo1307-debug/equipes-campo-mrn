"use client";

import { useMemo, useState } from "react";
import { bloqueiosNoPeriodo, indexar, livresNoPeriodo, ordenarGrupos, trechosLivres, type Dia } from "@/lib/efetivos/disponibilidade";
import { useDados } from "../DadosContext";
import { MOTIVO_CONFLITO, chamar, corDaAusencia, corDoContrato, fmtDia, fmtDiaCurto, rotuloContrato, somarDias, type Campanha } from "../comum";
import { Aviso, Modal, PontoContrato, RodapeModal } from "../ui";

/**
 * "Montar equipe": mostra quem está livre em TODOS os dias da campanha e, logo abaixo, quem NÃO está
 * (férias, atestado, outro contrato, outra campanha) com as datas e a volta. Quem volta no meio da
 * campanha pode ser escalado só no trecho em que está livre. Não há composição mínima nem máxima.
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
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [conflitos, setConflitos] = useState<{ nome: string | null; motivo: string }[]>([]);

  const ini = campanha.inicio;
  const fim = campanha.fim;
  const { livres, indisponiveis } = useMemo(() => livresNoPeriodo(regra, ini, fim, { ignorarCampanhaId: campanha.id, grupo: grupo || null }), [regra, ini, fim, campanha.id, grupo]);
  const todosLivres = useMemo(() => livresNoPeriodo(regra, ini, fim, { ignorarCampanhaId: campanha.id }).livres, [regra, ini, fim, campanha.id]);
  const idxSemEla = useMemo(() => indexar(regra, campanha.id), [regra, campanha.id]);

  const [sel, setSel] = useState<Set<string>>(() => {
    const atuais = dados.alocacoes.filter((a) => a.campanhaId === campanha.id).map((a) => a.vagaId);
    if (atuais.length > 0 || !preselecionarEquipeId) return new Set(atuais);
    // vindo do Quadro (arrastar sobre a linha da equipe): já marca quem da equipe está livre
    return new Set(todosLivres.filter((p) => p.equipeId === preselecionarEquipeId).map((p) => p.id));
  });
  // periodo proprio de quem entra so em um trecho (volta de ferias no meio da campanha etc.)
  const [periodos, setPeriodos] = useState<Record<string, { inicio: Dia; fim: Dia }>>(() => {
    const m: Record<string, { inicio: Dia; fim: Dia }> = {};
    for (const a of dados.alocacoes) if (a.campanhaId === campanha.id && (a.inicio !== ini || a.fim !== fim)) m[a.vagaId] = { inicio: a.inicio, fim: a.fim };
    return m;
  });

  const empresas = Array.from(new Set(dados.vagas.map((v) => v.empresa))).sort();
  const cargos = Array.from(new Set(dados.vagas.map((v) => v.cargo))).sort();
  const filtra = (p: { nome: string | null; equipeId: string; empresa: string; cargo: string }) =>
    (!equipeId || p.equipeId === equipeId) &&
    (!empresa || p.empresa === empresa) &&
    (!cargo || p.cargo === cargo) &&
    (!busca.trim() || (p.nome ?? "").toLowerCase().includes(busca.trim().toLowerCase()));

  const livresFiltrados = livres.filter(filtra);

  // quem nao esta livre no periodo inteiro: motivos com datas e os trechos em que da para escalar
  const foraDoPeriodo = useMemo(() => {
    return indisponiveis
      .filter(filtra)
      .map((p) => {
        const v = vagaPorId.get(p.id)!;
        const bloqueios = bloqueiosNoPeriodo(v, idxSemEla, ini, fim);
        const trechos = trechosLivres(v, idxSemEla, ini, fim);
        return { p, v, bloqueios, trechos };
      })
      .sort((a, b) => b.trechos.length - a.trechos.length || (a.p.nome ?? "").localeCompare(b.p.nome ?? "", "pt-BR"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indisponiveis, idxSemEla, ini, fim, equipeId, empresa, cargo, busca, vagaPorId]);

  const resumoFora = useMemo(() => {
    const c = new Map<string, number>();
    for (const x of foraDoPeriodo) {
      const principal = x.bloqueios[0];
      const rotulo = !principal ? "indisponível" : principal.origem === "ausencia" ? principal.tipo.toLowerCase() : principal.origem === "campanha" ? "em outra campanha" : principal.origem === "outro_contrato" ? "em outro contrato" : principal.tipo.toLowerCase();
      c.set(rotulo, (c.get(rotulo) ?? 0) + 1);
    }
    return [...c.entries()].sort((a, b) => b[1] - a[1]);
  }, [foraDoPeriodo]);

  const equipesLista = useMemo(() => {
    const ids = new Set<string>([...livresFiltrados.map((p) => p.equipeId), ...foraDoPeriodo.map((x) => x.p.equipeId)]);
    return [...ids].sort((a, b) => (equipePorId.get(a)?.codigo ?? "").localeCompare(equipePorId.get(b)?.codigo ?? ""));
  }, [livresFiltrados, foraDoPeriodo, equipePorId]);

  const idsLivres = new Set(todosLivres.map((p) => p.id));
  const foraDaLista = [...sel].filter((id) => !idsLivres.has(id) && !periodos[id]);
  const composicao = useMemo(() => {
    const c = new Map<string, number>();
    for (const id of sel) {
      const v = vagaPorId.get(id);
      if (v) c.set(v.cargo, (c.get(v.cargo) ?? 0) + 1);
    }
    return [...c.entries()].sort((a, b) => b[1] - a[1]);
  }, [sel, vagaPorId]);

  const alternar = (id: string) => {
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
    setPeriodos((m) => {
      if (!m[id]) return m;
      const { [id]: _, ...resto } = m;
      return resto;
    });
  };
  const marcar = (ids: string[], marcado: boolean) => {
    setSel((s) => {
      const n = new Set(s);
      ids.forEach((id) => (marcado ? n.add(id) : n.delete(id)));
      return n;
    });
    setPeriodos((m) => {
      const c = { ...m };
      ids.forEach((id) => delete c[id]);
      return c;
    });
  };
  const escalarTrecho = (id: string, t: { inicio: Dia; fim: Dia }) => {
    setSel((s) => new Set(s).add(id));
    setPeriodos((m) => ({ ...m, [id]: t }));
  };

  async function salvar() {
    setSalvando(true);
    setErro(null);
    setConflitos([]);
    const usados = Object.fromEntries(Object.entries(periodos).filter(([id]) => sel.has(id)));
    const r = await chamar("PUT", `/api/efetivos/campanhas/${campanha.id}/alocacoes`, { vagaIds: [...sel], periodos: usados });
    setSalvando(false);
    if (!r.ok) {
      setErro(r.dados.error ?? "Não foi possível gravar a equipe");
      setConflitos((r.dados.conflitos ?? []).map((c: any) => ({ nome: c.nome, motivo: MOTIVO_CONFLITO[c.motivo] ?? c.motivo })));
      return;
    }
    await recarregar();
    await onSalvo();
  }

  const select = "field";
  return (
    <Modal
      titulo={`Montar equipe — ${campanha.codigo}`}
      subtitulo={`${rotuloContrato(campanha.projeto)} · ${campanha.grupo} · ${campanha.atividade} · ${fmtDia(campanha.inicio)} a ${fmtDia(campanha.fim)} · pede ${campanha.qtdEquipes} equipe${campanha.qtdEquipes > 1 ? "s" : ""}`}
      onFechar={onFechar}
      largo
    >
      <div className="px-6 pt-4">
        <Aviso tipo="info">
          Em cima, quem está livre em <strong>todos</strong> os dias da campanha. Embaixo, quem <strong>não está</strong> (férias, atestado, outro contrato, outra campanha), com as datas e a volta — e, para quem volta no meio, dá para escalar só o trecho livre. Sem composição mínima nem máxima.
        </Aviso>
      </div>

      <div className="flex flex-wrap items-end gap-3 px-6 py-4">
        <label className="text-xs">
          <span className="label">Grupo</span>
          <select value={grupo} onChange={(e) => setGrupo(e.target.value)} className={select}>
            <option value="">Todos</option>
            {grupos.map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          <span className="label">Equipe-base</span>
          <select value={equipeId} onChange={(e) => setEquipeId(e.target.value)} className={select}>
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
          <select value={empresa} onChange={(e) => setEmpresa(e.target.value)} className={select}>
            <option value="">Todas</option>
            {empresas.map((e) => (
              <option key={e}>{e}</option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          <span className="label">Função</span>
          <select value={cargo} onChange={(e) => setCargo(e.target.value)} className={select}>
            <option value="">Todas</option>
            {cargos.map((e) => (
              <option key={e}>{e}</option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          <span className="label">Nome</span>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} className={select} />
        </label>
      </div>

      <div className="grid gap-5 px-6 pb-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="max-h-[56vh] space-y-5 overflow-y-auto rounded-xl border border-line p-4">
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-gray-600">
            <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full bg-ok" /> <strong className="num">{livresFiltrados.length}</strong> livres no período todo</span>
            <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full bg-warn" /> <strong className="num">{foraDoPeriodo.length}</strong> não estão livres</span>
            {resumoFora.length > 0 && <span className="text-gray-500">({resumoFora.map(([r, n]) => `${n} ${r}`).join(" · ")})</span>}
          </p>
          {equipesLista.map((eqId) => {
            const eq = equipePorId.get(eqId)!;
            const pessoas = livresFiltrados.filter((p) => p.equipeId === eqId);
            const fora = foraDoPeriodo.filter((x) => x.p.equipeId === eqId);
            const ids = pessoas.map((p) => p.id);
            const todos = ids.length > 0 && ids.every((id) => sel.has(id) && !periodos[id]);
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
                  {ids.length > 0 && (
                    <button onClick={() => marcar(ids, !todos)} className="shrink-0 font-semibold text-brand-dark hover:underline">
                      {todos ? "desmarcar" : "marcar"} os {ids.length} livres
                    </button>
                  )}
                </div>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {pessoas.map((p) => {
                    const marcado = sel.has(p.id);
                    return (
                      <label key={p.id} className={`flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2 text-[13px] transition-colors ${marcado ? "border-brand bg-brand-soft" : "border-line hover:bg-gray-50"}`}>
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
                  {fora.map(({ p, bloqueios, trechos }) => {
                    const marcadoTrecho = periodos[p.id];
                    return (
                      <div key={p.id} className={`rounded-lg border px-3 py-2 text-[13px] ${marcadoTrecho ? "border-brand bg-brand-soft" : "border-line bg-gray-50"}`}>
                        <div className="truncate font-medium text-gray-700">{p.nome}</div>
                        <div className="truncate text-[11px] text-gray-500">{p.cargo}</div>
                        <ul className="mt-1 space-y-0.5">
                          {bloqueios.slice(0, 3).map((b, i) => {
                            const cod = b.campanhaId ? campanhaPorId.get(b.campanhaId)?.codigo : null;
                            const cor = b.origem === "ausencia" ? corDaAusencia(b.tipo) : b.origem === "outro_contrato" ? "#1D6FB8" : b.origem === "campanha" ? "#0A9E7F" : "#C9342B";
                            return (
                              <li key={i} className="flex flex-wrap items-center gap-1.5 text-[11.5px]">
                                <span className="inline-block h-2 w-2 shrink-0 rounded-sm" style={{ background: cor }} />
                                <span className="font-semibold" style={{ color: cor }}>
                                  {cod ? `Em ${cod}` : b.tipo}
                                </span>
                                <span className="text-gray-500">
                                  {b.origem === "status" ? "sem previsão de volta" : `${fmtDiaCurto(b.inicio)}–${fmtDiaCurto(b.fim)}${b.fim < fim ? ` · volta ${fmtDiaCurto(somarDias(b.fim, 1))}` : ""}`}
                                </span>
                              </li>
                            );
                          })}
                          {bloqueios.length > 3 && <li className="text-[11px] text-gray-400">+ {bloqueios.length - 3} outro(s)</li>}
                        </ul>
                        {trechos.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {trechos.slice(0, 3).map((t) => {
                              const ativo = marcadoTrecho && marcadoTrecho.inicio === t.inicio && marcadoTrecho.fim === t.fim;
                              return (
                                <button
                                  key={t.inicio}
                                  onClick={() => (ativo ? alternar(p.id) : escalarTrecho(p.id, t))}
                                  className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${ativo ? "border-brand bg-brand text-white" : "border-line bg-white text-brand-dark hover:bg-brand-soft"}`}
                                  title="Escalar só neste trecho, em que a pessoa está livre"
                                >
                                  {ativo ? "✓ " : "+ "}só {fmtDiaCurto(t.inicio)} a {fmtDiaCurto(t.fim)}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {equipesLista.length === 0 && <p className="py-8 text-center text-sm text-gray-400">Ninguém encontrado com esses filtros.</p>}
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
            <div className="mt-3 text-[11px] text-gray-400">{todosLivres.length} pessoas livres no período todo (todos os grupos)</div>
          </div>

          {Object.keys(periodos).filter((id) => sel.has(id)).length > 0 && (
            <div className="rounded-xl border border-brand/30 bg-brand-soft p-3 text-xs">
              <div className="font-semibold text-brand-dark">Escaladas só em um trecho</div>
              <ul className="mt-1.5 space-y-1">
                {Object.entries(periodos)
                  .filter(([id]) => sel.has(id))
                  .map(([id, t]) => (
                    <li key={id} className="flex items-center justify-between gap-2">
                      <span className="truncate">
                        {vagaPorId.get(id)?.nome} · {fmtDiaCurto(t.inicio)}–{fmtDiaCurto(t.fim)}
                      </span>
                      <button onClick={() => alternar(id)} className="shrink-0 rounded border border-brand/30 px-1.5 py-0.5 hover:bg-white">
                        tirar
                      </button>
                    </li>
                  ))}
              </ul>
            </div>
          )}

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
