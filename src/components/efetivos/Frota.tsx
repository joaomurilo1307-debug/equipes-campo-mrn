"use client";

import { Fragment, useMemo, useState } from "react";
import { temNome } from "@/lib/efetivos/disponibilidade";
import { STATUS_VEICULO, diasNoLocal, localizacaoNoDia, proximoMovimento, type MovimentoBase } from "@/lib/efetivos/veiculos";
import { useDados } from "./DadosContext";
import { A_DEFINIR, CHIP_VEICULO, corDoContrato, fmtDia, rotuloContrato, type Equipe, type Veiculo } from "./comum";
import { IcMais } from "./icones";
import { ModalHistoricoVeiculo, ModalMover, ModalVeiculo } from "./modais/ModaisVeiculo";
import ModalOcupantes from "./modais/ModalOcupantes";
import { CabecalhoPagina, PontoContrato, Vazio } from "./ui";

const SEM_EQUIPE = "Sem equipe";
const VARIOS = "Em mais de um contrato";

/**
 * Frota: cada viatura aparece UMA vez. A mesma caminhonete costuma ser a "VL 01" de várias equipes: ela é uma só, e a coluna
 * "Equipes que usam" mostra todas. Se alguém registrou uma passagem (Mover), vale a passagem; senão vale onde as pessoas vão.
 */
export default function Frota() {
  const { dados, hoje, equipePorId, equipesPorVeiculo, ocupantesPorVeiculo, nomeDe, contratoNoDia } = useDados();
  const [dia, setDia] = useState(hoje);
  const [filtroContrato, setFiltroContrato] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("");
  const [busca, setBusca] = useState("");
  const [modal, setModal] = useState<{ t: "mover" | "historico" | "editar" | "ocupantes"; v: Veiculo } | { t: "novo" } | null>(null);

  const movimentosPorVeiculo = useMemo(() => {
    const m = new Map<string, MovimentoBase[]>();
    for (const x of dados.movimentos) {
      if (!m.has(x.veiculoId)) m.set(x.veiculoId, []);
      m.get(x.veiculoId)!.push(x);
    }
    return m;
  }, [dados.movimentos]);

  const todas = useMemo(
    () =>
      dados.veiculos.map((v) => {
        const movs = movimentosPorVeiculo.get(v.id) ?? [];
        const loc = localizacaoNoDia(movs, dia);
        const ids = loc?.equipeId ? [loc.equipeId] : equipesPorVeiculo.get(v.id) ?? [];
        const equipes = ids.map((id) => equipePorId.get(id)).filter((e): e is Equipe => !!e);
        const contratos = [...new Set(equipes.map((e) => contratoNoDia(e, dia) || A_DEFINIR))];
        const grupo = equipes.length === 0 ? SEM_EQUIPE : contratos.length === 1 ? contratos[0] : VARIOS;
        return { v, loc, prox: proximoMovimento(movs, dia), equipes, contratos, grupo };
      }),
    [dados.veiculos, movimentosPorVeiculo, equipesPorVeiculo, equipePorId, contratoNoDia, dia]
  );

  const linhas = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return todas
      .filter(({ v, contratos, grupo }) => (!filtroContrato || (filtroContrato === SEM_EQUIPE ? grupo === SEM_EQUIPE : contratos.includes(filtroContrato))) && (!filtroStatus || v.status === filtroStatus))
      .filter(({ v, loc, equipes }) => !t || `${v.codigo} ${v.identificacao} ${v.placa ?? ""} ${v.modelo ?? ""} ${loc?.local ?? ""} ${equipes.map((e) => `${e.codigo} ${e.nome}`).join(" ")}`.toLowerCase().includes(t))
      .sort((a, b) => a.v.identificacao.localeCompare(b.v.identificacao, "pt-BR", { numeric: true }));
  }, [todas, filtroContrato, filtroStatus, busca]);

  const grupos = useMemo(() => {
    const m = new Map<string, typeof linhas>();
    for (const l of linhas) {
      if (!m.has(l.grupo)) m.set(l.grupo, []);
      m.get(l.grupo)!.push(l);
    }
    const peso = (g: string) => (g === SEM_EQUIPE ? 2 : g === VARIOS ? 1 : 0);
    return [...m.entries()].sort(([a], [b]) => peso(a) - peso(b) || a.localeCompare(b, "pt-BR", { numeric: true }));
  }, [linhas]);

  const contratosFiltro = useMemo(() => {
    const s = new Set<string>();
    for (const l of todas) {
      for (const c of l.contratos) s.add(c);
      if (l.grupo === SEM_EQUIPE) s.add(SEM_EQUIPE);
    }
    return [...s].sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }));
  }, [todas]);

  const n = (s: string) => dados.veiculos.filter((v) => v.status === s).length;
  const compartilhadas = todas.filter((l) => l.equipes.length > 1).length;

  return (
    <div>
      <CabecalhoPagina
        titulo="Frota"
        subtitulo="Cada viatura aparece uma vez, mesmo quando é usada por várias equipes. Veja quais equipes usam, quem vai nela e, se houver, a passagem registrada."
        acoes={
          dados.podeEditar && (
            <button onClick={() => setModal({ t: "novo" })} className="btn-primary">
              <IcMais tam={16} /> Nova viatura
            </button>
          )
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Viaturas (cada uma conta uma vez)", dados.veiculos.length, "#101B17"],
          ["Usadas por mais de uma equipe", compartilhadas, "#1D6FB8"],
          ["Em operação", n("Em operação"), "#0E8F63"],
          ["Manutenção / paradas", n("Em manutenção") + n("Parado"), "#B86E00"],
        ].map(([r, v, c]) => (
          <div key={r as string} className="card px-4 py-3">
            <div className="text-[10.5px] font-semibold uppercase tracking-wider text-gray-500">{r}</div>
            <div className="num mt-1 font-display text-[26px] font-semibold leading-none" style={{ color: c as string }}>
              {v}
            </div>
          </div>
        ))}
      </div>

      <div className="card mb-4 flex flex-wrap items-end gap-3 p-3.5">
        <label>
          <span className="label">Posição em</span>
          <input type="date" value={dia} onChange={(e) => e.target.value && setDia(e.target.value)} className="field" />
        </label>
        <label>
          <span className="label">Contrato</span>
          <select value={filtroContrato} onChange={(e) => setFiltroContrato(e.target.value)} className="field">
            <option value="">Todos</option>
            {contratosFiltro.map((c) => (
              <option key={c} value={c}>
                {c === SEM_EQUIPE ? c : rotuloContrato(c)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="label">Situação</span>
          <select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)} className="field">
            <option value="">Todas</option>
            {STATUS_VEICULO.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="min-w-[180px] flex-1">
          <span className="label">Buscar</span>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="viatura, placa, equipe…" className="field" />
        </label>
        {dia !== hoje && (
          <button onClick={() => setDia(hoje)} className="btn-ghost">
            Hoje
          </button>
        )}
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead className="bg-gray-50 text-[10.5px] font-semibold uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-3 py-2 text-left">Viatura</th>
              <th className="px-3 py-2 text-left">Placa / modelo</th>
              <th className="px-3 py-2 text-left">Equipes que usam</th>
              <th className="px-3 py-2 text-left">Vai neste carro</th>
              <th className="px-3 py-2 text-left">Situação</th>
              <th className="px-3 py-2 text-left">Passagem registrada</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {grupos.map(([grupo, lista]) => (
              <GrupoContrato key={grupo} grupo={grupo} total={lista.length}>
                {lista.map(({ v, loc, prox, equipes }) => {
                  const pessoas = (ocupantesPorVeiculo.get(v.id) ?? []).filter(temNome);
                  const proxEq = prox?.equipeId ? equipePorId.get(prox.equipeId) : null;
                  return (
                    <Fragment key={v.id}>
                      <tr className="border-t border-gray-100 align-top hover:bg-gray-50/60">
                        <td className="px-3 py-2">
                          <div className="font-semibold">{v.identificacao}</div>
                          <div className="text-[10.5px] text-gray-400">{v.codigo}</div>
                          {v.observacao && <div className="mt-0.5 max-w-[180px] text-[10.5px] text-warn">{v.observacao}</div>}
                        </td>
                        <td className="px-3 py-2 text-gray-600">
                          {v.placa ?? <span className="text-gray-300">—</span>}
                          <div className="text-[10.5px] text-gray-400">{[v.modelo, v.tracao4x4 ? "4x4" : null].filter(Boolean).join(" · ")}</div>
                        </td>
                        <td className="px-3 py-2">
                          {equipes.length === 0 ? (
                            <span className="text-gray-300">—</span>
                          ) : (
                            <div className="flex max-w-[360px] flex-wrap gap-1">
                              {equipes.map((e) => (
                                <span key={e.id} className="inline-flex items-center gap-1 rounded bg-gray-50 px-1.5 py-0.5 text-[11px] text-gray-700 ring-1 ring-line" title={`${e.nome} · ${rotuloContrato(e.projeto)}`}>
                                  <PontoContrato cor={corDoContrato(e.projeto)} tam={6} />
                                  <span className="font-mono text-[10px] text-gray-500">{e.codigo}</span>
                                  <span className="max-w-[130px] truncate">{e.nome}</span>
                                </span>
                              ))}
                            </div>
                          )}
                          {equipes.length > 1 && <div className="mt-0.5 text-[10.5px] text-info">usada por {equipes.length} equipes</div>}
                        </td>
                        <td className="px-3 py-2 text-gray-600">
                          <button onClick={() => dados.podeEditar && equipes.length === 1 && setModal({ t: "ocupantes", v })} className={`text-left ${dados.podeEditar && equipes.length === 1 ? "hover:text-brand-dark hover:underline" : "cursor-default"}`} title={pessoas.map(nomeDe).join(", ")}>
                            {pessoas.length === 0 ? <span className="text-gray-300">—</span> : <>{pessoas.slice(0, 2).map(nomeDe).join(", ")}{pessoas.length > 2 ? ` +${pessoas.length - 2}` : ""}</>}
                          </button>
                        </td>
                        <td className="px-3 py-2">
                          <span className={CHIP_VEICULO[v.status]}>{v.status}</span>
                        </td>
                        <td className="px-3 py-2 text-gray-600">
                          {loc ? (
                            <>
                              desde {fmtDia(loc.inicio)}
                              <div className="text-[10.5px] text-gray-400">{diasNoLocal(loc, dia)} dia(s){loc.local ? ` · ${loc.local}` : ""}</div>
                            </>
                          ) : (
                            <span className="text-gray-300">nenhuma</span>
                          )}
                          {prox && (
                            <div className="mt-0.5 text-[10.5px] text-gray-500">
                              {fmtDia(prox.inicio)} → <span className="font-medium text-ink">{rotuloContrato(prox.projeto)}</span> {proxEq?.nome ?? ""}
                            </div>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right">
                          <button onClick={() => setModal({ t: "historico", v })} className="btn-ghost btn-sm">
                            Histórico
                          </button>
                          {dados.podeEditar && (
                            <>
                              <button onClick={() => setModal({ t: "mover", v })} className="btn-ghost btn-sm ml-1">
                                Mover
                              </button>
                              <button onClick={() => setModal({ t: "editar", v })} className="btn-ghost btn-sm ml-1">
                                Editar
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    </Fragment>
                  );
                })}
              </GrupoContrato>
            ))}
            {linhas.length === 0 && (
              <tr>
                <td colSpan={7}>
                  <Vazio titulo={dados.veiculos.length === 0 ? "Nenhuma viatura cadastrada" : "Nenhuma viatura neste filtro"} />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modal?.t === "mover" && <ModalMover veiculo={modal.v} onFechar={() => setModal(null)} />}
      {modal?.t === "historico" && <ModalHistoricoVeiculo veiculo={modal.v} onFechar={() => setModal(null)} />}
      {modal?.t === "editar" && <ModalVeiculo veiculo={modal.v} onFechar={() => setModal(null)} />}
      {modal?.t === "ocupantes" && (() => {
        const ids = equipesPorVeiculo.get(modal.v.id) ?? [];
        return ids.length === 1 ? <ModalOcupantes veiculo={modal.v} equipeId={ids[0]} onFechar={() => setModal(null)} /> : null;
      })()}
      {modal?.t === "novo" && <ModalVeiculo onFechar={() => setModal(null)} />}
    </div>
  );
}

function GrupoContrato({ grupo, total, children }: { grupo: string; total: number; children: React.ReactNode }) {
  const especial = grupo === SEM_EQUIPE || grupo === VARIOS;
  return (
    <>
      <tr className="bg-gray-50/80">
        <td colSpan={7} className="px-3 py-1.5">
          <span className="inline-flex items-center gap-2 text-[11.5px] font-semibold uppercase tracking-wide text-gray-600">
            <PontoContrato cor={especial ? "#9AA8A1" : corDoContrato(grupo)} tam={9} />
            {especial ? grupo : rotuloContrato(grupo)}
            <span className="num font-normal text-gray-400">{total}</span>
          </span>
        </td>
      </tr>
      {children}
    </>
  );
}
