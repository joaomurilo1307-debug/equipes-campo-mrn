"use client";

import { useMemo, useState } from "react";
import { STATUS_CAMPANHA, STATUS_CAMPANHA_QUE_LIBERAM, atendimentoDaCampanha, diferencaDias, ordenarGrupos } from "@/lib/efetivos/disponibilidade";
import { useDados } from "./DadosContext";
import { CHIP_ATENDIMENTO, CHIP_STATUS_CAMPANHA, corDoContrato, fmtDia, rotuloContrato, type Campanha } from "./comum";
import { IcMais } from "./icones";
import ModalCampanha from "./modais/ModalCampanha";
import ModalMontarEquipe from "./modais/ModalMontarEquipe";
import { DrawerCampanha } from "./quadro/Drawers";
import { CabecalhoPagina, PontoContrato, Vazio } from "./ui";

const PIPELINE = ["Nova", "Em análise", "Planejada", "Confirmada", "Em execução"] as const;

export default function Campanhas() {
  const { dados, regra, hoje, vagaPorId, nomeDe } = useDados();
  const grupos = ordenarGrupos(dados.equipes.map((e) => e.grupo));
  const [filtroGrupo, setFiltroGrupo] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<string>("abertas");
  const [busca, setBusca] = useState("");
  const [modal, setModal] = useState<{ t: "nova" } | { t: "editar"; c: Campanha } | { t: "montar"; c: Campanha } | null>(null);
  const [aberta, setAberta] = useState<string | null>(null);

  const lista = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return dados.campanhas
      .filter((c) => !filtroGrupo || c.grupo === filtroGrupo)
      .filter((c) => (filtroStatus === "abertas" ? !STATUS_CAMPANHA_QUE_LIBERAM.includes(c.status) : filtroStatus === "todas" ? true : c.status === filtroStatus))
      .filter((c) => !t || `${c.codigo} ${c.projeto} ${c.local ?? ""} ${c.solicitante ?? ""}`.toLowerCase().includes(t))
      .sort((a, b) => a.inicio.localeCompare(b.inicio));
  }, [dados.campanhas, filtroGrupo, filtroStatus, busca]);

  const contagem = (s: string) => dados.campanhas.filter((c) => c.status === s).length;
  const escalados = (c: Campanha) => dados.alocacoes.filter((a) => a.campanhaId === c.id);
  const campanhaAberta = aberta ? dados.campanhas.find((c) => c.id === aberta) : undefined;

  return (
    <div>
      <CabecalhoPagina
        titulo="Campanhas"
        subtitulo="O que o cliente pediu, por período. Para cada campanha, monte a equipe só com quem estiver livre."
        acoes={
          dados.podeEditar && (
            <button onClick={() => setModal({ t: "nova" })} className="btn-primary">
              <IcMais tam={16} /> Nova campanha
            </button>
          )
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {PIPELINE.map((s) => (
          <button key={s} onClick={() => setFiltroStatus(filtroStatus === s ? "abertas" : s)} className={`card p-4 text-left transition-shadow hover:shadow-pop ${filtroStatus === s ? "ring-2 ring-brand" : ""}`}>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">{s}</div>
            <div className="num mt-1.5 font-display text-3xl font-semibold">{contagem(s)}</div>
          </button>
        ))}
      </div>

      <div className="card mb-4 flex flex-wrap items-end gap-3 p-4">
        <label>
          <span className="label">Grupo</span>
          <select value={filtroGrupo} onChange={(e) => setFiltroGrupo(e.target.value)} className="field">
            <option value="">Todos</option>
            {grupos.map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="label">Situação</span>
          <select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)} className="field">
            <option value="abertas">Em aberto</option>
            <option value="todas">Todas</option>
            {STATUS_CAMPANHA.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="min-w-[220px] flex-1">
          <span className="label">Buscar</span>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="código, contrato, local, solicitante…" className="field" />
        </label>
      </div>

      <div className="card overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr>
              <th>Campanha</th>
              <th>Contrato / local</th>
              <th>Grupo · atividade</th>
              <th>Período</th>
              <th className="text-right">Equipes</th>
              <th>Situação</th>
              <th>Capacidade</th>
              <th className="text-right">Escalados</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {lista.map((c) => {
              const segura = !STATUS_CAMPANHA_QUE_LIBERAM.includes(c.status);
              const at = segura ? atendimentoDaCampanha(regra, c) : null;
              const n = escalados(c).length;
              const dias = diferencaDias(c.inicio, c.fim) + 1;
              const decorrido = Math.max(0, Math.min(dias, diferencaDias(c.inicio, hoje) + 1));
              return (
                <tr key={c.id} className="cursor-pointer align-top" onClick={() => setAberta(c.id)}>
                  <td>
                    <div className="font-mono text-[13px] font-semibold">{c.codigo}</div>
                    <div className="text-[11px] text-gray-500">
                      {c.prioridade === "Alta" ? <span className="font-semibold text-bad">Prioridade alta · </span> : null}
                      {c.solicitante ?? ""}
                    </div>
                  </td>
                  <td>
                    <span className="inline-flex items-center gap-2 font-medium">
                      <PontoContrato cor={corDoContrato(c.projeto)} tam={9} />
                      {rotuloContrato(c.projeto)}
                    </span>
                    {c.local && <div className="text-[11px] text-gray-500">{c.local}</div>}
                  </td>
                  <td>
                    {c.grupo}
                    <div className="text-[11px] text-gray-500">{c.atividade}</div>
                  </td>
                  <td className="whitespace-nowrap">
                    {fmtDia(c.inicio)} a {fmtDia(c.fim)}
                    <div className="mt-1 h-1.5 w-28 overflow-hidden rounded-full bg-gray-100" title={`${dias} dias`}>
                      <div className="h-full rounded-full bg-brand" style={{ width: `${(decorrido / dias) * 100}%` }} />
                    </div>
                  </td>
                  <td className="num text-right">{c.qtdEquipes}</td>
                  <td>
                    <span className={CHIP_STATUS_CAMPANHA[c.status]}>{c.status}</span>
                  </td>
                  <td>
                    {at ? (
                      <>
                        <span className={CHIP_ATENDIMENTO[at.atendimento]}>{at.atendimento}</span>
                        <div className="mt-0.5 text-[11px] text-gray-500">
                          {at.equipesDisponiveis} equipe{at.equipesDisponiveis === 1 ? "" : "s"} livre{at.equipesDisponiveis === 1 ? "" : "s"} · {at.pessoasLivresNoGrupo} pessoas livres
                        </div>
                      </>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="num text-right" title={escalados(c).map((a) => nomeDe(vagaPorId.get(a.vagaId)!)).join(", ")}>
                    {n > 0 ? n : <span className="text-gray-300">0</span>}
                  </td>
                  <td className="whitespace-nowrap text-right" onClick={(e) => e.stopPropagation()}>
                    {dados.podeEditar && segura && (
                      <button onClick={() => setModal({ t: "montar", c })} className="btn-primary btn-sm">
                        {n > 0 ? "Editar equipe" : "Montar equipe"}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {lista.length === 0 && (
              <tr>
                <td colSpan={9}>
                  <Vazio titulo="Nenhuma campanha neste filtro" texto={dados.campanhas.length === 0 ? "Crie a primeira campanha aqui ou arrastando sobre a linha de uma equipe no Quadro." : undefined} />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modal?.t === "nova" && <ModalCampanha onFechar={() => setModal(null)} onSalvo={(c) => { setModal({ t: "montar", c }); }} />}
      {modal?.t === "editar" && <ModalCampanha campanha={modal.c} onFechar={() => setModal(null)} onSalvo={() => setModal(null)} />}
      {modal?.t === "montar" && <ModalMontarEquipe campanha={modal.c} onFechar={() => setModal(null)} onSalvo={() => setModal(null)} />}
      {campanhaAberta && <DrawerCampanha campanha={campanhaAberta} onFechar={() => setAberta(null)} onEditar={() => setModal({ t: "editar", c: campanhaAberta })} onMontar={() => setModal({ t: "montar", c: campanhaAberta })} />}
    </div>
  );
}
