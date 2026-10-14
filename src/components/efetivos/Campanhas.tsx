"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { STATUS_CAMPANHA, STATUS_CAMPANHA_QUE_LIBERAM, conferirNecessidade, diferencaDias, livresNoPeriodo, ordenarGrupos } from "@/lib/efetivos/disponibilidade";
import { useDados } from "./DadosContext";
import { CHIP_STATUS_CAMPANHA, corDoContrato, fmtDia, nomeDaEquipeDaCampanha, rotuloContrato, type Campanha, type Vaga } from "./comum";
import { IcMais } from "./icones";
import { DrawerCampanha } from "./quadro/Drawers";
import { CabecalhoPagina, PontoContrato, Vazio } from "./ui";

const PIPELINE = ["Nova", "Em análise", "Planejada", "Confirmada", "Em execução"] as const;

/** "2 Biólogo de Fauna · 6 Auxiliar +1" — a composição da equipe em uma linha. */
function resumoFuncoes(membros: Vaga[], max = 3): string {
  const c = new Map<string, number>();
  for (const v of membros) c.set(v.cargo, (c.get(v.cargo) ?? 0) + 1);
  const lista = [...c.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR"));
  const mostradas = lista.slice(0, max).map(([cargo, n]) => `${n} ${cargo}`);
  return mostradas.join(" · ") + (lista.length > max ? ` +${lista.length - max}` : "");
}

export default function Campanhas() {
  const { dados, regra, hoje, vagaPorId, equipesCampo, nomeDe } = useDados();
  const grupos = ordenarGrupos(equipesCampo.map((e) => e.grupo));
  const [filtroGrupo, setFiltroGrupo] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<string>("abertas");
  const [busca, setBusca] = useState("");
  const [aberta, setAberta] = useState<string | null>(null);

  const lista = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return dados.campanhas
      .filter((c) => !filtroGrupo || c.grupo === filtroGrupo)
      .filter((c) => (filtroStatus === "abertas" ? !STATUS_CAMPANHA_QUE_LIBERAM.includes(c.status) : filtroStatus === "todas" ? true : c.status === filtroStatus))
      .filter((c) => !t || `${c.codigo} ${c.equipeNome ?? ""} ${c.projeto} ${c.local ?? ""} ${c.solicitante ?? ""}`.toLowerCase().includes(t))
      .sort((a, b) => a.inicio.localeCompare(b.inicio));
  }, [dados.campanhas, filtroGrupo, filtroStatus, busca]);

  const contagem = (s: string) => dados.campanhas.filter((c) => c.status === s).length;
  const membrosDe = (c: Campanha) => dados.alocacoes.filter((a) => a.campanhaId === c.id).map((a) => vagaPorId.get(a.vagaId)).filter((v): v is Vaga => !!v);
  const campanhaAberta = aberta ? dados.campanhas.find((c) => c.id === aberta) : undefined;

  return (
    <div>
      <CabecalhoPagina
        titulo="Campanhas"
        subtitulo="Cada campanha tem a sua equipe, montada com quem está livre no período."
        acoes={
          dados.podeEditar && (
            <Link href="/montar" className="btn-primary">
              <IcMais tam={16} /> Nova campanha
            </Link>
          )
        }
      />

      <div className="card mb-4 grid grid-cols-2 divide-x divide-line sm:grid-cols-5">
        {PIPELINE.map((s) => (
          <button key={s} onClick={() => setFiltroStatus(filtroStatus === s ? "abertas" : s)} className={`px-4 py-3 text-left transition-colors hover:bg-gray-50 ${filtroStatus === s ? "bg-brand-soft" : ""}`}>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">{s}</div>
            <div className="num mt-0.5 font-display text-xl font-semibold leading-tight">{contagem(s)}</div>
          </button>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label>
          <span className="label">Grupo</span>
          <select value={filtroGrupo} onChange={(e) => setFiltroGrupo(e.target.value)} className="field !mt-0.5 !w-auto !py-1.5">
            <option value="">Todos</option>
            {grupos.map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="label">Situação</span>
          <select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)} className="field !mt-0.5 !w-auto !py-1.5">
            <option value="abertas">Em aberto</option>
            <option value="todas">Todas</option>
            {STATUS_CAMPANHA.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="min-w-[220px] flex-1">
          <span className="label">Buscar</span>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="código, equipe, contrato, local, solicitante…" className="field !mt-0.5 !py-1.5" />
        </label>
      </div>

      <div className="card overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr>
              <th>Campanha e equipe</th>
              <th>Contrato / local</th>
              <th>Período</th>
              <th>Equipe</th>
              <th>Pedido</th>
              <th>Situação</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {lista.map((c) => {
              const segura = !STATUS_CAMPANHA_QUE_LIBERAM.includes(c.status);
              const membros = membrosDe(c);
              const conf = c.necessidade.length > 0 ? conferirNecessidade(c.necessidade, membros, segura ? livresNoPeriodo(regra, c.inicio, c.fim, { ignorarCampanhaId: c.id }).livres.filter((p) => !membros.some((m) => m.id === p.id)) : []) : null;
              const pedido = c.necessidade.reduce((s, n) => s + n.qtd, 0);
              const dias = diferencaDias(c.inicio, c.fim) + 1;
              const decorrido = Math.max(0, Math.min(dias, diferencaDias(c.inicio, hoje) + 1));
              return (
                <tr key={c.id} className="cursor-pointer align-top" onClick={() => setAberta(c.id)}>
                  <td>
                    <div className="text-[13px] font-semibold text-ink">{nomeDaEquipeDaCampanha(c)}</div>
                    <div className="text-[11px] text-gray-500">
                      <span className="font-mono">{c.codigo}</span>
                      {c.prioridade === "Alta" ? <span className="font-semibold text-bad"> · prioridade alta</span> : null}
                      {c.solicitante ? ` · ${c.solicitante}` : ""}
                    </div>
                  </td>
                  <td>
                    <span className="inline-flex items-center gap-2 font-medium">
                      <PontoContrato cor={corDoContrato(c.projeto)} tam={9} />
                      {rotuloContrato(c.projeto)}
                    </span>
                    <div className="text-[11px] text-gray-500">
                      {c.grupo} · {c.atividade}
                      {c.local ? ` · ${c.local}` : ""}
                    </div>
                  </td>
                  <td className="whitespace-nowrap">
                    {fmtDia(c.inicio)} a {fmtDia(c.fim)}
                    <div className="mt-1 h-1.5 w-28 overflow-hidden rounded-full bg-gray-100" title={`${dias} dias`}>
                      <div className="h-full rounded-full bg-brand" style={{ width: `${(decorrido / dias) * 100}%` }} />
                    </div>
                  </td>
                  <td className="max-w-[260px]" title={membros.map(nomeDe).join(", ")}>
                    {membros.length > 0 ? (
                      <>
                        <span className="num font-semibold">{membros.length}</span> <span className="text-gray-600">pessoa{membros.length === 1 ? "" : "s"}</span>
                        <div className="truncate text-[11px] text-gray-500">{resumoFuncoes(membros)}</div>
                      </>
                    ) : (
                      <span className="text-gray-400">sem pessoas ainda</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap">
                    {conf ? (
                      <>
                        <span className="num font-semibold">{membros.length}</span>
                        <span className="text-gray-400"> de </span>
                        <span className="num">{pedido}</span>
                        {conf.semGente > 0 ? (
                          <div className="text-[11px] font-semibold text-warn">{conf.semGente} sem ninguém livre</div>
                        ) : conf.falta > 0 ? (
                          <div className="text-[11px] text-gray-500">faltam {conf.falta}</div>
                        ) : (
                          <div className="text-[11px] text-ok">completo</div>
                        )}
                      </>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td>
                    <span className={CHIP_STATUS_CAMPANHA[c.status]}>{c.status}</span>
                  </td>
                  <td className="whitespace-nowrap text-right" onClick={(e) => e.stopPropagation()}>
                    {dados.podeEditar && (
                      <Link href={`/montar?campanha=${c.id}`} className="btn-ghost btn-sm">
                        Editar
                      </Link>
                    )}
                  </td>
                </tr>
              );
            })}
            {lista.length === 0 && (
              <tr>
                <td colSpan={7}>
                  <Vazio
                    titulo={dados.campanhas.length === 0 ? "Nenhuma campanha ainda" : "Nenhuma campanha neste filtro"}
                    texto={dados.campanhas.length === 0 ? "Ao criar a campanha você escolhe o período, vê quem está livre e já monta a equipe." : undefined}
                    acao={
                      dados.campanhas.length === 0 && dados.podeEditar ? (
                        <Link href="/montar" className="btn-primary">
                          <IcMais tam={16} /> Criar a primeira campanha
                        </Link>
                      ) : undefined
                    }
                  />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {campanhaAberta && <DrawerCampanha campanha={campanhaAberta} onFechar={() => setAberta(null)} />}
    </div>
  );
}
