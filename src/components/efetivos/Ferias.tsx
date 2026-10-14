"use client";

import { useMemo, useState } from "react";
import { ordenarGrupos, somarDias, temNome, TIPOS_AUSENCIA, type Dia } from "@/lib/efetivos/disponibilidade";
import { useDados } from "./DadosContext";
import {
  A_DEFINIR,
  corDaAusencia,
  corDoContrato,
  diasDoPeriodo,
  fmtDia,
  fmtDiaCurto,
  rotuloContrato,
  segundaDaSemana,
  situacaoDaAusencia,
  type Ausencia,
  type Vaga,
} from "./comum";
import { IcDir, IcEsq, IcLapis, IcMais } from "./icones";
import ModalAusencia from "./modais/ModalAusencia";
import CabecalhoTempo from "./quadro/CabecalhoTempo";
import { ALTURA_FAIXA, ESQ, distribuir, type Barra } from "./quadro/geometria";
import Lane from "./quadro/Lane";
import { CabecalhoPagina, PontoContrato, Segmentado, Vazio } from "./ui";

type Zoom = "dia" | "semana" | "mes";
const LARG_DIA: Record<Zoom, number> = { dia: 28, semana: 14, mes: 5 };
const SEMANAS: Record<Zoom, number> = { dia: 8, semana: 20, mes: 52 };

function Kpi({ rotulo, valor, sub, cor }: { rotulo: string; valor: number | string; sub?: string; cor?: string }) {
  return (
    <div className="card p-4">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">{rotulo}</div>
      <div className="num mt-2 font-display text-[38px] font-semibold leading-none" style={{ color: cor ?? "#101B17" }}>
        {valor}
      </div>
      {sub && <div className="mt-1.5 text-xs text-gray-500">{sub}</div>}
    </div>
  );
}

export default function Ferias() {
  const { dados, hoje, equipePorId, vagaPorId, nomeDe, vagasPorEquipe } = useDados();
  const grupos = ordenarGrupos(dados.equipes.map((e) => e.grupo));
  const [visao, setVisao] = useState<"tempo" | "lista">("tempo");
  const [zoom, setZoom] = useState<Zoom>("semana");
  const [inicio, setInicio] = useState<Dia>(() => segundaDaSemana(somarDias(hoje, -14)));
  const [grupo, setGrupo] = useState("");
  const [equipeId, setEquipeId] = useState("");
  const [tipo, setTipo] = useState("");
  const [busca, setBusca] = useState("");
  const [situacao, setSituacao] = useState<"todas" | "em curso" | "futura" | "encerrada">("todas");
  const [todasAsPessoas, setTodasAsPessoas] = useState(false);
  const [modal, setModal] = useState<{ ausencia?: Ausencia; vagaIds?: string[]; periodo?: { inicio: string; fim: string } } | null>(null);

  const dw = LARG_DIA[zoom];
  const totalDias = SEMANAS[zoom] * 7;
  const fimJanela = somarDias(inicio, totalDias - 1);
  const largura = totalDias * dw;
  const posHoje = Math.round((Date.parse(`${hoje}T00:00:00Z`) - Date.parse(`${inicio}T00:00:00Z`)) / 86400000);
  const passo = zoom === "dia" ? 7 : zoom === "semana" ? 28 : 91;

  // ---- ausências com a pessoa e a equipe
  const linhasAus = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return dados.ausencias
      .map((a) => ({ a, v: vagaPorId.get(a.vagaId) }))
      .filter((x): x is { a: Ausencia; v: Vaga } => !!x.v)
      .map((x) => ({ ...x, eq: equipePorId.get(x.v.equipeId)!, sit: situacaoDaAusencia(x.a, hoje) }))
      .filter(({ a, v, eq, sit }) => {
        if (grupo && eq.grupo !== grupo) return false;
        if (equipeId && eq.id !== equipeId) return false;
        if (tipo && a.tipo !== tipo) return false;
        if (situacao !== "todas" && sit !== situacao) return false;
        if (t && !`${v.nome ?? ""} ${v.cargo} ${eq.nome}`.toLowerCase().includes(t)) return false;
        return true;
      })
      .sort((x, y) => x.a.inicio.localeCompare(y.a.inicio));
  }, [dados.ausencias, vagaPorId, equipePorId, hoje, grupo, equipeId, tipo, situacao, busca]);

  // ---- indicadores
  const nomeadas = dados.vagas.filter(temNome);
  const foraHoje = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of dados.ausencias) if (a.inicio <= hoje && a.fim >= hoje) m.set(a.vagaId, a.tipo);
    return m;
  }, [dados.ausencias, hoje]);
  const porTipoHoje = useMemo(() => {
    const c = new Map<string, number>();
    for (const t of foraHoje.values()) c.set(t, (c.get(t) ?? 0) + 1);
    return [...c.entries()].sort((a, b) => b[1] - a[1]);
  }, [foraHoje]);
  const em30 = somarDias(hoje, 30);
  const saem30 = dados.ausencias.filter((a) => a.inicio > hoje && a.inicio <= em30).length;
  const voltam30 = dados.ausencias.filter((a) => a.inicio <= hoje && a.fim >= hoje && a.fim < em30).length;

  // ---- linha do tempo: quem entra
  const pessoasNaJanela = useMemo(() => {
    const t = busca.trim().toLowerCase();
    const comAusencia = new Set(dados.ausencias.filter((a) => a.inicio <= fimJanela && a.fim >= inicio && (!tipo || a.tipo === tipo)).map((a) => a.vagaId));
    return nomeadas.filter((v) => {
      const eq = equipePorId.get(v.equipeId);
      if (!eq) return false;
      if (grupo && eq.grupo !== grupo) return false;
      if (equipeId && eq.id !== equipeId) return false;
      if (t && !`${v.nome ?? ""} ${v.cargo}`.toLowerCase().includes(t)) return false;
      const foraPorOutroMotivo = (v.status !== "Vigente") || (v.disponivelAPartir && v.disponivelAPartir > inicio);
      return todasAsPessoas || comAusencia.has(v.id) || !!foraPorOutroMotivo;
    });
  }, [dados.ausencias, nomeadas, equipePorId, grupo, equipeId, tipo, busca, todasAsPessoas, inicio, fimJanela]);

  const porEquipe = useMemo(() => {
    const m = new Map<string, Vaga[]>();
    for (const v of pessoasNaJanela) {
      if (!m.has(v.equipeId)) m.set(v.equipeId, []);
      m.get(v.equipeId)!.push(v);
    }
    return [...m.entries()].sort(([a], [b]) => (equipePorId.get(a)?.codigo ?? "").localeCompare(equipePorId.get(b)?.codigo ?? ""));
  }, [pessoasNaJanela, equipePorId]);

  function barrasDe(v: Vaga): Barra[] {
    const out: Barra[] = [];
    for (const a of dados.ausencias.filter((x) => x.vagaId === v.id && (!tipo || x.tipo === tipo))) {
      out.push({
        id: a.id,
        inicio: a.inicio,
        fim: a.fim,
        rotulo: `${a.tipo} · volta ${fmtDiaCurto(somarDias(a.fim, 1))}`,
        cor: corDaAusencia(a.tipo),
        dica: `${a.tipo}: ${fmtDia(a.inicio)} a ${fmtDia(a.fim)} (${diasDoPeriodo(a.inicio, a.fim)} dias)\nVolta em ${fmtDia(somarDias(a.fim, 1))}${a.observacao ? `\n${a.observacao}` : ""}`,
        onClick: () => setModal({ ausencia: a }),
      });
    }
    if (v.contratoAtual && v.disponivelAPartir && v.disponivelAPartir > inicio) {
      const ate = somarDias(v.disponivelAPartir, -1);
      out.push({ id: `${v.id}-fora`, inicio, fim: ate, rotulo: `Em ${v.contratoAtual} até ${fmtDiaCurto(ate)}`, cor: "#C9DDF2", corTexto: "#1D6FB8", dica: `Em ${v.contratoAtual} até ${fmtDia(ate)}${v.destino ? `\nVai para: ${v.destino}` : ""}`, listrada: true });
    }
    if (v.status !== "Vigente") out.push({ id: `${v.id}-st`, inicio, fim: fimJanela, rotulo: v.status, cor: "#F7C9C5", corTexto: "#C9342B", dica: `Indisponível: ${v.status}`, listrada: true });
    return out;
  }

  // ---- faixa de impacto: pessoas fora em cada semana
  const semanas = useMemo(() => Array.from({ length: SEMANAS[zoom] }, (_, k) => somarDias(inicio, k * 7)), [inicio, zoom]);
  const foraPorSemana = useMemo(
    () =>
      semanas.map((s) => {
        const fimS = somarDias(s, 6);
        const fora = new Set<string>();
        for (const a of dados.ausencias) if (a.inicio <= fimS && a.fim >= s) fora.add(a.vagaId);
        return { s, n: fora.size };
      }),
    [semanas, dados.ausencias]
  );
  const maxFora = Math.max(1, ...foraPorSemana.map((x) => x.n));

  const podeEditar = dados.podeEditar;
  const equipesFiltro = dados.equipes.filter((e) => !grupo || e.grupo === grupo);

  return (
    <div>
      <CabecalhoPagina
        titulo="Férias e ausências"
        subtitulo="Quando não dá para contar com cada pessoa. Quem estiver ausente aparece como indisponível ao montar a equipe de uma campanha, com as datas e a volta."
        acoes={
          podeEditar && (
            <button onClick={() => setModal({})} className="btn-primary">
              <IcMais tam={16} /> Lançar ausência
            </button>
          )
        }
      />

      <section className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4" aria-label="Indicadores">
        <Kpi rotulo="Fora hoje" valor={foraHoje.size} cor={foraHoje.size > 0 ? "#B86E00" : "#101B17"} sub={porTipoHoje.length ? porTipoHoje.map(([t, n]) => `${n} ${t.toLowerCase()}`).join(" · ") : `de ${nomeadas.length} com profissional`} />
        <Kpi rotulo="Saem em 30 dias" valor={saem30} cor="#1D6FB8" sub="começam nos próximos 30 dias" />
        <Kpi rotulo="Voltam em 30 dias" valor={voltam30} cor="#0E8F63" sub="terminam nos próximos 30 dias" />
        <Kpi rotulo="Lançamentos" valor={dados.ausencias.length} sub="férias, atestados, afastamentos…" />
      </section>

      <div className="card mb-4 flex flex-wrap items-end gap-3 p-4">
        <Segmentado valor={visao} onChange={setVisao} opcoes={[{ id: "tempo", rotulo: "Linha do tempo" }, { id: "lista", rotulo: "Lista" }]} />
        <label>
          <span className="label">Grupo</span>
          <select value={grupo} onChange={(e) => { setGrupo(e.target.value); setEquipeId(""); }} className="field">
            <option value="">Todos</option>
            {grupos.map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="label">Equipe</span>
          <select value={equipeId} onChange={(e) => setEquipeId(e.target.value)} className="field">
            <option value="">Todas</option>
            {equipesFiltro.map((e) => (
              <option key={e.id} value={e.id}>
                {e.codigo} · {e.nome}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="label">Tipo</span>
          <select value={tipo} onChange={(e) => setTipo(e.target.value)} className="field">
            <option value="">Todos</option>
            {TIPOS_AUSENCIA.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <label className="min-w-[180px] flex-1">
          <span className="label">Buscar pessoa ou função</span>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} className="field" />
        </label>
        {visao === "lista" && (
          <Segmentado
            valor={situacao}
            onChange={setSituacao}
            opcoes={[
              { id: "todas", rotulo: "Todas" },
              { id: "em curso", rotulo: "Em curso" },
              { id: "futura", rotulo: "Futuras" },
              { id: "encerrada", rotulo: "Encerradas" },
            ]}
          />
        )}
      </div>

      {visao === "tempo" ? (
        <>
          <div className="no-print mb-3 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1">
              <button onClick={() => setInicio((i) => somarDias(i, -passo))} className="btn-ghost px-2" aria-label="Voltar no tempo">
                <IcEsq tam={18} />
              </button>
              <button onClick={() => setInicio(segundaDaSemana(somarDias(hoje, -14)))} className="btn-ghost">
                Hoje
              </button>
              <button onClick={() => setInicio((i) => somarDias(i, passo))} className="btn-ghost px-2" aria-label="Avançar no tempo">
                <IcDir tam={18} />
              </button>
            </div>
            <Segmentado valor={zoom} onChange={setZoom} opcoes={[{ id: "dia", rotulo: "Dia" }, { id: "semana", rotulo: "Semana" }, { id: "mes", rotulo: "Ano" }]} />
            <label className="flex items-center gap-2 text-xs text-gray-600">
              <input type="checkbox" checked={todasAsPessoas} onChange={(e) => setTodasAsPessoas(e.target.checked)} className="accent-[#0A9E7F]" />
              mostrar também quem não tem ausência (para lançar arrastando)
            </label>
            <div className="ml-auto flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-gray-500">
              {TIPOS_AUSENCIA.slice(0, 5).map((t) => (
                <span key={t} className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-4 rounded" style={{ background: corDaAusencia(t) }} />
                  {t}
                </span>
              ))}
            </div>
          </div>

          <div className="card overflow-hidden">
            <div className="overflow-auto" style={{ maxHeight: "calc(133.333vh - 400px)", minHeight: 320 }}>
              <div className="relative" style={{ minWidth: ESQ + largura }}>
                <CabecalhoTempo
                  inicio={inicio}
                  totalDias={totalDias}
                  dw={dw}
                  hoje={hoje}
                  esquerda={<span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{fmtDiaCurto(inicio)} → {fmtDiaCurto(fimJanela)}</span>}
                />
                <div className="flex border-b border-line">
                  <div className="sticky left-0 z-10 flex shrink-0 flex-col justify-center border-r border-line bg-white px-4" style={{ width: ESQ, height: 40 }}>
                    <div className="text-[13px] font-semibold">Pessoas fora por semana</div>
                  </div>
                  <Lane inicio={inicio} totalDias={totalDias} dw={dw} altura={40}>
                    {foraPorSemana.map(({ s, n }, k) => {
                      const forte = n / maxFora;
                      return (
                        <div
                          key={s}
                          className="absolute top-1.5 flex items-center justify-center rounded-md text-[12px] font-bold"
                          style={{ left: k * 7 * dw + 2, width: 7 * dw - 4, height: 28, background: n === 0 ? "#EEF2EF" : `rgba(184,110,0,${0.14 + forte * 0.4})`, color: n === 0 ? "#9AA8A1" : "#7A4A00" }}
                          title={`Semana de ${fmtDia(s)}: ${n} pessoa(s) fora`}
                        >
                          {n}
                        </div>
                      );
                    })}
                  </Lane>
                </div>

                {porEquipe.map(([eqId, pessoas]) => {
                  const eq = equipePorId.get(eqId)!;
                  return (
                    <div key={eqId}>
                      <div className="flex border-b border-line bg-gray-50">
                        <div className="sticky left-0 z-10 flex shrink-0 items-center gap-2 border-r border-line bg-gray-50 px-4" style={{ width: ESQ, height: 32 }}>
                          <PontoContrato cor={corDoContrato(eq.projeto)} tam={9} />
                          <span className="truncate text-[12.5px] font-semibold" title={eq.nome}>
                            {eq.codigo} · {eq.nome}
                          </span>
                        </div>
                        <div className="flex flex-1 items-center px-3 text-[11px] text-gray-500">
                          {rotuloContrato(eq.projeto)} · {pessoas.length} de {(vagasPorEquipe.get(eq.id) ?? []).filter(temNome).length} pessoas
                        </div>
                      </div>
                      {pessoas.map((v) => (
                        <div key={v.id} className="flex border-b border-gray-100 hover:bg-gray-50/50">
                          <div className="sticky left-0 z-10 flex shrink-0 items-center gap-2 border-r border-line bg-white py-1 pl-8 pr-3" style={{ width: ESQ, height: 40 }}>
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-[12.5px] font-medium">{nomeDe(v)}</div>
                              <div className="truncate text-[10.5px] text-gray-500">{v.cargo}</div>
                            </div>
                            {podeEditar && (
                              <button onClick={() => setModal({ vagaIds: [v.id] })} className="shrink-0 rounded border border-line p-1 text-gray-500 hover:bg-gray-50 hover:text-brand-dark" title="Lançar ausência" aria-label="Lançar ausência">
                                <IcMais tam={12} />
                              </button>
                            )}
                          </div>
                          <Lane
                            inicio={inicio}
                            totalDias={totalDias}
                            dw={dw}
                            altura={40}
                            barras={distribuir(barrasDe(v)).map((x) => ({ ...x, faixa: 0 }))}
                            topoBarras={9}
                            alturaBarra={ALTURA_FAIXA - 6}
                            onSelecionar={podeEditar ? (a, b) => setModal({ vagaIds: [v.id], periodo: { inicio: a, fim: b } }) : undefined}
                            umDia={zoom === "dia"}
                            dica="Arraste para lançar uma ausência"
                          />
                        </div>
                      ))}
                    </div>
                  );
                })}
                {porEquipe.length === 0 && <Vazio titulo="Nenhuma ausência neste período" texto={podeEditar ? "Use “Lançar ausência” ou marque “mostrar também quem não tem ausência” e arraste sobre a pessoa." : undefined} />}

                {posHoje >= 0 && posHoje < totalDias && (
                  <div className="pointer-events-none absolute bottom-0 top-0 z-[8] w-px bg-accent" style={{ left: ESQ + posHoje * dw + dw / 2 }} title={`Hoje (${fmtDia(hoje)})`} />
                )}
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="card overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Pessoa</th>
                <th>Equipe</th>
                <th>Tipo</th>
                <th>Período</th>
                <th className="text-right">Dias</th>
                <th>Volta em</th>
                <th>Situação</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {linhasAus.map(({ a, v, eq, sit }) => (
                <tr key={a.id} className="align-top">
                  <td>
                    <div className="font-medium">{nomeDe(v)}</div>
                    <div className="text-[11px] text-gray-500">{v.cargo}</div>
                  </td>
                  <td>
                    <span className="inline-flex items-center gap-1.5">
                      <PontoContrato cor={corDoContrato(eq.projeto)} tam={8} />
                      {eq.nome}
                    </span>
                    <div className="text-[11px] text-gray-500">{eq.projeto === A_DEFINIR ? "contrato a definir" : eq.projeto}</div>
                  </td>
                  <td>
                    <span className="inline-flex items-center gap-1.5 font-medium">
                      <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: corDaAusencia(a.tipo) }} />
                      {a.tipo}
                    </span>
                    {a.observacao && <div className="text-[11px] text-gray-400">{a.observacao}</div>}
                  </td>
                  <td className="whitespace-nowrap">
                    {fmtDia(a.inicio)} a {fmtDia(a.fim)}
                  </td>
                  <td className="num text-right">{diasDoPeriodo(a.inicio, a.fim)}</td>
                  <td className="whitespace-nowrap">{fmtDia(somarDias(a.fim, 1))}</td>
                  <td>
                    <span className={sit === "em curso" ? "chip-warn" : sit === "futura" ? "chip-info" : "chip-mute"}>{sit}</span>
                  </td>
                  <td className="whitespace-nowrap text-right">
                    {podeEditar && (
                      <button onClick={() => setModal({ ausencia: a })} className="btn-ghost btn-sm">
                        <IcLapis tam={13} /> Corrigir
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {linhasAus.length === 0 && (
                <tr>
                  <td colSpan={8}>
                    <Vazio titulo="Nenhuma ausência neste filtro" texto={dados.ausencias.length === 0 ? "Nenhuma ausência foi lançada ainda. Lance as férias e os afastamentos para o sistema saber com quem não dá para contar." : undefined} />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {modal && <ModalAusencia ausencia={modal.ausencia} vagaIds={modal.vagaIds} periodo={modal.periodo} onFechar={() => setModal(null)} />}
    </div>
  );
}
