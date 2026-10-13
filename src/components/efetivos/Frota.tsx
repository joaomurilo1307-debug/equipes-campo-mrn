"use client";

import { useMemo, useState } from "react";
import { STATUS_VEICULO, diasNoLocal, localizacaoNoDia, proximoMovimento, resumoPorContrato, type MovimentoBase } from "@/lib/efetivos/veiculos";
import { useDados } from "./DadosContext";
import { A_DEFINIR, CHIP_VEICULO, corDoContrato, fmtDia, rotuloContrato, type Veiculo } from "./comum";
import { IcCarro, IcMais } from "./icones";
import { ModalHistoricoVeiculo, ModalMover, ModalVeiculo } from "./modais/ModaisVeiculo";
import { Aviso, CabecalhoPagina, PontoContrato, Vazio } from "./ui";

export default function Frota() {
  const { dados, hoje, equipePorId } = useDados();
  const [dia, setDia] = useState(hoje);
  const [filtroContrato, setFiltroContrato] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("");
  const [busca, setBusca] = useState("");
  const [modal, setModal] = useState<{ t: "mover" | "historico" | "editar"; v: Veiculo } | { t: "novo" } | null>(null);

  const movimentosPorVeiculo = useMemo(() => {
    const m = new Map<string, MovimentoBase[]>();
    for (const x of dados.movimentos) {
      if (!m.has(x.veiculoId)) m.set(x.veiculoId, []);
      m.get(x.veiculoId)!.push(x);
    }
    return m;
  }, [dados.movimentos]);

  const resumo = useMemo(() => resumoPorContrato(dados.veiculos, dados.movimentos, dia), [dados.veiculos, dados.movimentos, dia]);
  const linhas = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return dados.veiculos
      .map((v) => {
        const movs = movimentosPorVeiculo.get(v.id) ?? [];
        return { v, loc: localizacaoNoDia(movs, dia), prox: proximoMovimento(movs, dia) };
      })
      .filter(({ v, loc }) => (!filtroContrato || (loc?.projeto ?? "Sem localização") === filtroContrato) && (!filtroStatus || v.status === filtroStatus))
      .filter(({ v, loc }) => !t || `${v.codigo} ${v.identificacao} ${v.placa ?? ""} ${v.modelo ?? ""} ${loc?.projeto ?? ""} ${loc?.local ?? ""}`.toLowerCase().includes(t))
      .sort((a, b) => (a.loc?.projeto ?? "~").localeCompare(b.loc?.projeto ?? "~") || a.v.identificacao.localeCompare(b.v.identificacao, "pt-BR", { numeric: true }));
  }, [dados.veiculos, movimentosPorVeiculo, dia, filtroContrato, filtroStatus, busca]);

  const n = (s: string) => dados.veiculos.filter((v) => v.status === s).length;
  const semPlaca = dados.veiculos.filter((v) => !v.placa).length;
  const semLoc = resumo.find((r) => r.projeto === "Sem localização")?.total ?? 0;

  return (
    <div>
      <CabecalhoPagina
        titulo="Frota"
        subtitulo="Onde cada veículo está, em qual contrato, desde quando e para onde vai. Mover um veículo nunca apaga a passagem anterior."
        acoes={
          dados.podeEditar && (
            <button onClick={() => setModal({ t: "novo" })} className="btn-primary">
              <IcMais tam={16} /> Novo veículo
            </button>
          )
        }
      />

      {dados.podeEditar && semPlaca > 0 && (
        <div className="mb-4">
          <Aviso tipo="atencao">
            <strong>{semPlaca}</strong> veículo{semPlaca > 1 ? "s" : ""} sem placa: a planilha só cita “VL 01/02/03” de cada equipe. Use <strong>Editar</strong> para preencher placa e modelo.
          </Aviso>
        </div>
      )}

      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-5">
        {[
          ["Veículos", dados.veiculos.length, "#101B17"],
          ["Em operação", n("Em operação"), "#0E8F63"],
          ["Disponíveis", n("Disponível"), "#1D6FB8"],
          ["Manutenção / parados", n("Em manutenção") + n("Parado"), "#B86E00"],
          ["Sem localização", semLoc, semLoc > 0 ? "#C9342B" : "#9AA8A1"],
        ].map(([r, v, c]) => (
          <div key={r as string} className="card p-4">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">{r}</div>
            <div className="num mt-2 font-display text-[36px] font-semibold leading-none" style={{ color: c as string }}>{v}</div>
          </div>
        ))}
      </div>

      <section className="mb-5" aria-label="Por contrato">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-lg font-semibold tracking-tight">Veículos por contrato em {fmtDia(dia)}</h2>
          <label className="flex items-center gap-2 text-xs text-gray-600">
            Posição em
            <input type="date" value={dia} onChange={(e) => e.target.value && setDia(e.target.value)} className="field !mt-0 !w-auto" />
            {dia !== hoje && (
              <button onClick={() => setDia(hoje)} className="btn-ghost btn-sm">
                hoje
              </button>
            )}
          </label>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {resumo.map((r) => {
            const ativo = filtroContrato === r.projeto;
            return (
              <button key={r.projeto} onClick={() => setFiltroContrato(ativo ? "" : r.projeto)} className={`card p-4 text-left transition-shadow hover:shadow-pop ${ativo ? "ring-2 ring-brand" : ""}`}>
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <PontoContrato cor={r.projeto === "Sem localização" ? "#9AA8A1" : corDoContrato(r.projeto)} />
                  {r.projeto === "Sem localização" ? r.projeto : rotuloContrato(r.projeto)}
                </div>
                <div className="mt-2 flex items-end justify-between">
                  <span className="num font-display text-4xl font-semibold leading-none">{r.total}</span>
                  <span className="mb-0.5 inline-flex items-center gap-1 text-gray-400">
                    <IcCarro tam={22} />
                  </span>
                </div>
                <div className="mt-2 text-[11px] text-gray-500">
                  {Object.entries(r.porStatus)
                    .map(([s, c]) => `${c} ${s.toLowerCase()}`)
                    .join(" · ")}
                </div>
              </button>
            );
          })}
          {resumo.length === 0 && (
            <div className="card sm:col-span-2 lg:col-span-4">
              <Vazio titulo="Nenhum veículo cadastrado" texto="Importe a planilha (em Equipes e pessoas) ou use “Novo veículo”." />
            </div>
          )}
        </div>
      </section>

      <div className="card mb-4 flex flex-wrap items-end gap-3 p-4">
        <label>
          <span className="label">Contrato</span>
          <select value={filtroContrato} onChange={(e) => setFiltroContrato(e.target.value)} className="field">
            <option value="">Todos</option>
            {resumo.map((r) => (
              <option key={r.projeto} value={r.projeto}>
                {r.projeto === "Sem localização" ? r.projeto : rotuloContrato(r.projeto)} ({r.total})
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
        <label className="min-w-[200px] flex-1">
          <span className="label">Buscar</span>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="placa, VL, local…" className="field" />
        </label>
      </div>

      <div className="card overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr>
              <th>Veículo</th>
              <th>Placa / modelo</th>
              <th>Situação</th>
              <th>Onde está</th>
              <th>Desde</th>
              <th>Próxima mudança</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {linhas.map(({ v, loc, prox }) => {
              const eq = loc?.equipeId ? equipePorId.get(loc.equipeId) : null;
              const proxEq = prox?.equipeId ? equipePorId.get(prox.equipeId) : null;
              return (
                <tr key={v.id} className="align-top">
                  <td>
                    <div className="font-semibold">{v.identificacao}</div>
                    <div className="text-[11px] text-gray-400">
                      {v.codigo}
                      {v.tracao4x4 ? " · 4x4" : ""}
                    </div>
                  </td>
                  <td className="text-gray-600">
                    {v.placa ?? <span className="text-warn">placa a informar</span>}
                    {v.modelo && <div className="text-[11px] text-gray-400">{v.modelo}</div>}
                  </td>
                  <td>
                    <span className={CHIP_VEICULO[v.status]}>{v.status}</span>
                  </td>
                  <td>
                    {loc ? (
                      <>
                        <div className="flex items-center gap-2 font-medium">
                          <PontoContrato cor={corDoContrato(loc.projeto)} tam={9} />
                          <span className={loc.projeto === A_DEFINIR ? "text-warn" : ""}>{rotuloContrato(loc.projeto)}</span>
                        </div>
                        <div className="text-[11px] text-gray-500">{[eq ? `${eq.codigo} · ${eq.nome}` : null, loc.local].filter(Boolean).join(" · ") || "—"}</div>
                      </>
                    ) : (
                      <span className="text-bad">sem localização registrada</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap text-gray-600">
                    {loc ? (
                      <>
                        {fmtDia(loc.inicio)}
                        <div className="text-[11px] text-gray-400">{diasNoLocal(loc, dia)} dia(s)</div>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="text-gray-600">
                    {prox ? (
                      <>
                        {fmtDia(prox.inicio)} → <span className="font-medium text-ink">{rotuloContrato(prox.projeto)}</span>
                        <div className="text-[11px] text-gray-400">{proxEq?.nome ?? ""}</div>
                      </>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap text-right">
                    <button onClick={() => setModal({ t: "historico", v })} className="btn-ghost btn-sm">
                      Histórico
                    </button>
                    {dados.podeEditar && (
                      <>
                        <button onClick={() => setModal({ t: "mover", v })} className="btn-primary btn-sm ml-1">
                          Mover
                        </button>
                        <button onClick={() => setModal({ t: "editar", v })} className="btn-ghost btn-sm ml-1">
                          Editar
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
            {linhas.length === 0 && (
              <tr>
                <td colSpan={7}>
                  <Vazio titulo={dados.veiculos.length === 0 ? "Nenhum veículo cadastrado" : "Nenhum veículo neste filtro"} />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modal?.t === "mover" && <ModalMover veiculo={modal.v} onFechar={() => setModal(null)} />}
      {modal?.t === "historico" && <ModalHistoricoVeiculo veiculo={modal.v} onFechar={() => setModal(null)} />}
      {modal?.t === "editar" && <ModalVeiculo veiculo={modal.v} onFechar={() => setModal(null)} />}
      {modal?.t === "novo" && <ModalVeiculo onFechar={() => setModal(null)} />}
    </div>
  );
}
