"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  STATUS_CAMPANHA_QUE_LIBERAM,
  avaliarEquipe,
  conferirNecessidade,
  diferencaDias,
  estadoDaVaga,
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
const SEMANAS: Record<Zoom, number> = { dia: 12, semana: 78, mes: 156 };
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

// ---------------------------------------------------------------- capacidade por semana

type Cap = { seg: Dia; presentes: number; abertas: number; ausentes: number; total: number };

/**
 * Gargalo por semana. O que é constante (as vagas abertas e as ausências de base) vira faixa fina embaixo;
 * só o que SOBE acima da base aparece alto, em vermelho, com o número. Onde a vermelha cresce, falta gente.
 */
function BarrasDeFalta({ caps, dw, altura, comNumero, maxBarra }: { caps: Cap[]; dw: number; altura: number; comNumero?: boolean; maxBarra?: number }) {
  const baseAusentes = caps.length ? Math.min(...caps.map((c) => c.ausentes)) : 0;
  const maxExcesso = Math.max(2, ...caps.map((c) => c.ausentes - baseAusentes));
  const faixa = 3;
  const util = (maxBarra ?? altura - (comNumero ? 24 : 8)) - 2 * faixa;
  const larg = Math.max(3, 7 * dw - 4);
  return (
    <>
      {caps.map((c, k) => {
        if (c.abertas + c.ausentes === 0) return null;
        const excesso = c.ausentes - baseAusentes;
        const hEx = excesso > 0 ? Math.max(3, (excesso / maxExcesso) * util) : 0;
        const hBase = (baseAusentes > 0 ? faixa : 0) + (c.abertas > 0 ? faixa : 0);
        return (
          <div key={c.seg} className="absolute z-[3]" style={{ left: k * 7 * dw + 2, width: larg, bottom: 3, height: hBase + hEx + 14 }} title={`Semana de ${fmtDia(c.seg)}: ${c.ausentes} ausente(s) e ${c.abertas} vaga(s) aberta(s) — ${c.presentes} de ${c.total} posições com alguém`}>
            {comNumero && excesso > 0 && larg >= 18 && (
              <div className="num absolute inset-x-0 text-center text-[10px] font-semibold text-bad" style={{ bottom: hBase + hEx + 1 }}>
                {c.ausentes}
              </div>
            )}
            {hEx > 0 && <div className="absolute inset-x-0 rounded-t-[3px]" style={{ bottom: hBase, height: hEx, background: "#E63329" }} />}
            {baseAusentes > 0 && <div className="absolute inset-x-0" style={{ bottom: c.abertas > 0 ? faixa : 0, height: faixa, background: "#E63329", opacity: 0.55 }} />}
            {c.abertas > 0 && <div className="listrado absolute inset-x-0 rounded-[2px]" style={{ bottom: 0, height: faixa, background: "#E0A100" }} />}
          </div>
        );
      })}
    </>
  );
}

/**
 * Linha da equipe: o normal (presentes / posições na primeira semana) fica escrito uma vez, à esquerda;
 * só as semanas que fogem do normal aparecem, em vermelho (menos gente) ou verde (mais gente).
 */
function ChipsDeCapacidade({ caps, dw, altura }: { caps: Cap[]; dw: number; altura: number }) {
  if (caps.length === 0) return null;
  const base = caps[0].presentes;
  const largo = 7 * dw >= 40;
  return (
    <>
      <div className="num sticky z-[4] inline-block rounded-md bg-white/90 px-2 py-0.5 text-[11px] text-gray-600 ring-1 ring-line" style={{ left: ESQ + 8, marginTop: altura - 26 }}>
        <strong className="text-ink">{base}</strong> de {caps[0].total} posições com alguém
      </div>
      {caps.map((c, k) => {
        const desvio = c.presentes - base;
        if (desvio === 0) return null;
        const cls = desvio < 0 ? "bg-bad-soft text-bad" : "bg-ok-soft text-ok";
        return (
          <div
            key={c.seg}
            className={`num absolute z-[2] flex items-center justify-center rounded-md text-[11px] font-semibold ${cls}`}
            style={{ left: k * 7 * dw + 2, width: 7 * dw - 4, bottom: 4, height: 20 }}
            title={`Semana de ${fmtDia(c.seg)}: ${c.presentes} de ${c.total} posições com alguém · ${c.ausentes} ausente(s) · ${c.abertas} vaga(s) aberta(s)`}
          >
            {largo ? `${c.presentes}/${c.total}` : ""}
          </div>
        );
      })}
    </>
  );
}

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
  const rolagemRef = useRef<HTMLDivElement>(null);

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
  // a janela é longa (um ano e meio na semana) e se estende até o último evento lançado (férias, campanha, liberação)
  const ultimoEvento = useMemo(() => {
    let m = hoje;
    for (const a of dados.ausencias) if (a.fim > m) m = a.fim;
    for (const c of dados.campanhas) if (c.fim > m) m = c.fim;
    for (const v of dados.vagas) if (v.disponivelAPartir && v.disponivelAPartir > m) m = v.disponivelAPartir;
    for (const e of dados.equipes) if (e.fim && e.fim > m) m = e.fim;
    return m;
  }, [dados.ausencias, dados.campanhas, dados.vagas, dados.equipes, hoje]);
  const semanasJanela = zoom === "dia" ? SEMANAS.dia : Math.min(260, Math.max(SEMANAS[zoom], Math.ceil(diferencaDias(inicio, ultimoEvento) / 7) + 6));
  const totalDias = semanasJanela * 7;
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
    // todo contrato cadastrado aparece, mesmo sem equipe ainda (para criar a primeira)
    if (!grupo) for (const c of dados.contratos.filter((x) => x.ativo && (!contrato || x.codigo === contrato))) m.set(c.codigo, []);
    for (const e of equipesVisiveis) {
      if (!m.has(e.projeto)) m.set(e.projeto, []);
      m.get(e.projeto)!.push(e);
    }
    return [...m.entries()].sort(([a], [b]) => (a === A_DEFINIR ? 1 : b === A_DEFINIR ? -1 : a.localeCompare(b, "pt-BR", { numeric: true })));
  }, [equipesVisiveis, dados.contratos, grupo, contrato]);

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
              fina: !m.fim,
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

  // ---- capacidade de cada semana: quantas posições têm alguém presente, quantas estão sem ninguém (ausência ou vaga aberta)
  const semanas = useMemo(() => Array.from({ length: semanasJanela }, (_, k) => somarDias(inicio, k * 7)), [inicio, semanasJanela]);
  const capacidade = useMemo(() => {
    const m = new Map<string, Cap[]>();
    for (const e of equipesVisiveis) {
      const vs = vagasPorEquipe.get(e.id) ?? [];
      m.set(
        e.id,
        semanas.map((seg) => {
          const fimSem = somarDias(seg, 6);
          const c: Cap = { seg, presentes: 0, abertas: 0, ausentes: 0, total: vs.length };
          for (const v of vs) {
            const st = estadoDaVaga(v, idx, seg, fimSem).situacao;
            if (st === "AUSENTE") c.ausentes++;
            else if (st === "VAGA_ABERTA") c.abertas++;
            else c.presentes++;
          }
          return c;
        })
      );
    }
    return m;
  }, [equipesVisiveis, vagasPorEquipe, idx, semanas]);
  const somarCapacidade = (ids: string[]): Cap[] =>
    semanas.map((seg, k) => {
      const c: Cap = { seg, presentes: 0, abertas: 0, ausentes: 0, total: 0 };
      for (const id of ids) {
        const x = capacidade.get(id)?.[k];
        if (!x) continue;
        c.presentes += x.presentes;
        c.abertas += x.abertas;
        c.ausentes += x.ausentes;
        c.total += x.total;
      }
      return c;
    });
  const capacidadeTotal = useMemo(() => somarCapacidade(equipesVisiveis.map((e) => e.id)), [capacidade, equipesVisiveis]); // eslint-disable-line react-hooks/exhaustive-deps

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
        subtitulo="Contrato, equipe e pessoa, semana a semana, até o fim (role para o lado). Só aparece o que muda: ausências e semanas com menos gente."
        acoes={
          podeEditar ? (
            <>
              <button onClick={() => setDrawer({ t: "consulta", inicio: hoje, fim: somarDias(hoje, 27) })} className="btn-ghost">
                <IcBusca tam={16} /> Consultar período
              </button>
              <Link href={`/montar?inicio=${hoje}&fim=${somarDias(hoje, 27)}`} className="btn-primary">
                <IcMais tam={16} /> Campanha
              </Link>
              <Link href="/equipes/nova" className="btn-ghost">
                <IcMais tam={16} /> Equipe
              </Link>
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
          <button
            onClick={() => {
              irParaHoje();
              rolagemRef.current?.scrollTo({ left: 0, top: 0, behavior: "smooth" });
            }}
            className="btn-ghost"
            title="Volta para hoje"
          >
            Hoje
          </button>
          <button onClick={() => setInicio((i) => somarDias(i, passo))} className="btn-ghost px-2" aria-label="Avançar no tempo">
            <IcDir tam={18} />
          </button>
          <button onClick={() => rolagemRef.current?.scrollTo({ left: rolagemRef.current.scrollWidth, behavior: "smooth" })} className="btn-ghost" title="Vai até o último período da linha do tempo">
            Fim
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
        <div ref={rolagemRef} className="overflow-auto" style={{ maxHeight: "calc(133.333vh - 330px)", minHeight: 360 }}>
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
                      {m.dias * dw >= 46 ? m.rotulo : ""}
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

            {/* gargalo: quantas posições ficam sem ninguém em cada semana */}
            <div className="flex border-b border-line">
              <Esq className="flex flex-col justify-center px-4" altura={52}>
                <div className="text-[13px] font-semibold text-ink">Gargalo da semana</div>
                <div className="text-[10px] text-gray-500">posições sem ninguém · arraste para consultar</div>
              </Esq>
              <Lane inicio={inicio} totalDias={totalDias} dw={dw} altura={52} onSelecionar={(a, b) => setDrawer({ t: "consulta", inicio: a, fim: b })} umDia={zoom === "dia"} dica="Arraste para ver quem está livre neste período">
                <BarrasDeFalta caps={capacidadeTotal} dw={dw} altura={52} comNumero />
              </Lane>
            </div>

            {/* EQUIPES por contrato */}
            <TituloSecao rotulo="Contratos e equipes" n={equipesVisiveis.length} aberto={!fechadas.has("equipes")} onAlternar={() => alternar(fechadas, "equipes", setFechadas)} extra={podeEditar ? "Contrato, depois equipe, depois pessoa. Arraste sobre a linha de uma equipe para criar uma campanha com ela." : undefined} />
            {!fechadas.has("equipes") &&
              porContrato.map(([projeto, equipes]) => {
                const cor = corDoContrato(projeto);
                const pessoas = equipes.reduce((s, e) => s + (vagasPorEquipe.get(e.id) ?? []).filter(temNome).length, 0);
                const viaturas = dados.veiculos.filter((v) => localizacaoNoDia(dados.movimentos.filter((m) => m.veiculoId === v.id), hoje)?.projeto === projeto).length;
                const vagasAbertas = equipes.reduce((s, e) => s + (vagasPorEquipe.get(e.id) ?? []).filter((v) => !temNome(v) && !v.semNome).length, 0);
                const gestorContrato = dados.contratos.find((c) => c.codigo === projeto)?.gestor ?? null;
                return (
                  <div key={projeto}>
                    <div className="flex border-b border-line bg-white">
                      <Esq className="flex items-center gap-2 px-4" altura={42}>
                        <button onClick={() => alternar(fechadas, `c:${projeto}`, setFechadas)} className="flex min-w-0 items-center gap-2 text-left" aria-expanded={!fechadas.has(`c:${projeto}`)}>
                          <span className={`text-gray-400 transition-transform ${fechadas.has(`c:${projeto}`) ? "-rotate-90" : ""}`}>
                            <IcBaixo tam={14} />
                          </span>
                          <PontoContrato cor={cor} />
                          <span className="truncate font-display text-[15px] font-semibold tracking-tight">{rotuloContrato(projeto)}</span>
                        </button>
                      </Esq>
                      <Lane inicio={inicio} totalDias={totalDias} dw={dw} altura={42}>
                        <div className="absolute inset-0" style={{ background: `${cor}0F` }} />
                        <BarrasDeFalta caps={somarCapacidade(equipes.map((e) => e.id))} dw={dw} altura={42} maxBarra={14} />
                        <div className="sticky z-[7] inline-flex h-[26px] items-center gap-4 px-3 text-xs text-gray-600" style={{ left: ESQ }}>
                        <span><strong className="num text-ink">{equipes.length}</strong> equipe{equipes.length === 1 ? "" : "s"}</span>
                        <span><strong className="num text-ink">{pessoas}</strong> pessoas · {equipes.reduce((x, e) => x + (vagasPorEquipe.get(e.id) ?? []).length, 0)} posições</span>
                        {vagasAbertas > 0 && <span><strong className="num" style={{ color: "#B86E00" }}>{vagasAbertas}</strong> vagas abertas</span>}
                        <span><strong className="num text-ink">{viaturas}</strong> viatura{viaturas === 1 ? "" : "s"} hoje</span>
                        {gestorContrato && <span>gestor {gestorContrato}</span>}
                        {podeEditar && (
                          <Link href={`/equipes/nova${projeto === A_DEFINIR ? "" : `?contrato=${encodeURIComponent(projeto)}`}`} className="ml-2 inline-flex items-center gap-1 font-semibold text-brand-dark hover:underline">
                            <IcMais tam={13} /> equipe neste contrato
                          </Link>
                        )}
                        </div>
                      </Lane>
                    </div>

                    {!fechadas.has(`c:${projeto}`) &&
                      equipes.map((e) => {
                        const vs = vagasPorEquipe.get(e.id) ?? [];
                        const expandida = expandidas.has(e.id);
                        const barras = distribuir(barrasEquipe.get(e.id) ?? []);
                        const faixas = barras.length ? Math.max(...barras.map((b) => b.faixa + 1)) : 0;
                        const altura = Math.max(66, 12 + faixas * ALTURA_FAIXA + 32);
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
                                <ChipsDeCapacidade caps={capacidade.get(e.id) ?? []} dw={dw} altura={altura} />
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
        <span className="font-semibold uppercase tracking-wide">Gargalo</span>
        <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-3 rounded-sm" style={{ background: "#E63329" }} /> ausentes acima do normal (fina = base)</span>
        <span className="inline-flex items-center gap-1.5"><span className="listrado inline-block h-1.5 w-4 rounded-sm" style={{ background: "#E0A100" }} /> vagas abertas (faixa fina)</span>
        <span className="inline-flex items-center gap-1.5"><span className="num rounded bg-bad-soft px-1 text-[10px] font-semibold text-bad">12/14</span> semana com menos gente que o normal da equipe</span>
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
