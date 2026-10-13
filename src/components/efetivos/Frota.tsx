"use client";

import { Fragment, useMemo, useState } from "react";
import { temNome } from "@/lib/efetivos/disponibilidade";
import { STATUS_VEICULO, diasNoLocal, localizacaoNoDia, proximoMovimento, type MovimentoBase } from "@/lib/efetivos/veiculos";
import { useDados } from "./DadosContext";
import { A_DEFINIR, CHIP_VEICULO, corDoContrato, fmtDia, rotuloContrato, type Veiculo } from "./comum";
import { IcMais } from "./icones";
import { ModalHistoricoVeiculo, ModalMover, ModalVeiculo } from "./modais/ModaisVeiculo";
import ModalOcupantes from "./modais/ModalOcupantes";
import { CabecalhoPagina, PontoContrato, Vazio } from "./ui";

const SEM_LOC = "Sem localização";

export default function Frota() {
  const { dados, hoje, equipePorId, ocupantesPorVeiculo, nomeDe } = useDados();
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

  const linhas = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return dados.veiculos
      .map((v) => {
        const movs = movimentosPorVeiculo.get(v.id) ?? [];
        const loc = localizacaoNoDia(movs, dia);
        return { v, loc, prox: proximoMovimento(movs, dia), contrato: !loc ? SEM_LOC : !loc.projeto || loc.projeto === A_DEFINIR ? A_DEFINIR : loc.projeto };
      })
      .filter(({ v, contrato }) => (!filtroContrato || contrato === filtroContrato) && (!filtroStatus || v.status === filtroStatus))
      .filter(({ v, loc }) => !t || `${v.codigo} ${v.identificacao} ${v.placa ?? ""} ${v.modelo ?? ""} ${loc?.local ?? ""}`.toLowerCase().includes(t));
  }, [dados.veiculos, movimentosPorVeiculo, dia, filtroContrato, filtroStatus, busca]);

  const grupos = useMemo(() => {
    const m = new Map<string, typeof linhas>();
    for (const l of linhas) {
      if (!m.has(l.contrato)) m.set(l.contrato, []);
      m.get(l.contrato)!.push(l);
    }
    for (const lista of m.values()) lista.sort((a, b) => (equipePorId.get(a.loc?.equipeId ?? "")?.codigo ?? "~").localeCompare(equipePorId.get(b.loc?.equipeId ?? "")?.codigo ?? "~") || a.v.identificacao.localeCompare(b.v.identificacao, "pt-BR", { numeric: true }));
    return [...m.entries()].sort(([a], [b]) => (a === SEM_LOC ? 1 : b === SEM_LOC ? -1 : a === A_DEFINIR ? 1 : b === A_DEFINIR ? -1 : a.localeCompare(b, "pt-BR", { numeric: true })));
  }, [linhas, equipePorId]);

  const contratosFiltro = useMemo(() => {
    const s = new Set<string>();
    for (const v of dados.veiculos) {
      const loc = localizacaoNoDia(movimentosPorVeiculo.get(v.id) ?? [], dia);
      s.add(!loc ? SEM_LOC : !loc.projeto || loc.projeto === A_DEFINIR ? A_DEFINIR : loc.projeto);
    }
    return [...s].sort();
  }, [dados.veiculos, movimentosPorVeiculo, dia]);

  const n = (s: string) => dados.veiculos.filter((v) => v.status === s).length;

  return (
    <div>
      <CabecalhoPagina
        titulo="Frota"
        subtitulo="Onde cada viatura está, em qual contrato e equipe, e quem vai nela. Mover uma viatura guarda o histórico."
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
          ["Viaturas", dados.veiculos.length, "#101B17"],
          ["Em operação", n("Em operação"), "#0E8F63"],
          ["Disponíveis", n("Disponível"), "#1D6FB8"],
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
                {c === SEM_LOC ? c : rotuloContrato(c)}
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
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="placa, VL, local…" className="field" />
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
              <th className="px-3 py-2 text-left">Local / frente</th>
              <th className="px-3 py-2 text-left">Vai neste carro</th>
              <th className="px-3 py-2 text-left">Situação</th>
              <th className="px-3 py-2 text-left">Desde</th>
              <th className="px-3 py-2 text-left">Próxima mudança</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {grupos.map(([contrato, lista]) => (
              <GrupoContrato key={contrato} contrato={contrato} total={lista.length}>
                {lista.map(({ v, loc, prox }, i) => {
                  const eq = loc?.equipeId ? equipePorId.get(loc.equipeId) : null;
                  const eqAnterior = i > 0 && lista[i - 1].loc?.equipeId ? equipePorId.get(lista[i - 1].loc!.equipeId!) : null;
                  const novaEquipe = i === 0 || eq?.id !== eqAnterior?.id;
                  const proxEq = prox?.equipeId ? equipePorId.get(prox.equipeId) : null;
                  const pessoas = (ocupantesPorVeiculo.get(v.id) ?? []).filter(temNome);
                  return (
                    <Fragment key={v.id}>
                      {novaEquipe && (
                        <tr className="border-t border-gray-200">
                          <td colSpan={8} className="bg-white px-3 pb-1 pt-2.5 text-[12px] font-semibold text-ink">
                            {eq ? eq.nome : "Sem equipe"} <span className="ml-1 font-normal text-gray-400">{eq?.codigo}</span>
                          </td>
                        </tr>
                      )}
                    <tr className="border-t border-gray-100 align-top hover:bg-gray-50/60">
                      <td className="px-3 py-2">
                        <div className="font-semibold">{v.identificacao}</div>
                        <div className="text-[10.5px] text-gray-400">{v.codigo}</div>
                      </td>
                      <td className="px-3 py-2 text-gray-600">
                        {v.placa ?? "—"}
                        <div className="text-[10.5px] text-gray-400">{[v.modelo, v.tracao4x4 ? "4x4" : null].filter(Boolean).join(" · ")}</div>
                      </td>
                      <td className="px-3 py-2 text-gray-600">{loc?.local ?? <span className="text-gray-300">—</span>}</td>
                      <td className="px-3 py-2 text-gray-600">
                        <button onClick={() => dados.podeEditar && loc?.equipeId && setModal({ t: "ocupantes", v })} className={`text-left ${dados.podeEditar && loc?.equipeId ? "hover:text-brand-dark hover:underline" : "cursor-default"}`} title={pessoas.map(nomeDe).join(", ")}>
                          {pessoas.length === 0 ? <span className="text-gray-300">—</span> : <>{pessoas.slice(0, 2).map(nomeDe).join(", ")}{pessoas.length > 2 ? ` +${pessoas.length - 2}` : ""}</>}
                        </button>
                      </td>
                      <td className="px-3 py-2">
                        <span className={CHIP_VEICULO[v.status]}>{v.status}</span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-gray-600">
                        {loc ? (
                          <>
                            {fmtDia(loc.inicio)}
                            <div className="text-[10.5px] text-gray-400">{diasNoLocal(loc, dia)} dia(s)</div>
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-3 py-2 text-gray-600">
                        {prox ? (
                          <>
                            {fmtDia(prox.inicio)} → <span className="font-medium text-ink">{rotuloContrato(prox.projeto)}</span>
                            <div className="text-[10.5px] text-gray-400">{proxEq?.nome ?? ""}</div>
                          </>
                        ) : (
                          <span className="text-gray-300">—</span>
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
                <td colSpan={8}>
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
        const loc = localizacaoNoDia(movimentosPorVeiculo.get(modal.v.id) ?? [], hoje);
        return loc?.equipeId ? <ModalOcupantes veiculo={modal.v} equipeId={loc.equipeId} onFechar={() => setModal(null)} /> : null;
      })()}
      {modal?.t === "novo" && <ModalVeiculo onFechar={() => setModal(null)} />}
    </div>
  );
}

function GrupoContrato({ contrato, total, children }: { contrato: string; total: number; children: React.ReactNode }) {
  const cor = contrato === SEM_LOC ? "#9AA8A1" : corDoContrato(contrato);
  return (
    <>
      <tr className="bg-gray-50/80">
        <td colSpan={8} className="px-3 py-1.5">
          <span className="inline-flex items-center gap-2 text-[11.5px] font-semibold uppercase tracking-wide text-gray-600">
            <PontoContrato cor={cor} tam={9} />
            {contrato === SEM_LOC ? SEM_LOC : rotuloContrato(contrato)}
            <span className="num font-normal text-gray-400">{total}</span>
          </span>
        </td>
      </tr>
      {children}
    </>
  );
}
