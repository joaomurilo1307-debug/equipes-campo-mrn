"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  STATUS_CAMPANHA_QUE_LIBERAM,
  avaliarEquipe,
  conferirNecessidade,
  diferencaDias,
  livresNoPeriodo,
  ordenarGrupos,
  type Dia,
} from "@/lib/efetivos/disponibilidade";
import { localizacaoNoDia, proximoMovimento, type MovimentoBase } from "@/lib/efetivos/veiculos";
import { useDados } from "../DadosContext";
import { CHIP_STATUS_CAMPANHA, CHIP_VEICULO, chamar, corDoContrato, fmtDia, nomeDaEquipeDaCampanha, rotuloContrato, type Alocacao, type Campanha, type Vaga, type Veiculo } from "../comum";
import { Aviso, Campo, Drawer, PontoContrato } from "../ui";

function Fato({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{rotulo}</dt>
      <dd className="mt-0.5 text-sm text-ink">{children}</dd>
    </div>
  );
}

// ---------------------------------------------------------------- campanha

export function DrawerCampanha({ campanha, onFechar }: { campanha: Campanha; onFechar: () => void }) {
  const { dados, regra, recarregar, vagaPorId, nomeDe } = useDados();
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const segura = !STATUS_CAMPANHA_QUE_LIBERAM.includes(campanha.status);
  const membros = useMemo(
    () =>
      dados.alocacoes
        .filter((a) => a.campanhaId === campanha.id)
        .map((a) => ({ a, v: vagaPorId.get(a.vagaId) }))
        .filter((x): x is { a: Alocacao; v: Vaga } => !!x.v),
    [dados.alocacoes, campanha.id, vagaPorId]
  );
  const porFuncao = useMemo(() => {
    const m = new Map<string, typeof membros>();
    for (const x of membros) {
      if (!m.has(x.v.cargo)) m.set(x.v.cargo, []);
      m.get(x.v.cargo)!.push(x);
    }
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], "pt-BR"));
  }, [membros]);
  const conf = useMemo(() => {
    if (campanha.necessidade.length === 0) return null;
    const livres = segura ? livresNoPeriodo(regra, campanha.inicio, campanha.fim, { ignorarCampanhaId: campanha.id }).livres.filter((p) => !membros.some((m) => m.v.id === p.id)) : [];
    return conferirNecessidade(campanha.necessidade, membros.map((m) => m.v), livres);
  }, [campanha, regra, segura, membros]);
  const dias = diferencaDias(campanha.inicio, campanha.fim) + 1;

  async function mudarStatus(status: string) {
    if (!window.confirm(`Marcar ${campanha.codigo} como ${status.toLowerCase()}? ${STATUS_CAMPANHA_QUE_LIBERAM.includes(status) ? "As pessoas da equipe ficam livres." : ""}`)) return;
    setOcupado(true);
    setErro(null);
    const r = await chamar("PATCH", `/api/efetivos/campanhas/${campanha.id}`, { status });
    setOcupado(false);
    if (!r.ok) return setErro(r.dados.error ?? "Não foi possível alterar");
    await recarregar();
    onFechar();
  }

  return (
    <Drawer
      titulo={nomeDaEquipeDaCampanha(campanha)}
      subtitulo={
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-mono">{campanha.codigo}</span>
          <span className={CHIP_STATUS_CAMPANHA[campanha.status]}>{campanha.status}</span>
          <span>
            {campanha.atividade} · {campanha.grupo}
          </span>
        </span>
      }
      onFechar={onFechar}
      rodape={
        dados.podeEditar ? (
          <Link href={`/montar?campanha=${campanha.id}`} className="btn-primary w-full">
            Editar campanha e equipe
          </Link>
        ) : undefined
      }
    >
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
        <Fato rotulo="Contrato">
          <span className="inline-flex items-center gap-2">
            <PontoContrato cor={corDoContrato(campanha.projeto)} tam={9} />
            {rotuloContrato(campanha.projeto)}
          </span>
        </Fato>
        <Fato rotulo="Local / frente">{campanha.local ?? "—"}</Fato>
        <Fato rotulo="Período">
          {fmtDia(campanha.inicio)} a {fmtDia(campanha.fim)}
          <span className="block text-[11px] text-gray-500">{dias} dias</span>
        </Fato>
        <Fato rotulo="Prioridade">{campanha.prioridade}</Fato>
        <Fato rotulo="Solicitante">{campanha.solicitante ?? "—"}</Fato>
      </dl>
      {campanha.observacao && <p className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-600">{campanha.observacao}</p>}

      {conf && (
        <div className="mt-5 rounded-xl border border-line p-3.5">
          <div className="text-sm font-semibold">Pedido da campanha</div>
          <ul className="mt-2 space-y-2">
            {conf.linhas.map((l) => (
              <li key={l.cargo}>
                <div className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="truncate font-medium text-ink">{l.cargo}</span>
                  <span className="num shrink-0 text-gray-600">
                    {l.escalados}/{l.pedido}
                  </span>
                </div>
                <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-gray-100">
                  <div className="h-full rounded-full" style={{ width: `${Math.min(100, (l.escalados / l.pedido) * 100)}%`, background: l.falta === 0 ? "#0E8F63" : "#1D6FB8" }} />
                </div>
                {l.semGente > 0 && <div className="mt-0.5 text-[11px] font-medium text-warn">faltam {l.semGente} — sem ninguém livre no período</div>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <h4 className="mt-6 flex items-baseline justify-between font-display text-base font-semibold">
        Equipe
        <span className="num text-sm font-medium text-gray-500">
          {membros.length} pessoa{membros.length === 1 ? "" : "s"}
        </span>
      </h4>
      {membros.length === 0 ? (
        <p className="mt-2 rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm text-gray-500">Ninguém na equipe ainda.{dados.podeEditar && segura ? " Use “Editar campanha e equipe” para escolher entre quem está livre." : ""}</p>
      ) : (
        <div className="mt-2 space-y-3">
          {porFuncao.map(([cargo, pessoas]) => (
            <div key={cargo}>
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                {cargo} <span className="num font-normal text-gray-400">{pessoas.length}</span>
              </div>
              <ul className="divide-y divide-line rounded-xl border border-line">
                {pessoas.map(({ a, v }) => (
                  <li key={v.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <span className="truncate font-medium">{nomeDe(v)}</span>
                    <span className="shrink-0 text-xs text-gray-500">{a.inicio !== campanha.inicio || a.fim !== campanha.fim ? `só ${fmtDia(a.inicio).slice(0, 5)}–${fmtDia(a.fim).slice(0, 5)}` : v.empresa}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {erro && (
        <div className="mt-4">
          <Aviso tipo="erro">{erro}</Aviso>
        </div>
      )}
      {dados.podeEditar && (
        <div className="mt-6 flex flex-wrap gap-2 border-t border-line pt-4">
          {segura && campanha.status !== "Concluída" && (
            <button disabled={ocupado} onClick={() => mudarStatus("Concluída")} className="btn-ghost btn-sm">
              Marcar como concluída
            </button>
          )}
          {segura ? (
            <button disabled={ocupado} onClick={() => mudarStatus("Cancelada")} className="btn-danger btn-sm">
              Cancelar campanha
            </button>
          ) : (
            <button disabled={ocupado} onClick={() => mudarStatus("Planejada")} className="btn-ghost btn-sm">
              Reativar
            </button>
          )}
        </div>
      )}
    </Drawer>
  );
}

// ---------------------------------------------------------------- veículo

export function DrawerVeiculo({ veiculo, onFechar, onMover, onEditar, onHistorico }: { veiculo: Veiculo; onFechar: () => void; onMover: () => void; onEditar: () => void; onHistorico: () => void }) {
  const { dados, hoje, equipePorId } = useDados();
  const movs = dados.movimentos.filter((m) => m.veiculoId === veiculo.id);
  const loc = localizacaoNoDia(movs as MovimentoBase[], hoje);
  const prox = proximoMovimento(movs as MovimentoBase[], hoje);
  const eq = loc?.equipeId ? equipePorId.get(loc.equipeId) : null;
  const recentes = [...movs].sort((a, b) => b.inicio.localeCompare(a.inicio)).slice(0, 5);
  return (
    <Drawer
      titulo={
        <span className="flex flex-wrap items-center gap-2">
          {veiculo.identificacao}
          <span className={CHIP_VEICULO[veiculo.status]}>{veiculo.status}</span>
        </span>
      }
      subtitulo={`${veiculo.codigo}${veiculo.placa ? ` · ${veiculo.placa}` : ""}${veiculo.modelo ? ` · ${veiculo.modelo}` : ""}`}
      onFechar={onFechar}
      rodape={
        dados.podeEditar ? (
          <div className="flex gap-2">
            <button onClick={onMover} className="btn-primary flex-1">
              Mover veículo
            </button>
            <button onClick={onEditar} className="btn-ghost">
              Editar
            </button>
          </div>
        ) : undefined
      }
    >
      <div className="rounded-xl border border-line p-4">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Onde está hoje</div>
        {loc ? (
          <>
            <div className="mt-1.5 flex items-center gap-2 font-display text-xl font-semibold">
              <PontoContrato cor={corDoContrato(loc.projeto)} />
              {rotuloContrato(loc.projeto)}
            </div>
            <div className="mt-1 text-sm text-gray-600">{[eq ? `${eq.codigo} · ${eq.nome}` : null, loc.local].filter(Boolean).join(" · ") || "Sem equipe ou local informado"}</div>
            <div className="mt-1 text-xs text-gray-500">
              desde {fmtDia(loc.inicio)} · {diferencaDias(loc.inicio, hoje) + 1} dia(s)
            </div>
          </>
        ) : (
          <p className="mt-1.5 text-sm text-bad">Sem localização registrada.</p>
        )}
        {prox && (
          <div className="mt-3 rounded-lg bg-info-soft px-3 py-2 text-xs text-info">
            Próxima mudança: {fmtDia(prox.inicio)} → <strong>{rotuloContrato(prox.projeto)}</strong>
          </div>
        )}
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3">
        <Fato rotulo="Placa">{veiculo.placa ?? <span className="text-warn">a informar</span>}</Fato>
        <Fato rotulo="Modelo">{veiculo.modelo ?? "—"}</Fato>
        <Fato rotulo="Tração 4x4">{veiculo.tracao4x4 === true ? "Sim" : veiculo.tracao4x4 === false ? "Não" : "—"}</Fato>
      </dl>
      {veiculo.observacao && <p className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">{veiculo.observacao}</p>}

      <h4 className="mt-6 flex items-center justify-between font-display text-base font-semibold">
        Últimas passagens
        <button onClick={onHistorico} className="text-xs font-semibold text-brand-dark hover:underline">
          ver histórico completo
        </button>
      </h4>
      <ol className="mt-2 space-y-1.5">
        {recentes.map((m) => (
          <li key={m.id} className="flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 text-sm">
            <span className="flex min-w-0 items-center gap-2">
              <PontoContrato cor={corDoContrato(m.projeto)} tam={8} />
              <span className="truncate font-medium">{rotuloContrato(m.projeto)}</span>
            </span>
            <span className="shrink-0 text-xs text-gray-500">
              {fmtDia(m.inicio)} → {m.fim ? fmtDia(m.fim) : "hoje"}
            </span>
          </li>
        ))}
      </ol>
    </Drawer>
  );
}

// ---------------------------------------------------------------- consulta de período

/** "Quem está livre de X a Y?": equipes, pessoas e veículos para montar uma campanha. */
export function DrawerConsulta({ inicio: ini0, fim: fim0, onFechar, onCriarCampanha }: { inicio: Dia; fim: Dia; onFechar: () => void; onCriarCampanha: (inicio: Dia, fim: Dia, grupo: string) => void }) {
  const { dados, regra, vagasPorEquipe, idx, equipesCampo } = useDados();
  const grupos = ordenarGrupos(equipesCampo.map((e) => e.grupo));
  const [inicio, setInicio] = useState(ini0);
  const [fim, setFim] = useState(fim0);
  const [grupo, setGrupo] = useState("Fauna");
  const valido = inicio <= fim;

  const equipes = useMemo(() => {
    if (!valido) return [];
    return equipesCampo
      .filter((e) => (!grupo || e.grupo === grupo) && e.status !== "Inativa")
      .map((e) => avaliarEquipe(e, vagasPorEquipe.get(e.id) ?? [], idx, inicio, fim));
  }, [equipesCampo, vagasPorEquipe, idx, inicio, fim, grupo, valido]);
  const completas = equipes.filter((l) => l.disponibilidade === "DISPONÍVEL");
  const comLivres = equipes.filter((l) => l.disponibilidade !== "DISPONÍVEL" && l.livres > 0).sort((a, b) => b.livres - a.livres);

  const livres = useMemo(() => (valido ? livresNoPeriodo(regra, inicio, fim, { grupo: grupo || null }).livres : []), [regra, inicio, fim, grupo, valido]);
  const porCargo = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of livres) m.set(p.cargo, (m.get(p.cargo) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [livres]);
  const livres4x4 = livres.filter((p) => dados.vagas.find((v) => v.id === p.id)?.direcao4x4).length;
  const veiculosLivres = dados.veiculos.filter((v) => v.status === "Disponível");
  const dias = valido ? diferencaDias(inicio, fim) + 1 : 0;

  return (
    <Drawer titulo="Consultar período" subtitulo="Quem e o que está livre para uma campanha." onFechar={onFechar} rodape={<button disabled={!valido} onClick={() => onCriarCampanha(inicio, fim, grupo)} className="btn-primary w-full">Criar campanha neste período</button>}>
      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="De">
          <input type="date" value={inicio} onChange={(e) => e.target.value && setInicio(e.target.value)} className="field" />
        </Campo>
        <Campo rotulo="Até">
          <input type="date" value={fim} min={inicio} onChange={(e) => e.target.value && setFim(e.target.value)} className="field" />
        </Campo>
        <Campo rotulo="Grupo" className="col-span-2">
          <select value={grupo} onChange={(e) => setGrupo(e.target.value)} className="field">
            <option value="">Todos</option>
            {grupos.map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
        </Campo>
      </div>
      {!valido && <div className="mt-3"><Aviso tipo="erro">O fim não pode ser antes do início.</Aviso></div>}

      {valido && (
        <>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-ok-soft px-2 py-3">
              <div className="num font-display text-3xl font-semibold text-ok">{completas.length}</div>
              <div className="text-[11px] font-medium text-ok">equipes prontas</div>
            </div>
            <div className="rounded-xl bg-brand-soft px-2 py-3">
              <div className="num font-display text-3xl font-semibold text-brand-dark">{livres.length}</div>
              <div className="text-[11px] font-medium text-brand-dark">pessoas livres</div>
            </div>
            <div className="rounded-xl bg-info-soft px-2 py-3">
              <div className="num font-display text-3xl font-semibold text-info">{veiculosLivres.length}</div>
              <div className="text-[11px] font-medium text-info">veículos disponíveis</div>
            </div>
          </div>
          <p className="mt-2 text-center text-[11px] text-gray-500">
            {dias} dia{dias === 1 ? "" : "s"} · só conta quem está livre em todos os dias
            {livres4x4 > 0 ? ` · ${livres4x4} dirige(m) 4x4` : ""}
          </p>

          <h4 className="mt-5 font-display text-sm font-semibold">Equipes completas e livres</h4>
          {completas.length === 0 ? (
            <p className="mt-1.5 text-sm text-gray-500">Nenhuma equipe inteira está livre neste período; dá para montar com pessoas soltas.</p>
          ) : (
            <ul className="mt-1.5 space-y-1">
              {completas.map((l) => (
                <li key={l.id} className="flex items-center justify-between rounded-lg border border-line px-3 py-2 text-sm">
                  <span className="flex items-center gap-2 font-medium">
                    <PontoContrato cor={corDoContrato(l.projeto)} tam={8} />
                    {l.nome}
                  </span>
                  <span className="text-xs text-gray-500">{l.vagasPrevistas} pessoas</span>
                </li>
              ))}
            </ul>
          )}

          <h4 className="mt-5 font-display text-sm font-semibold">Pessoas livres por função</h4>
          <ul className="mt-1.5 space-y-1">
            {porCargo.map(([c, n]) => (
              <li key={c} className="flex items-center justify-between text-sm">
                <span className="truncate pr-2">{c}</span>
                <span className="num font-semibold">{n}</span>
              </li>
            ))}
            {porCargo.length === 0 && <li className="text-sm text-gray-500">Ninguém livre neste período.</li>}
          </ul>

          {comLivres.length > 0 && (
            <>
              <h4 className="mt-5 font-display text-sm font-semibold">Equipes com gente livre (incompletas)</h4>
              <ul className="mt-1.5 space-y-1">
                {comLivres.slice(0, 8).map((l) => (
                  <li key={l.id} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm">
                    <span className="truncate pr-2">{l.nome}</span>
                    <span className="num shrink-0 text-xs text-gray-600">
                      <strong>{l.livres}</strong> livres de {l.vagasPrevistas}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}

          {veiculosLivres.length > 0 && (
            <>
              <h4 className="mt-5 font-display text-sm font-semibold">Veículos disponíveis</h4>
              <ul className="mt-1.5 space-y-1">
                {veiculosLivres.slice(0, 8).map((v) => (
                  <li key={v.id} className="flex items-center justify-between rounded-lg border border-line px-3 py-2 text-sm">
                    <span className="font-medium">{v.identificacao}</span>
                    <span className="text-xs text-gray-500">{v.placa ?? "sem placa"}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </Drawer>
  );
}
