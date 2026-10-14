"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  STATUS_CAMPANHA_QUE_LIBERAM,
  avaliarEquipe,
  conferirNecessidade,
  diferencaDias,
  montarPainel,
  ordenarGrupos,
  somarDias,
  temNome,
  type Dia,
} from "@/lib/efetivos/disponibilidade";
import { localizacaoNoDia } from "@/lib/efetivos/veiculos";
import { useDados } from "../DadosContext";
import {
  A_DEFINIR,
  CHIP_STATUS_CAMPANHA,
  CHIP_VEICULO,
  COR_STATUS_CAMPANHA,
  ESTADO_VISUAL,
  corDoContrato,
  diaDaSemana,
  ehFimDeSemana,
  estadoVisual,
  fmtDia,
  fmtDiaCurto,
  mesCurto,
  rotuloContrato,
  segundaDaSemana,
  semanaIso,
  type Ausencia,
  type Campanha,
  type Equipe,
  type Vaga,
  type Veiculo,
} from "../comum";
import { IcBaixo, IcBusca, IcDir, IcEsq, IcMais } from "../icones";
import ModalAusencia from "../modais/ModalAusencia";
import ModalAusencias from "../modais/ModalAusencias";
import ModalEquipe from "../modais/ModalEquipe";
import { ModalHistoricoVeiculo, ModalMover, ModalVeiculo } from "../modais/ModaisVeiculo";
import ModalVaga from "../modais/ModalVaga";
import { Aviso, CabecalhoPagina, PontoContrato, Segmentado } from "../ui";
import { DrawerCampanha, DrawerConsulta, DrawerVeiculo } from "./Drawers";
import { ALTURA_FAIXA, ESQ, compactar, distribuir, type Barra } from "./geometria";
import Lane from "./Lane";

type Zoom = "dia" | "semana" | "mes";
const LARG_DIA: Record<Zoom, number> = { dia: 28, semana: 14, mes: 5 };
const SEMANAS: Record<Zoom, number> = { dia: 8, semana: 20, mes: 52 };
const SEM_LOCAL = "Sem localização";

type ModalEstado =
  | { t: "equipe"; equipe?: Equipe; projeto?: string }
  | { t: "vaga"; equipe?: Equipe; vaga?: Vaga }
  | { t: "ausencias"; vaga: Vaga }
  | { t: "ausencia"; ausencia?: Ausencia; vagaIds?: string[]; periodo?: { inicio: Dia; fim: Dia } }
  | { t: "veiculo"; veiculo?: Veiculo }
  | { t: "mover"; veiculo: Veiculo; periodo?: { inicio: Dia; fim: Dia } }
  | { t: "historico"; veiculo: Veiculo };
type DrawerEstado = { t: "campanha"; id: string } | { t: "veiculo"; id: string } | { t: "consulta"; inicio: Dia; fim: Dia };

// ---------------------------------------------------------------- peças de linha

function Esq({ children, className = "", altura }: { children: React.ReactNode; className?: string; altura?: number }) {
  return (
    <div className={`sticky left-0 z-10 shrink-0 border-r border-line bg-white ${className}`} style={{ width: ESQ, height: altura }}>
      {children}
    </div>
  );
}

function TituloSecao({ rotulo, n, aberto, onAlternar, extra }: { rotulo: string; n?: number; aberto: boolean; onAlternar: () => void; extra?: React.ReactNode }) {
  return (
    <div className="flex border-b border-line bg-gray-50">
      <Esq className="bg-gray-50">
        <button onClick={onAlternar} className="flex h-full w-full items-center gap-2 px-4 py-2.5 text-left font-display text-[13px] font-semibold uppercase tracking-[0.12em] text-gray-600" aria-expanded={aberto}>
          <span className={`transition-transform ${aberto ? "" : "-rotate-90"}`}>
            <IcBaixo tam={15} />
          </span>
          {rotulo}
          {n !== undefined && <span className="num rounded-md bg-white px-1.5 text-[11px] font-semibold text-gray-500">{n}</span>}
        </button>
      </Esq>
      <div className="flex flex-1 items-center px-3 text-xs text-gray-500">{extra}</div>
    </div>
  );
}

// ---------------------------------------------------------------- tela

export default function Quadro() {
  const { dados, regra, idx, hoje, vagasPorEquipe, equipesCampo, equipePorId, campanhaPorId, vagaPorId, veiculoPorId, nomeDe } = useDados();
  const podeEditar = dados.podeEditar;
  const router = useRouter();

  const [zoom, setZoom] = useState<Zoom>("semana");
  const [inicio, setInicio] = useState<Dia>(() => segundaDaSemana(somarDias(hoje, -14)));
  const [grupo, setGrupo] = useState("");
  const [contrato, setContrato] = useState("");
  const [expandidas, setExpandidas] = useState<Set<string>>(new Set());
  const [fechadas, setFechadas] = useState<Set<string>>(new Set());
  const [encerradas, setEncerradas] = useState(false);
  const [modal, setModal] = useState<ModalEstado | null>(null);
  const [drawer, setDrawer] = useState<DrawerEstado | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const dw = LARG_DIA[zoom];
  const totalDias = SEMANAS[zoom] * 7;
  const fimJanela = somarDias(inicio, totalDias - 1);
  const largura = totalDias * dw;
  const posHoje = diferencaDias(inicio, hoje);
  const dias = useMemo(() => Array.from({ length: totalDias }, (_, i) => somarDias(inicio, i)), [inicio, totalDias]);

  // abre já na equipe pedida pelo Painel (?equipe=ID)
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("equipe");
    if (id && equipePorId.has(id)) setExpandidas(new Set([id]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const grupos = useMemo(() => ordenarGrupos(equipesCampo.map((e) => e.grupo)), [equipesCampo]);
  const contratos = useMemo(() => Array.from(new Set(equipesCampo.map((e) => e.projeto))).sort((a, b) => (a === A_DEFINIR ? 1 : b === A_DEFINIR ? -1 : a.localeCompare(b))), [equipesCampo]);

  const equipesVisiveis = useMemo(() => equipesCampo.filter((e) => (!grupo || e.grupo === grupo) && (!contrato || e.projeto === contrato)), [equipesCampo, grupo, contrato]);
  const porContrato = useMemo(() => {
    const m = new Map<string, Equipe[]>();
    for (const e of equipesVisiveis) {
      if (!m.has(e.projeto)) m.set(e.projeto, []);
      m.get(e.projeto)!.push(e);
    }
    return [...m.entries()].sort(([a], [b]) => (a === A_DEFINIR ? 1 : b === A_DEFINIR ? -1 : a.localeCompare(b)));
  }, [equipesVisiveis]);

  // ---- estado da equipe dia a dia (a faixa fina embaixo de cada linha)
  const faixasEquipe = useMemo(() => {
    const m = new Map<string, ReturnType<typeof compactar>>();
    for (const e of equipesVisiveis) {
      const vs = vagasPorEquipe.get(e.id) ?? [];
      m.set(e.id, compactar(dias.map((d) => estadoVisual(avaliarEquipe(e, vs, idx, d)))));
    }
    return m;
  }, [equipesVisiveis, vagasPorEquipe, idx, dias]);

  // ---- campanhas visíveis
  const campanhasVisiveis = useMemo(
    () => dados.campanhas.filter((c) => (encerradas || !STATUS_CAMPANHA_QUE_LIBERAM.includes(c.status)) && (!grupo || c.grupo === grupo) && (!contrato || c.projeto === contrato)),
    [dados.campanhas, encerradas, grupo, contrato]
  );
  const membrosDe = (c: Campanha) => dados.alocacoes.filter((a) => a.campanhaId === c.id).map((a) => vagaPorId.get(a.vagaId)).filter((v): v is Vaga => !!v);

  // ---- barras de campanha por equipe-base (quem da equipe está escalado em cada campanha)
  const barrasEquipe = useMemo(() => {
    const m = new Map<string, Barra[]>();
    const acumulado = new Map<string, { inicio: Dia; fim: Dia; n: number; eq: string; c: Campanha }>();
    for (const a of dados.alocacoes) {
      const c = campanhaPorId.get(a.campanhaId);
      const v = vagaPorId.get(a.vagaId);
      if (!c || !v || STATUS_CAMPANHA_QUE_LIBERAM.includes(c.status)) continue;
      const k = `${v.equipeId}|${c.id}`;
      const x = acumulado.get(k) ?? { inicio: a.inicio, fim: a.fim, n: 0, eq: v.equipeId, c };
      acumulado.set(k, { ...x, inicio: a.inicio < x.inicio ? a.inicio : x.inicio, fim: a.fim > x.fim ? a.fim : x.fim, n: x.n + 1 });
    }
    for (const [k, x] of acumulado) {
      const total = (vagasPorEquipe.get(x.eq) ?? []).length;
      const barra: Barra = {
        id: k,
        inicio: x.inicio,
        fim: x.fim,
        rotulo: `${x.c.codigo} · ${x.n}/${total}`,
        cor: COR_STATUS_CAMPANHA[x.c.status] ?? "#0A9E7F",
        dica: `${x.c.codigo} — ${rotuloContrato(x.c.projeto)} · ${x.c.atividade}\n${fmtDia(x.inicio)} a ${fmtDia(x.fim)} · ${x.c.status}\n${x.n} de ${total} pessoas desta equipe`,
        onClick: () => setDrawer({ t: "campanha", id: x.c.id }),
      };
      if (!m.has(x.eq)) m.set(x.eq, []);
      m.get(x.eq)!.push(barra);
    }
    return m;
  }, [dados.alocacoes, campanhaPorId, vagaPorId, vagasPorEquipe]);

  // ---- barras por pessoa (equipe expandida)
  function barrasDaPessoa(v: Vaga): Barra[] {
    const out: Barra[] = [];
    for (const a of dados.alocacoes.filter((x) => x.vagaId === v.id)) {
      const c = campanhaPorId.get(a.campanhaId);
      if (!c || STATUS_CAMPANHA_QUE_LIBERAM.includes(c.status)) continue;
      out.push({ id: a.id, inicio: a.inicio, fim: a.fim, rotulo: c.codigo, cor: COR_STATUS_CAMPANHA[c.status] ?? "#0A9E7F", dica: `${c.codigo} — ${rotuloContrato(c.projeto)}\n${fmtDia(a.inicio)} a ${fmtDia(a.fim)}`, onClick: () => setDrawer({ t: "campanha", id: c.id }) });
    }
    for (const x of dados.ausencias.filter((a) => a.vagaId === v.id)) {
      out.push({ id: x.id, inicio: x.inicio, fim: x.fim, rotulo: x.tipo, cor: "#CBD4CE", corTexto: "#3E4A45", dica: `${x.tipo}\n${fmtDia(x.inicio)} a ${fmtDia(x.fim)}`, listrada: true, onClick: () => setModal({ t: "ausencia", ausencia: x }) });
    }
    if (v.contratoAtual && v.disponivelAPartir && v.disponivelAPartir > inicio) {
      const ate = somarDias(v.disponivelAPartir, -1);
      out.push({
        id: `${v.id}-fora`,
        inicio,
        fim: ate,
        rotulo: `Em ${v.contratoAtual} até ${fmtDiaCurto(ate)}${v.destino ? ` → ${v.destino}` : ""}`,
        cor: "#C9DDF2",
        corTexto: "#1D6FB8",
        dica: `Ainda em ${v.contratoAtual} até ${fmtDia(ate)}${v.destino ? `\nVai para: ${v.destino}` : ""}`,
        onClick: podeEditar ? () => setModal({ t: "vaga", vaga: v }) : undefined,
      });
    }
    if (temNome(v) && v.status !== "Vigente") {
      out.push({ id: `${v.id}-status`, inicio, fim: fimJanela, rotulo: v.status, cor: "#F7C9C5", corTexto: "#C9342B", dica: `Indisponível: ${v.status}`, listrada: true });
    }
    return out;
  }

  // ---- frota
  const frota = useMemo(() => {
    return dados.veiculos
      .map((v) => {
        const movs = dados.movimentos.filter((m) => m.veiculoId === v.id);
        const barras: Barra[] = movs
          .filter((m) => !contrato || m.projeto === contrato)
          .map((m) => {
            const eq = m.equipeId ? equipePorId.get(m.equipeId) : null;
            return {
              id: m.id,
              inicio: m.inicio,
              fim: m.fim ?? (fimJanela > m.inicio ? fimJanela : m.inicio),
              rotulo: `${rotuloContrato(m.projeto)}${eq ? ` · ${eq.nome}` : ""}${m.local ? ` · ${m.local}` : ""}`,
              cor: corDoContrato(m.projeto),
              dica: `${v.identificacao} em ${rotuloContrato(m.projeto)}${eq ? `\n${eq.codigo} ${eq.nome}` : ""}${m.local ? `\n${m.local}` : ""}\n${fmtDia(m.inicio)} a ${m.fim ? fmtDia(m.fim) : "hoje (continua)"}`,
              onClick: () => setDrawer({ t: "veiculo", id: v.id }),
            };
          });
        const loc = localizacaoNoDia(movs, hoje);
        return { v, barras, loc, visivel: !contrato || barras.length > 0 };
      })
      .filter((x) => x.visivel);
  }, [dados.veiculos, dados.movimentos, equipePorId, contrato, fimJanela, hoje]);

  // frota agrupada pelo contrato em que cada veículo está hoje
  const frotaPorContrato = useMemo(() => {
    const m = new Map<string, typeof frota>();
    for (const x of frota) {
      const k = x.loc?.projeto ?? SEM_LOCAL;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(x);
    }
    for (const lista of m.values()) lista.sort((a, b) => a.v.identificacao.localeCompare(b.v.identificacao, "pt-BR", { numeric: true }));
    return [...m.entries()].sort(([a], [b]) => (a === SEM_LOCAL ? 1 : b === SEM_LOCAL ? -1 : a === A_DEFINIR ? 1 : b === A_DEFINIR ? -1 : a.localeCompare(b)));
  }, [frota]);

  // ---- faixa "pessoas livres × faltam" por semana: livres na segunda-feira da semana e o que ainda falta nas campanhas do período
  const semanas = useMemo(() => Array.from({ length: SEMANAS[zoom] }, (_, k) => somarDias(inicio, k * 7)), [inicio, zoom]);
  const saldoSemanal = useMemo(
    () =>
      semanas.map((seg) => {
        const p = montarPainel(regra, seg);
        const livres = p.grupos.filter((g) => !grupo || g.grupo === grupo).reduce((s, g) => s + g.pessoas.livres, 0) + (grupo ? 0 : p.reserva.livres);
        const fimSem = somarDias(seg, 6);
        const falta = dados.campanhas
          .filter((c) => !STATUS_CAMPANHA_QUE_LIBERAM.includes(c.status) && (!grupo || c.grupo === grupo) && c.inicio <= fimSem && c.fim >= seg && c.necessidade.length > 0)
          .reduce((s, c) => s + conferirNecessidade(c.necessidade, membrosDe(c), []).falta, 0);
        return { seg, livres, falta };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [semanas, regra, dados.campanhas, dados.alocacoes, grupo]
  );

  // ---- navegação
  const passo = zoom === "dia" ? 7 : zoom === "semana" ? 28 : 91;
  const irParaHoje = () => setInicio(segundaDaSemana(somarDias(hoje, -14)));
  const alternar = (s: Set<string>, id: string, set: (v: Set<string>) => void) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    set(n);
  };

  const cabecalhoMeses = useMemo(() => {
    const blocos: { rotulo: string; dias: number }[] = [];
    for (const d of dias) {
      const r = `${mesCurto(d)}/${d.slice(2, 4)}`;
      if (blocos.length && blocos[blocos.length - 1].rotulo === r) blocos[blocos.length - 1].dias++;
      else blocos.push({ rotulo: r, dias: 1 });
    }
    return blocos;
  }, [dias]);

  const criarCampanhaDaEquipe = (e: Equipe, ini: Dia, fim: Dia) => router.push(`/montar?inicio=${ini}&fim=${fim}&grupo=${encodeURIComponent(e.grupo)}&equipe=${e.id}`);

  const campanhaAberta = drawer?.t === "campanha" ? campanhaPorId.get(drawer.id) : undefined;
  const veiculoAberto = drawer?.t === "veiculo" ? veiculoPorId.get(drawer.id) : undefined;

  return (
    <div>
      <CabecalhoPagina
        titulo="Quadro de equipes"
        subtitulo="Cada linha é uma equipe, por contrato. A faixa fina mostra, dia a dia, se ela está disponível, alocada, incompleta ou com ausência."
        acoes={
          podeEditar ? (
            <>
              <button onClick={() => setDrawer({ t: "consulta", inicio: hoje, fim: somarDias(hoje, 27) })} className="btn-ghost">
                <IcBusca tam={16} /> Consultar período
              </button>
              <Link href={`/montar?inicio=${hoje}&fim=${somarDias(hoje, 27)}`} className="btn-primary">
                <IcMais tam={16} /> Campanha
              </Link>
              <button onClick={() => setModal({ t: "equipe" })} className="btn-ghost">
                <IcMais tam={16} /> Equipe
              </button>
              <button onClick={() => setModal({ t: "veiculo" })} className="btn-ghost">
                <IcMais tam={16} /> Veículo
              </button>
            </>
          ) : (
            <button onClick={() => setDrawer({ t: "consulta", inicio: hoje, fim: somarDias(hoje, 27) })} className="btn-ghost">
              <IcBusca tam={16} /> Consultar período
            </button>
          )
        }
      />

      {aviso && (
        <div className="mb-4" onClick={() => setAviso(null)}>
          <Aviso tipo="atencao">{aviso}</Aviso>
        </div>
      )}

      {/* barra de controles */}
      <div className="no-print mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <button onClick={() => setInicio((i) => somarDias(i, -passo))} className="btn-ghost px-2" aria-label="Voltar no tempo">
            <IcEsq tam={18} />
          </button>
          <button onClick={irParaHoje} className="btn-ghost">
            Hoje
          </button>
          <button onClick={() => setInicio((i) => somarDias(i, passo))} className="btn-ghost px-2" aria-label="Avançar no tempo">
            <IcDir tam={18} />
          </button>
        </div>
        <input type="date" value={inicio} onChange={(e) => e.target.value && setInicio(segundaDaSemana(e.target.value))} className="field !mt-0 !w-auto" aria-label="Ir para a semana de" />
        <Segmentado
          valor={zoom}
          onChange={setZoom}
          opcoes={[
            { id: "dia", rotulo: "Dia" },
            { id: "semana", rotulo: "Semana" },
            { id: "mes", rotulo: "Ano" },
          ]}
        />
        <select value={grupo} onChange={(e) => setGrupo(e.target.value)} className="field !mt-0 !w-auto" aria-label="Filtrar por grupo">
          <option value="">Todos os grupos</option>
          {grupos.map((g) => (
            <option key={g}>{g}</option>
          ))}
        </select>
        <select value={contrato} onChange={(e) => setContrato(e.target.value)} className="field !mt-0 !w-auto" aria-label="Filtrar por contrato">
          <option value="">Todos os contratos</option>
          {contratos.map((c) => (
            <option key={c} value={c}>
              {rotuloContrato(c)}
            </option>
          ))}
        </select>
        <button onClick={() => setExpandidas(expandidas.size ? new Set() : new Set(equipesVisiveis.map((e) => e.id)))} className="btn-ghost">
          {expandidas.size ? "Recolher pessoas" : "Mostrar pessoas"}
        </button>
        <label className="flex items-center gap-2 text-xs text-gray-600">
          <input type="checkbox" checked={encerradas} onChange={(e) => setEncerradas(e.target.checked)} className="accent-[#0A9E7F]" /> campanhas encerradas
        </label>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-auto" style={{ maxHeight: "calc(100vh - 290px)", minHeight: 360 }}>
          <div className="relative" style={{ minWidth: ESQ + largura }}>
            {/* cabeçalho do tempo */}
            <div className="sticky top-0 z-20 flex border-b border-line bg-white">
              <Esq className="flex items-end bg-white px-4 pb-2" altura={dw >= 20 ? 78 : 56}>
                <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  {fmtDiaCurto(inicio)} → {fmtDiaCurto(fimJanela)}
                </span>
              </Esq>
              <div style={{ width: largura }}>
                <div className="flex">
                  {cabecalhoMeses.map((m, i) => (
                    <div key={i} className="overflow-hidden whitespace-nowrap border-r border-line px-2 py-1 font-display text-[12px] font-semibold uppercase tracking-wide text-gray-700" style={{ width: m.dias * dw }}>
                      {m.rotulo}
                    </div>
                  ))}
                </div>
                <div className="flex">
                  {semanas.map((s) => (
                    <div key={s} className="overflow-hidden whitespace-nowrap border-r border-line px-1.5 py-1 text-[10px] text-gray-500" style={{ width: 7 * dw }}>
                      {dw >= 10 ? `S${semanaIso(s)} · ${fmtDiaCurto(s)}` : dw >= 5 ? `S${semanaIso(s)}` : ""}
                    </div>
                  ))}
                </div>
                {dw >= 20 && (
                  <div className="flex">
                    {dias.map((d) => (
                      <div key={d} className={`flex flex-col items-center py-0.5 text-[10px] leading-tight ${ehFimDeSemana(d) ? "bg-gray-50 text-gray-400" : "text-gray-600"} ${d === hoje ? "font-bold text-accent" : ""}`} style={{ width: dw }}>
                        <span>{diaDaSemana(d)[0].toUpperCase()}</span>
                        <span className="num">{d.slice(8, 10)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* faixa: equipes livres x pedidas */}
            <div className="flex border-b border-line">
              <Esq className="flex flex-col justify-center px-4" altura={44}>
                <div className="text-[13px] font-semibold text-ink">Pessoas livres × faltam</div>
                <div className="text-[10px] text-gray-500">arraste para consultar o período</div>
              </Esq>
              <Lane inicio={inicio} totalDias={totalDias} dw={dw} altura={44} onSelecionar={(a, b) => setDrawer({ t: "consulta", inicio: a, fim: b })} umDia={zoom === "dia"} dica="Arraste para ver quem está livre neste período">
                {saldoSemanal.map(({ seg, livres, falta }, k) => {
                  const cls = falta === 0 ? "bg-gray-100 text-gray-600" : falta > livres ? "bg-bad-soft text-bad" : "bg-ok-soft text-ok";
                  return (
                    <div key={seg} className={`absolute top-1.5 flex flex-col items-center justify-center rounded-md ${cls}`} style={{ left: k * 7 * dw + 2, width: 7 * dw - 4, height: 32 }} title={`Semana de ${fmtDia(seg)}: ${livres} pessoa(s) livre(s) · ${falta} ainda faltando nas campanhas`}>
                      <span className="num text-[12px] font-bold leading-none">{livres}<span className="font-medium opacity-70"> / {falta}</span></span>
                      {7 * dw > 60 && <span className="mt-0.5 text-[9px] leading-none opacity-70">livres / faltam</span>}
                    </div>
                  );
                })}
              </Lane>
            </div>

            {/* CAMPANHAS */}
            <TituloSecao rotulo="Campanhas" n={campanhasVisiveis.length} aberto={!fechadas.has("campanhas")} onAlternar={() => alternar(fechadas, "campanhas", setFechadas)} extra={podeEditar ? "Clique numa barra para ver a equipe escalada." : undefined} />
            {!fechadas.has("campanhas") &&
              campanhasVisiveis.map((c) => {
                const membros = membrosDe(c);
                const lista = membros.slice(0, 3).map(nomeDe).join(", ");
                const barra: Barra = {
                  id: c.id,
                  inicio: c.inicio,
                  fim: c.fim,
                  rotulo: `${c.atividade}${membros.length ? ` · ${membros.length} pessoas` : ""}`,
                  cor: STATUS_CAMPANHA_QUE_LIBERAM.includes(c.status) ? "#CBD4CE" : COR_STATUS_CAMPANHA[c.status] ?? "#0A9E7F",
                  corTexto: STATUS_CAMPANHA_QUE_LIBERAM.includes(c.status) ? "#3E4A45" : undefined,
                  dica: `${c.codigo} — ${rotuloContrato(c.projeto)}${c.local ? ` (${c.local})` : ""}\n${fmtDia(c.inicio)} a ${fmtDia(c.fim)} · ${c.status}\n${membros.length ? membros.map(nomeDe).join(", ") : "Equipe ainda não montada"}`,
                  listrada: membros.length === 0 && !STATUS_CAMPANHA_QUE_LIBERAM.includes(c.status),
                  onClick: () => setDrawer({ t: "campanha", id: c.id }),
                };
                return (
                  <div key={c.id} className="flex border-b border-gray-100 hover:bg-gray-50/50">
                    <Esq className="px-4 py-2" altura={72}>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[12px] font-semibold">{c.codigo}</span>
                        <span className={CHIP_STATUS_CAMPANHA[c.status]}>{c.status}</span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5 truncate text-[12px] font-medium text-ink">
                        <PontoContrato cor={corDoContrato(c.projeto)} tam={8} />
                        {rotuloContrato(c.projeto)} <span className="font-normal text-gray-500">· {c.grupo}</span>
                      </div>
                      <div className="truncate text-[11px] text-gray-500">{membros.length ? `${lista}${membros.length > 3 ? ` +${membros.length - 3}` : ""}` : "equipe ainda não montada"}</div>
                    </Esq>
                    <Lane inicio={inicio} totalDias={totalDias} dw={dw} altura={72} barras={distribuir([barra])} topoBarras={23} />
                  </div>
                );
              })}
            {!fechadas.has("campanhas") && campanhasVisiveis.length === 0 && (
              <div className="flex border-b border-gray-100">
                <Esq className="px-4 py-3 text-sm text-gray-400">Nenhuma campanha{podeEditar ? "" : " em andamento"}.</Esq>
                <div className="flex flex-1 items-center px-4 text-xs text-gray-400">{podeEditar ? "Arraste sobre a linha de uma equipe, ali embaixo, para criar a primeira." : ""}</div>
              </div>
            )}

            {/* EQUIPES por contrato */}
            <TituloSecao rotulo="Equipes" n={equipesVisiveis.length} aberto={!fechadas.has("equipes")} onAlternar={() => alternar(fechadas, "equipes", setFechadas)} extra={podeEditar ? "Arraste sobre a linha de uma equipe para criar uma campanha com a equipe." : undefined} />
            {!fechadas.has("equipes") &&
              porContrato.map(([projeto, equipes]) => {
                const cor = corDoContrato(projeto);
                const pessoas = equipes.reduce((s, e) => s + (vagasPorEquipe.get(e.id) ?? []).filter(temNome).length, 0);
                const viaturas = dados.veiculos.filter((v) => localizacaoNoDia(dados.movimentos.filter((m) => m.veiculoId === v.id), hoje)?.projeto === projeto).length;
                return (
                  <div key={projeto}>
                    <div className="flex border-b border-line bg-white">
                      <Esq className="flex items-center gap-2 px-4" altura={34}>
                        <button onClick={() => alternar(fechadas, `c:${projeto}`, setFechadas)} className="flex min-w-0 items-center gap-2 text-left" aria-expanded={!fechadas.has(`c:${projeto}`)}>
                          <span className={`text-gray-400 transition-transform ${fechadas.has(`c:${projeto}`) ? "-rotate-90" : ""}`}>
                            <IcBaixo tam={14} />
                          </span>
                          <PontoContrato cor={cor} />
                          <span className="truncate font-display text-[15px] font-semibold tracking-tight">{rotuloContrato(projeto)}</span>
                        </button>
                      </Esq>
                      <div className="flex flex-1 items-center gap-4 px-3 text-xs text-gray-500" style={{ background: `${cor}0F` }}>
                        <span><strong className="num text-ink">{equipes.length}</strong> equipe{equipes.length === 1 ? "" : "s"}</span>
                        <span><strong className="num text-ink">{pessoas}</strong> pessoas</span>
                        <span><strong className="num text-ink">{viaturas}</strong> viatura{viaturas === 1 ? "" : "s"} hoje</span>
                        {podeEditar && (
                          <button onClick={() => setModal({ t: "equipe", projeto: projeto === A_DEFINIR ? "" : projeto })} className="ml-auto inline-flex items-center gap-1 font-semibold text-brand-dark hover:underline">
                            <IcMais tam={13} /> equipe neste contrato
                          </button>
                        )}
                      </div>
                    </div>

                    {!fechadas.has(`c:${projeto}`) &&
                      equipes.map((e) => {
                        const vs = vagasPorEquipe.get(e.id) ?? [];
                        const expandida = expandidas.has(e.id);
                        const barras = distribuir(barrasEquipe.get(e.id) ?? []);
                        const faixas = Math.max(1, ...barras.map((b) => b.faixa + 1));
                        const altura = Math.max(68, 12 + faixas * ALTURA_FAIXA + 20);
                        const hojeEstado = estadoVisual(avaliarEquipe(e, vs, idx, hoje));
                        const ev = ESTADO_VISUAL[hojeEstado];
                        const preenchidas = vs.filter(temNome).length;
                        return (
                          <div key={e.id}>
                            <div className="flex border-b border-gray-100 hover:bg-gray-50/40">
                              <Esq className="flex items-start gap-1.5 px-3 py-2" altura={altura}>
                                <button onClick={() => alternar(expandidas, e.id, setExpandidas)} className="mt-0.5 rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-ink" aria-label={expandida ? "Recolher pessoas" : "Mostrar pessoas"} aria-expanded={expandida}>
                                  <span className={`block transition-transform ${expandida ? "" : "-rotate-90"}`}>
                                    <IcBaixo tam={16} />
                                  </span>
                                </button>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-mono text-[11px] text-gray-500">{e.codigo}</span>
                                    <span className={ev.chip} title={ev.dica}>{ev.rotulo}</span>
                                  </div>
                                  <div className="truncate text-[13px] font-semibold leading-snug text-ink" title={e.nome}>{e.nome}</div>
                                  <div className="text-[11px] text-gray-500">
                                    {e.grupo} · <span className="num">{preenchidas}/{vs.length}</span> vagas
                                  </div>
                                </div>
                                {podeEditar && (
                                  <div className="flex shrink-0 flex-col gap-1">
                                    <button onClick={() => setModal({ t: "vaga", equipe: e })} className="rounded-md border border-line p-1 text-gray-500 hover:bg-gray-50 hover:text-brand-dark" title="Adicionar pessoa à equipe" aria-label="Adicionar pessoa">
                                      <IcMais tam={14} />
                                    </button>
                                    <button onClick={() => setModal({ t: "equipe", equipe: e })} className="rounded-md border border-line px-1 text-[10px] font-semibold text-gray-500 hover:bg-gray-50 hover:text-brand-dark" title="Editar equipe">
                                      editar
                                    </button>
                                  </div>
                                )}
                              </Esq>
                              <Lane inicio={inicio} totalDias={totalDias} dw={dw} altura={altura} barras={barras} onSelecionar={podeEditar ? (a, b) => criarCampanhaDaEquipe(e, a, b) : undefined} umDia={zoom === "dia"} dica="Arraste para criar uma campanha com esta equipe">
                                {(faixasEquipe.get(e.id) ?? []).map((f) => {
                                  const info = ESTADO_VISUAL[f.estado];
                                  const iniDia = dias[f.ini];
                                  const fimDia = dias[f.ini + f.n - 1];
                                  return (
                                    <div
                                      key={f.ini}
                                      className={`absolute z-[2] rounded-full ${f.estado === "incompleta" ? "listrado" : ""}`}
                                      style={{ left: f.ini * dw + 1, width: f.n * dw - 2, bottom: 6, height: 7, background: info.cor }}
                                      title={`${info.rotulo}: ${fmtDia(iniDia)} a ${fmtDia(fimDia)}\n${info.dica}`}
                                    />
                                  );
                                })}
                              </Lane>
                            </div>

                            {expandida &&
                              vs.map((v) => {
                                const aberta = !temNome(v);
                                return (
                                  <div key={v.id} className="flex border-b border-gray-50 bg-gray-50/40">
                                    <Esq className="flex items-center gap-2 bg-gray-50/40 py-1 pl-11 pr-3" altura={38}>
                                      <div className="min-w-0 flex-1">
                                        <div className={`truncate text-[12.5px] ${aberta ? "italic text-gray-400" : "font-medium text-ink"}`}>{aberta ? "vaga aberta" : nomeDe(v)}</div>
                                        <div className="truncate text-[10.5px] text-gray-500">
                                          {v.cargo}
                                          {v.direcao4x4 ? " · 4x4" : ""}
                                        </div>
                                      </div>
                                      {podeEditar && (
                                        <button onClick={() => setModal({ t: "vaga", vaga: v })} className="shrink-0 rounded border border-line px-1 text-[10px] font-semibold text-gray-500 hover:bg-white">
                                          editar
                                        </button>
                                      )}
                                    </Esq>
                                    <Lane
                                      inicio={inicio}
                                      totalDias={totalDias}
                                      dw={dw}
                                      altura={38}
                                      barras={distribuir(barrasDaPessoa(v)).map((x) => ({ ...x, faixa: 0 }))}
                                      topoBarras={9}
                                      alturaBarra={20}
                                      onSelecionar={podeEditar && !aberta ? (a, b) => setModal({ t: "ausencia", vagaIds: [v.id], periodo: { inicio: a, fim: b } }) : undefined}
                                      umDia={zoom === "dia"}
                                      dica="Arraste para lançar uma ausência"
                                    />
                                  </div>
                                );
                              })}
                          </div>
                        );
                      })}
                  </div>
                );
              })}

            {/* FROTA */}
            <TituloSecao rotulo="Frota" n={frota.length} aberto={!fechadas.has("frota")} onAlternar={() => alternar(fechadas, "frota", setFechadas)} extra={podeEditar ? "Arraste sobre a linha de um veículo para movê-lo de contrato." : undefined} />
            {!fechadas.has("frota") &&
              frotaPorContrato.map(([projeto, itens]) => {
                const cor = projeto === SEM_LOCAL ? "#9AA8A1" : corDoContrato(projeto);
                return (
                  <div key={projeto}>
                    <div className="flex border-b border-line bg-white">
                      <Esq className="flex items-center gap-2 px-4" altura={34}>
                        <PontoContrato cor={cor} />
                        <span className="truncate font-display text-[15px] font-semibold tracking-tight">{projeto === SEM_LOCAL ? SEM_LOCAL : rotuloContrato(projeto)}</span>
                      </Esq>
                      <div className="flex flex-1 items-center gap-4 px-3 text-xs text-gray-500" style={{ background: `${cor}0F` }}>
                        <span>
                          <strong className="num text-ink">{itens.length}</strong> veículo{itens.length === 1 ? "" : "s"} {projeto === SEM_LOCAL ? "" : "hoje"}
                        </span>
                      </div>
                    </div>
                    {itens.map(({ v, barras, loc }) => (
                      <div key={v.id} className="flex border-b border-gray-100 hover:bg-gray-50/40">
                        <Esq className="flex items-center gap-2.5 px-4 pl-9" altura={52}>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[13px] font-semibold">{v.identificacao}</span>
                              <span className="font-mono text-[10px] text-gray-400">{v.codigo}</span>
                              {v.status !== "Em operação" && <span className={CHIP_VEICULO[v.status]}>{v.status}</span>}
                            </div>
                            <div className="truncate text-[11px] text-gray-500">
                              {v.placa ?? "sem placa"}
                              {loc?.equipeId ? ` · ${equipePorId.get(loc.equipeId)?.nome ?? ""}` : ""}
                            </div>
                          </div>
                          <button onClick={() => setDrawer({ t: "veiculo", id: v.id })} className="shrink-0 rounded-md border border-line px-1.5 py-0.5 text-[10px] font-semibold text-gray-500 hover:bg-gray-50">
                            detalhes
                          </button>
                        </Esq>
                        <Lane
                          inicio={inicio}
                          totalDias={totalDias}
                          dw={dw}
                          altura={52}
                          barras={distribuir(barras).map((x) => ({ ...x, faixa: 0 }))}
                          topoBarras={12}
                          alturaBarra={28}
                          onSelecionar={podeEditar ? (a, b) => setModal({ t: "mover", veiculo: v, periodo: { inicio: a, fim: b } }) : undefined}
                          umDia={zoom === "dia"}
                          dica="Arraste para mover este veículo de contrato"
                        />
                      </div>
                    ))}
                  </div>
                );
              })}
            {!fechadas.has("frota") && frota.length === 0 && (
              <div className="flex border-b border-gray-100">
                <Esq className="px-4 py-3 text-sm text-gray-400">Nenhum veículo cadastrado.</Esq>
                <div className="flex-1" />
              </div>
            )}

            {/* linha de hoje */}
            {posHoje >= 0 && posHoje < totalDias && (
              <div className="pointer-events-none absolute bottom-0 top-0 z-[8] w-px bg-accent" style={{ left: ESQ + posHoje * dw + dw / 2 }} title={`Hoje (${fmtDia(hoje)})`}>
                <span className="absolute -top-px left-1 rounded-b bg-accent px-1 text-[9px] font-bold uppercase leading-4 text-white">hoje</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* legenda */}
      <div className="no-print mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[11px] text-gray-500">
        <span className="font-semibold uppercase tracking-wide">Faixa da equipe</span>
        {(["disponivel", "alocada", "incompleta", "ausencia"] as const).map((k) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <span className={`inline-block h-2 w-5 rounded-full ${k === "incompleta" ? "listrado" : ""}`} style={{ background: ESTADO_VISUAL[k].cor }} />
            {ESTADO_VISUAL[k].rotulo}
          </span>
        ))}
        <span className="mx-1 text-gray-300">|</span>
        <span className="font-semibold uppercase tracking-wide">Barras</span>
        {["Nova", "Planejada", "Confirmada", "Em execução"].map((s) => (
          <span key={s} className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-4 rounded" style={{ background: COR_STATUS_CAMPANHA[s] }} />
            {s}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5"><span className="listrado inline-block h-2.5 w-4 rounded bg-gray-300" /> ausência / sem equipe</span>
      </div>

      {/* modais */}
      {modal?.t === "equipe" && <ModalEquipe equipe={modal.equipe} projetoPadrao={modal.projeto} onFechar={() => setModal(null)} onSalvo={() => setModal(null)} />}
      {modal?.t === "vaga" && (
        <ModalVaga
          equipe={modal.equipe}
          vaga={modal.vaga}
          onFechar={() => setModal(null)}
          onSalvo={(av) => {
            setModal(null);
            if (av) setAviso(av);
          }}
        />
      )}
      {modal?.t === "ausencias" && <ModalAusencias vaga={modal.vaga} onFechar={() => setModal(null)} />}
      {modal?.t === "ausencia" && <ModalAusencia ausencia={modal.ausencia} vagaIds={modal.vagaIds} periodo={modal.periodo} onFechar={() => setModal(null)} />}
      {modal?.t === "veiculo" && <ModalVeiculo veiculo={modal.veiculo} onFechar={() => setModal(null)} />}
      {modal?.t === "mover" && <ModalMover veiculo={modal.veiculo} periodo={modal.periodo} onFechar={() => setModal(null)} />}
      {modal?.t === "historico" && <ModalHistoricoVeiculo veiculo={modal.veiculo} onFechar={() => setModal(null)} />}

      {/* painéis laterais */}
      {campanhaAberta && <DrawerCampanha campanha={campanhaAberta} onFechar={() => setDrawer(null)} />}
      {veiculoAberto && (
        <DrawerVeiculo
          veiculo={veiculoAberto}
          onFechar={() => setDrawer(null)}
          onMover={() => setModal({ t: "mover", veiculo: veiculoAberto })}
          onEditar={() => setModal({ t: "veiculo", veiculo: veiculoAberto })}
          onHistorico={() => setModal({ t: "historico", veiculo: veiculoAberto })}
        />
      )}
      {drawer?.t === "consulta" && (
        <DrawerConsulta
          inicio={drawer.inicio}
          fim={drawer.fim}
          onFechar={() => setDrawer(null)}
          onCriarCampanha={(ini, fim, g) => {
            setDrawer(null);
            if (podeEditar) router.push(`/montar?inicio=${ini}&fim=${fim}${g ? `&grupo=${encodeURIComponent(g)}` : ""}`);
          }}
        />
      )}
    </div>
  );
}
