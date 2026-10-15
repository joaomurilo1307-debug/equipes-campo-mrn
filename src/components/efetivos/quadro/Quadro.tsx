"use client";

// Quadro de equipes: contrato -> equipe -> pessoa numa linha do tempo que CABE NA TELA. A janela mostra poucas semanas por vez
// (4, 12, 26 ou 52); a faixa "Visão geral do período" leva a janela a qualquer semana sem rolar. Cada célula e cada barra tem a
// informação específica ao passar o mouse: quem está ausente, que vaga está aberta, quando a equipe muda de contrato.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { diferencaDias, ordenarGrupos, somarDias, temNome, type Dia } from "@/lib/efetivos/disponibilidade";
import { ROTULO_ESTADO_EQUIPE, estadoDaEquipe } from "@/lib/efetivos/situacao";
import { detalheDaSemana, indexarAusencias, semanasDe, somarSemanas, type DetalheSemana, type NivelSemana } from "@/lib/efetivos/semanas";
import { localizacaoNoDia } from "@/lib/efetivos/veiculos";
import { useDados } from "../DadosContext";
import { A_DEFINIR, CHIP_VEICULO, COR_AUSENCIA, corDoContrato, diaDaSemana, ehFimDeSemana, fmtDia, fmtDiaCurto, mesCurto, rotuloContrato, segundaDaSemana, semanaIso, type Ausencia, type Equipe, type Vaga, type Veiculo } from "../comum";
import { IcBaixo, IcDir, IcEsq, IcMais, IcMover } from "../icones";
import ModalAusencia from "../modais/ModalAusencia";
import ModalAusencias from "../modais/ModalAusencias";
import ModalEquipe from "../modais/ModalEquipe";
import { ModalHistoricoVeiculo, ModalMover, ModalVeiculo } from "../modais/ModaisVeiculo";
import ModalVaga from "../modais/ModalVaga";
import { Aviso, CabecalhoPagina, PontoContrato, Segmentado } from "../ui";
import { LinhaDica, ligarDica, useDica } from "./dicas";
import { DrawerVeiculo } from "./Drawers";
import { ESQ, distribuir, type Barra } from "./geometria";
import Lane from "./Lane";
import MiniMapa, { type PontoMapa } from "./MiniMapa";

const PRESETS: { id: number; rotulo: string }[] = [
  { id: 4, rotulo: "4 semanas" },
  { id: 12, rotulo: "12 semanas" },
  { id: 26, rotulo: "6 meses" },
  { id: 52, rotulo: "1 ano" },
];
const SEM_LOCAL = "Sem localização";
const MAX_SEMANAS_HORIZONTE = 130;

const COR_NIVEL: Record<NivelSemana, { fundo: string; texto: string; rotulo: string }> = {
  completa: { fundo: "#DDF1E8", texto: "#0B7A55", rotulo: "completa" },
  vagas: { fundo: "#FBEBC2", texto: "#8A5A00", rotulo: "com vagas abertas" },
  ausencia: { fundo: "#F9D6D2", texto: "#B3261E", rotulo: "com ausência" },
  ambos: { fundo: "#F3C7B8", texto: "#A12A1F", rotulo: "com ausência e vagas" },
  fora: { fundo: "#EEF1EF", texto: "#9AA8A1", rotulo: "fora do período" },
};

type ModalEstado =
  | { t: "equipe"; equipe?: Equipe; projeto?: string }
  | { t: "vaga"; equipe?: Equipe; vaga?: Vaga }
  | { t: "ausencias"; vaga: Vaga }
  | { t: "ausencia"; ausencia?: Ausencia; vagaIds?: string[]; periodo?: { inicio: Dia; fim: Dia } }
  | { t: "veiculo"; veiculo?: Veiculo }
  | { t: "mover"; veiculo: Veiculo; periodo?: { inicio: Dia; fim: Dia } }
  | { t: "historico"; veiculo: Veiculo };
type DrawerEstado = { t: "veiculo"; id: string };

// ---------------------------------------------------------------- peças

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

/** Conteúdo da dica de uma semana de uma equipe. */
function DicaSemana({ equipe, d, viaturas }: { equipe: { nome: string; projeto: string }; d: DetalheSemana; viaturas?: number }) {
  return (
    <div className="space-y-1">
      <div className="font-semibold text-ink">{equipe.nome}</div>
      <div className="text-[11px] text-gray-500">
        Semana de {fmtDia(d.seg)} a {fmtDia(d.fim)} · {rotuloContrato(equipe.projeto)}
      </div>
      {!d.ativa ? (
        <div className="text-gray-600">{d.nota ?? "Fora do período da equipe"}</div>
      ) : (
        <>
          <LinhaDica rotulo="Posições com alguém" cor={COR_NIVEL[d.nivel].texto}>
            <strong className="num">{d.presentes}</strong> de {d.total}
          </LinhaDica>
          {d.nota && <div className="text-[11.5px] text-info">{d.nota}</div>}
          {d.semNome > 0 && <LinhaDica rotulo="Preenchidas sem nome informado">{d.semNome}</LinhaDica>}
          {d.ausentes.length > 0 && (
            <div className="pt-0.5">
              <div className="text-[11px] font-semibold text-bad">Ausentes ({d.ausentes.length})</div>
              {d.ausentes.slice(0, 6).map((a, i) => (
                <div key={i} className="text-[11.5px] text-gray-700">
                  {a.nome ?? "—"} <span className="text-gray-400">· {a.tipo}</span>
                  {a.de && a.ate ? <span className="text-gray-400"> · {fmtDiaCurto(a.de)}–{fmtDiaCurto(a.ate)}</span> : null}
                </div>
              ))}
              {d.ausentes.length > 6 && <div className="text-[11px] text-gray-400">+ {d.ausentes.length - 6}</div>}
            </div>
          )}
          {d.emOutroContrato.length > 0 && (
            <div className="pt-0.5">
              <div className="text-[11px] font-semibold text-info">Ainda em outro contrato ({d.emOutroContrato.length})</div>
              {d.emOutroContrato.slice(0, 4).map((a, i) => (
                <div key={i} className="text-[11.5px] text-gray-700">
                  {a.nome ?? "—"} <span className="text-gray-400">· em {a.contrato}{a.ate ? ` até ${fmtDiaCurto(a.ate)}` : ""}</span>
                </div>
              ))}
            </div>
          )}
          {d.abertas.length > 0 && (
            <div className="pt-0.5">
              <div className="text-[11px] font-semibold" style={{ color: "#8A5A00" }}>
                Vagas abertas ({d.abertas.length})
              </div>
              {Object.entries(
                d.abertas.reduce<Record<string, number>>((m, a) => {
                  const k = `${a.cargo} (${a.empresa})${a.contratando ? " · em contratação" : ""}`;
                  m[k] = (m[k] ?? 0) + 1;
                  return m;
                }, {})
              )
                .slice(0, 6)
                .map(([k, n]) => (
                  <div key={k} className="text-[11.5px] text-gray-700">
                    {n}× {k}
                  </div>
                ))}
            </div>
          )}
          {viaturas !== undefined && <LinhaDica rotulo="Viaturas hoje">{viaturas}</LinhaDica>}
        </>
      )}
    </div>
  );
}

/** Uma célula por semana, colorida pela situação (completa, com vagas, com ausência). */
function CelulasSemanais({ detalhes, dw, topo, alto, equipe, viaturas }: { detalhes: DetalheSemana[]; dw: number; topo: number; alto: number; equipe: { nome: string; projeto: string }; viaturas?: number }) {
  const tip = useDica();
  const larg = 7 * dw - 2;
  return (
    <>
      {detalhes.map((d, k) => {
        const cor = COR_NIVEL[d.nivel];
        return (
          <div
            key={d.seg}
            className={`num absolute z-[2] flex items-center justify-center rounded-md text-[11px] font-semibold ${d.nivel === "fora" ? "listrado" : ""}`}
            style={{ left: k * 7 * dw + 1, width: larg, top: topo, height: alto, background: cor.fundo, color: cor.texto }}
            {...ligarDica(tip, <DicaSemana equipe={equipe} d={d} viaturas={viaturas} />)}
          >
            {larg >= 34 && d.ativa ? `${d.presentes}/${d.total}` : ""}
          </div>
        );
      })}
    </>
  );
}

type Soma = ReturnType<typeof somarSemanas>;
/** Nas linhas do contrato e do todo a cor vem da cobertura (posições com alguém): 92% ou mais, 80% a 92% e abaixo disso. */
function nivelDaSoma(s: Soma): NivelSemana {
  if (s.equipes === 0) return "fora";
  const cobertura = s.total ? s.presentes / s.total : 1;
  return cobertura >= 0.92 ? "completa" : cobertura >= 0.8 ? "vagas" : "ausencia";
}

function CelulasSoma({ somas, dw, topo, alto, titulo }: { somas: Soma[]; dw: number; topo: number; alto: number; titulo: string }) {
  const tip = useDica();
  const larg = 7 * dw - 2;
  return (
    <>
      {somas.map((s, k) => {
        const nivel = nivelDaSoma(s);
        const cor = COR_NIVEL[nivel];
        return (
          <div
            key={s.seg}
            className="num absolute z-[2] flex items-center justify-center rounded-md text-[11px] font-semibold"
            style={{ left: k * 7 * dw + 1, width: larg, top: topo, height: alto, background: cor.fundo, color: cor.texto }}
            {...ligarDica(
              tip,
              <div className="space-y-1">
                <div className="font-semibold text-ink">{titulo}</div>
                <div className="text-[11px] text-gray-500">Semana de {fmtDia(s.seg)} a {fmtDia(somarDias(s.seg, 6))}</div>
                <LinhaDica rotulo="Equipes ativas">{s.equipes}</LinhaDica>
                <LinhaDica rotulo="Posições com alguém" cor={cor.texto}>
                  <strong className="num">{s.presentes}</strong> de {s.total} ({Math.round((s.presentes / Math.max(1, s.total)) * 100)}%)
                </LinhaDica>
                <LinhaDica rotulo="Ausentes / fora" cor="#E63329">
                  {s.ausentes}
                </LinhaDica>
                <LinhaDica rotulo="Vagas abertas" cor="#E0A100">
                  {s.abertas}
                </LinhaDica>
              </div>
            )}
          >
            {larg >= 34 && s.equipes > 0 ? (larg >= 78 ? `${s.presentes}/${s.total} · ${Math.round((s.presentes / Math.max(1, s.total)) * 100)}%` : `${s.presentes}/${s.total}`) : ""}
          </div>
        );
      })}
    </>
  );
}

// ---------------------------------------------------------------- tela

export default function Quadro() {
  const { dados, hoje, vagasPorEquipe, equipesCampo, equipePorId, veiculoPorId, nomeDe, contagemDe, contratoNoDia, movimentosPorEquipe, veiculosPorEquipe, situacaoDe } = useDados();
  const podeEditar = dados.podeEditar;
  const router = useRouter();
  const tip = useDica();
  const areaRef = useRef<HTMLDivElement>(null);

  const [n, setN] = useState(12);
  const [inicio, setInicio] = useState<Dia>(() => segundaDaSemana(somarDias(hoje, -7)));
  const [grupo, setGrupo] = useState("");
  const [contrato, setContrato] = useState("");
  const [busca, setBusca] = useState("");
  const [soProblemas, setSoProblemas] = useState(false);
  const [expandidas, setExpandidas] = useState<Set<string>>(new Set());
  const [fechadas, setFechadas] = useState<Set<string>>(new Set(["frota"]));
  const [modal, setModal] = useState<ModalEstado | null>(null);
  const [drawer, setDrawer] = useState<DrawerEstado | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [larguraArea, setLarguraArea] = useState(1100);

  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const medir = () => setLarguraArea(el.clientWidth);
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // abre já na equipe pedida pelo Painel (?equipe=ID)
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("equipe");
    if (id && equipePorId.has(id)) setExpandidas(new Set([id]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalDias = n * 7;
  const dw = Math.max(2.5, (Math.max(560, larguraArea - ESQ - 2)) / totalDias);
  const largura = totalDias * dw;
  const fimJanela = somarDias(inicio, totalDias - 1);
  const posHoje = diferencaDias(inicio, hoje);

  // ---- filtros
  const grupos = useMemo(() => ordenarGrupos(equipesCampo.map((e) => e.grupo)), [equipesCampo]);
  const contratosLista = useMemo(() => Array.from(new Set(equipesCampo.map((e) => contratoNoDia(e, hoje) || A_DEFINIR))).sort((a, b) => (a === A_DEFINIR ? 1 : b === A_DEFINIR ? -1 : a.localeCompare(b, "pt-BR", { numeric: true }))), [equipesCampo, dados]); // eslint-disable-line react-hooks/exhaustive-deps
  const equipesFiltradas = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return equipesCampo.filter((e) => (!grupo || e.grupo === grupo) && (!contrato || (contratoNoDia(e, hoje) || A_DEFINIR) === contrato) && (!t || `${e.nome} ${e.codigo}`.toLowerCase().includes(t) || (vagasPorEquipe.get(e.id) ?? []).some((v) => (v.nome ?? "").toLowerCase().includes(t))));
  }, [equipesCampo, grupo, contrato, busca, vagasPorEquipe, dados]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- horizonte (tudo o que há lançado) e cobertura semana a semana
  const horizonte = useMemo(() => {
    let ini = segundaDaSemana(somarDias(hoje, -28));
    let fim = somarDias(segundaDaSemana(hoje), 26 * 7);
    const estende = (d: Dia | null | undefined) => {
      if (!d) return;
      if (d > fim) fim = d;
      if (d < ini && d > somarDias(hoje, -365)) ini = d;
    };
    for (const a of dados.ausencias) (estende(a.inicio), estende(a.fim));
    for (const e of dados.equipes) (estende(e.inicio), estende(e.fim));
    for (const m of dados.movimentosEquipe ?? []) (estende(m.inicio), estende(m.fim));
    for (const v of dados.vagas) estende(v.disponivelAPartir);
    estende(inicio);
    estende(fimJanela);
    ini = segundaDaSemana(ini);
    let semanas = Math.ceil(diferencaDias(ini, fim) / 7) + 2;
    if (semanas > MAX_SEMANAS_HORIZONTE) semanas = MAX_SEMANAS_HORIZONTE;
    return { ini, semanas };
  }, [dados, hoje, inicio, fimJanela]);
  const semanasH = useMemo(() => semanasDe(horizonte.ini, horizonte.semanas), [horizonte]);
  const ausPorVaga = useMemo(() => indexarAusencias(dados.ausencias), [dados.ausencias]);
  const detalhesH = useMemo(() => {
    const m = new Map<string, DetalheSemana[]>();
    for (const e of equipesFiltradas) {
      const vs = vagasPorEquipe.get(e.id) ?? [];
      m.set(e.id, semanasH.map((seg) => detalheDaSemana(e, vs, ausPorVaga, seg)));
    }
    return m;
  }, [equipesFiltradas, vagasPorEquipe, semanasH, ausPorVaga]);
  const k0 = Math.max(0, semanasH.indexOf(inicio));
  const semanas = semanasH.slice(k0, k0 + n);
  const deEquipe = (id: string) => (detalhesH.get(id) ?? []).slice(k0, k0 + n);
  const pontosMapa: PontoMapa[] = useMemo(
    () =>
      semanasH.map((seg, k) => {
        const s = somarSemanas(equipesFiltradas.map((e) => detalhesH.get(e.id)![k]), seg);
        return { seg, total: s.total, ausentes: s.ausentes, abertas: s.abertas };
      }),
    [semanasH, equipesFiltradas, detalhesH]
  );

  const equipesVisiveis = useMemo(() => (soProblemas ? equipesFiltradas.filter((e) => deEquipe(e.id).some((d) => d.nivel !== "completa" && d.nivel !== "fora")) : equipesFiltradas), [equipesFiltradas, soProblemas, detalhesH, k0, n]); // eslint-disable-line react-hooks/exhaustive-deps
  const porContrato = useMemo(() => {
    const m = new Map<string, Equipe[]>();
    if (!grupo && !busca && !soProblemas) for (const c of dados.contratos.filter((x) => x.ativo && (!contrato || x.codigo === contrato))) m.set(c.codigo, []);
    for (const e of equipesVisiveis) {
      const k = contratoNoDia(e, hoje) || A_DEFINIR;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(e);
    }
    return [...m.entries()].sort(([a], [b]) => (a === A_DEFINIR ? 1 : b === A_DEFINIR ? -1 : a.localeCompare(b, "pt-BR", { numeric: true })));
  }, [equipesVisiveis, dados.contratos, grupo, busca, soProblemas, contrato]); // eslint-disable-line react-hooks/exhaustive-deps
  const somaDe = (ids: string[]): Soma[] => semanas.map((seg, k) => somarSemanas(ids.map((id) => deEquipe(id)[k]).filter(Boolean), seg));

  // ---- navegação
  const passo = Math.max(2, Math.floor(n / 2)) * 7;
  const irPara = (seg: Dia) => setInicio(segundaDaSemana(seg));
  const alternar = (s: Set<string>, id: string, set: (v: Set<string>) => void) => {
    const x = new Set(s);
    if (x.has(id)) x.delete(id);
    else x.add(id);
    set(x);
  };
  const mudarPreset = (novo: number) => {
    setN(novo);
    // mantém a janela começando uma semana antes de hoje quando ela cabe; senão, onde estava
    setInicio((i) => (i > somarDias(hoje, 7) || i < somarDias(hoje, -novo * 7) ? segundaDaSemana(somarDias(hoje, -7)) : i));
  };

  // ---- cabeçalho do tempo
  const dias = useMemo(() => Array.from({ length: totalDias }, (_, i) => somarDias(inicio, i)), [inicio, totalDias]);
  const cabecalhoMeses = useMemo(() => {
    const blocos: { rotulo: string; dias: number }[] = [];
    for (const d of dias) {
      const r = `${mesCurto(d)}/${d.slice(2, 4)}`;
      if (blocos.length && blocos[blocos.length - 1].rotulo === r) blocos[blocos.length - 1].dias++;
      else blocos.push({ rotulo: r, dias: 1 });
    }
    return blocos;
  }, [dias]);

  // ---- barras
  const barrasDaEquipe = (e: Equipe): { barra: Barra; faixa: number }[] => {
    const movs = movimentosPorEquipe.get(e.id) ?? [];
    const atual = contratoNoDia(e, hoje) || A_DEFINIR;
    if (movs.length === 0) {
      return [{ faixa: 0, barra: { id: `${e.id}-atual`, inicio: e.inicio && e.inicio > inicio ? e.inicio : inicio, fim: e.fim && e.fim < fimJanela ? e.fim : fimJanela, rotulo: rotuloContrato(atual), cor: corDoContrato(atual), fina: true, dica: `${e.nome}\nEm ${rotuloContrato(atual)}${e.local ? ` · ${e.local}` : ""}\nSem passagens registradas (nunca foi movimentada no sistema)` } }];
    }
    return distribuir(
      movs.map((m) => ({
        id: m.id,
        inicio: m.inicio,
        fim: m.fim ?? fimJanela,
        rotulo: `${rotuloContrato(m.projeto)}${m.local ? ` · ${m.local}` : ""}`,
        cor: corDoContrato(m.projeto),
        dica: `${e.nome}\n${rotuloContrato(m.projeto)}${m.local ? ` · ${m.local}` : ""}\n${fmtDia(m.inicio)} a ${m.fim ? fmtDia(m.fim) : "em curso"}${m.fim ? ` (${diferencaDias(m.inicio, m.fim) + 1} dias)` : ""}${m.observacao ? `\n${m.observacao}` : ""}`,
        onClick: podeEditar ? () => router.push(`/equipes?equipe=${e.id}`) : undefined,
      }))
    ).map((x) => ({ ...x, faixa: 0 }));
  };

  function barrasDaPessoa(v: Vaga, e: Equipe): Barra[] {
    const out: Barra[] = [];
    const sit = situacaoDe(v);
    const nome = nomeDe(v);
    const a0 = e.inicio && e.inicio > inicio ? e.inicio : inicio;
    const a1 = e.fim && e.fim < fimJanela ? e.fim : fimJanela;
    if (!temNome(v)) {
      out.push({ id: `${v.id}-vaga`, inicio, fim: fimJanela, rotulo: v.semNome ? "preenchida · nome não informado" : v.status === "Em contratação" ? `em contratação${v.previsaoInicio ? ` · entra ${fmtDiaCurto(v.previsaoInicio)}` : ""}` : "vaga aberta", cor: v.semNome ? "#D5E8E0" : "#F7E2A8", corTexto: v.semNome ? "#3E6B5C" : "#8A5A00", listrada: !v.semNome, dica: `${v.cargo}\n${v.empresa} · ${v.atividade}\n${v.semNome ? "Posição preenchida, nome não informado" : v.status === "Em contratação" ? "Vaga em contratação" : "Vaga aberta: falta preencher"}`, onClick: podeEditar ? () => setModal({ t: "vaga", vaga: v }) : undefined });
      return out;
    }
    // a linha de base: está na equipe (verde) e, depois que a equipe termina, disponível (azul)
    if (a0 <= a1) out.push({ id: `${v.id}-base`, inicio: a0, fim: a1, rotulo: "", cor: "#0E8F63", fina: true, dica: `${nome}\n${v.cargo} · ${v.empresa}\nNa equipe ${e.nome}${e.fim ? ` até ${fmtDia(e.fim)}` : ""}` });
    if (e.fim && e.fim < fimJanela) out.push({ id: `${v.id}-livre`, inicio: somarDias(e.fim, 1) > inicio ? somarDias(e.fim, 1) : inicio, fim: fimJanela, rotulo: "disponível", cor: "#CFE0F8", corTexto: "#1D4E9A", dica: `${nome}\nDisponível a partir de ${fmtDia(somarDias(e.fim, 1))}\nA equipe ${e.nome} termina em ${fmtDia(e.fim)}` });
    for (const x of dados.ausencias.filter((a) => a.vagaId === v.id)) {
      out.push({ id: x.id, inicio: x.inicio, fim: x.fim, rotulo: x.tipo, cor: COR_AUSENCIA[x.tipo] ?? "#6F7E77", dica: `${nome} · ${x.tipo}\n${fmtDia(x.inicio)} a ${fmtDia(x.fim)} (${diferencaDias(x.inicio, x.fim) + 1} dias)\n${v.cargo}${x.observacao ? `\n${x.observacao}` : ""}`, onClick: podeEditar ? () => setModal({ t: "ausencia", ausencia: x }) : undefined });
    }
    if (v.contratoAtual && v.disponivelAPartir && v.disponivelAPartir > inicio) {
      const ate = somarDias(v.disponivelAPartir, -1);
      out.push({ id: `${v.id}-fora`, inicio, fim: ate, rotulo: `Em ${v.contratoAtual} até ${fmtDiaCurto(ate)}${v.destino ? ` → ${v.destino}` : ""}`, cor: "#C9DDF2", corTexto: "#1D6FB8", dica: `${nome}\nAinda em ${v.contratoAtual} até ${fmtDia(ate)}${v.destino ? `\nVai para: ${v.destino}` : ""}`, onClick: podeEditar ? () => setModal({ t: "vaga", vaga: v }) : undefined });
    }
    if (v.status !== "Vigente" && sit.situacao === "AUSENTE") out.push({ id: `${v.id}-status`, inicio, fim: fimJanela, rotulo: v.status, cor: "#F7C9C5", corTexto: "#C9342B", listrada: true, dica: `${nome}\n${v.cargo}\nIndisponível: ${v.status}` });
    return out;
  }

  // ---- frota
  const frota = useMemo(
    () =>
      dados.veiculos
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
        .filter((x) => x.visivel),
    [dados.veiculos, dados.movimentos, equipePorId, contrato, fimJanela, hoje]
  );
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

  const somaGeral = somaDe(equipesVisiveis.map((e) => e.id));
  const veiculoAberto = drawer?.t === "veiculo" ? veiculoPorId.get(drawer.id) : undefined;

  return (
    <div>
      <CabecalhoPagina
        titulo="Quadro de equipes"
        subtitulo="Cada equipe, semana a semana: verde = completa, amarelo = tem vaga aberta, vermelho = tem gente ausente. Passe o mouse para ver quem e o quê."
        acoes={
          podeEditar && (
            <>
              <Link href="/equipes/movimentar" className="btn-ghost">
                <IcMover tam={16} /> Movimentar equipe
              </Link>
              <Link href="/vagas/abrir" className="btn-ghost">
                <IcMais tam={16} /> Abrir vaga
              </Link>
              <button onClick={() => setModal({ t: "veiculo" })} className="btn-ghost">
                <IcMais tam={16} /> Veículo
              </button>
              <Link href="/equipes/nova" className="btn-primary">
                <IcMais tam={16} /> Nova equipe
              </Link>
            </>
          )
        }
      />
      {aviso && (
        <div className="mb-3 cursor-pointer" onClick={() => setAviso(null)}>
          <Aviso tipo="atencao">{aviso}</Aviso>
        </div>
      )}

      {/* controles */}
      <div className="no-print mb-3 flex flex-wrap items-center gap-2.5">
        <div className="flex items-center gap-1">
          <button onClick={() => setInicio((i) => somarDias(i, -passo))} className="btn-ghost px-2" aria-label="Voltar no tempo">
            <IcEsq tam={18} />
          </button>
          <button onClick={() => setInicio(segundaDaSemana(somarDias(hoje, -7)))} className="btn-ghost" title="Volta para hoje">
            Hoje
          </button>
          <button onClick={() => setInicio((i) => somarDias(i, passo))} className="btn-ghost px-2" aria-label="Avançar no tempo">
            <IcDir tam={18} />
          </button>
        </div>
        <input type="date" value={inicio} onChange={(e) => e.target.value && irPara(e.target.value)} className="field !mt-0 !w-auto" aria-label="Ir para a semana de" />
        <Segmentado valor={String(n)} onChange={(v) => mudarPreset(Number(v))} opcoes={PRESETS.map((p) => ({ id: String(p.id), rotulo: p.rotulo }))} />
        <select value={contrato} onChange={(e) => setContrato(e.target.value)} className="field !mt-0 !w-auto" aria-label="Filtrar por contrato">
          <option value="">Todos os contratos</option>
          {contratosLista.map((c) => (
            <option key={c} value={c}>
              {rotuloContrato(c)}
            </option>
          ))}
        </select>
        <select value={grupo} onChange={(e) => setGrupo(e.target.value)} className="field !mt-0 !w-auto" aria-label="Filtrar por grupo">
          <option value="">Todos os grupos</option>
          {grupos.map((g) => (
            <option key={g}>{g}</option>
          ))}
        </select>
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar equipe ou pessoa" className="field !mt-0 !w-52" />
        <label className="flex items-center gap-2 text-xs text-gray-600">
          <input type="checkbox" checked={soProblemas} onChange={(e) => setSoProblemas(e.target.checked)} className="accent-[#0A9E7F]" /> só com vaga ou ausência
        </label>
        <button onClick={() => setExpandidas(expandidas.size ? new Set() : new Set(equipesVisiveis.map((e) => e.id)))} className="btn-ghost">
          {expandidas.size ? "Recolher pessoas" : "Mostrar pessoas"}
        </button>
        <span className="num ml-auto text-xs text-gray-500">
          {fmtDiaCurto(inicio)} → {fmtDiaCurto(fimJanela)} · {equipesVisiveis.length} equipes
        </span>
      </div>

      <MiniMapa pontos={pontosMapa} inicioJanela={inicio} semanasJanela={n} hoje={hoje} aoIr={irPara} />

      <div className="card overflow-hidden" ref={areaRef}>
        <div className="overflow-auto" style={{ maxHeight: "calc(133.333vh - 420px)", minHeight: 360 }}>
          <div className="relative" style={{ minWidth: ESQ + largura }}>
            {/* régua do tempo */}
            <div className="sticky top-0 z-20 flex border-b border-line bg-white">
              <Esq className="flex items-end bg-white px-4 pb-2" altura={dw >= 20 ? 78 : 56}>
                <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Equipe</span>
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
                    <div key={s} className={`overflow-hidden whitespace-nowrap border-r border-line px-1.5 py-1 text-[10px] ${s <= hoje && hoje <= somarDias(s, 6) ? "bg-accent/10 font-bold text-accent" : "text-gray-500"}`} style={{ width: 7 * dw }}>
                      {7 * dw >= 64 ? `S${semanaIso(s)} · ${fmtDiaCurto(s)}` : 7 * dw >= 30 ? `S${semanaIso(s)}` : ""}
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

            {/* o todo */}
            <div className="flex border-b border-line">
              <Esq className="flex flex-col justify-center px-4" altura={44}>
                <div className="text-[13px] font-semibold text-ink">Todas as equipes visíveis</div>
                <div className="text-[10.5px] text-gray-500">posições com alguém / total, por semana</div>
              </Esq>
              <Lane inicio={inicio} totalDias={totalDias} dw={dw} altura={44}>
                <CelulasSoma somas={somaGeral} dw={dw} topo={8} alto={28} titulo="Todas as equipes visíveis" />
              </Lane>
            </div>

            {/* contratos e equipes */}
            <TituloSecao rotulo="Contratos e equipes" n={equipesVisiveis.length} aberto={!fechadas.has("equipes")} onAlternar={() => alternar(fechadas, "equipes", setFechadas)} extra={podeEditar ? "Arraste sobre a linha de uma equipe para movimentá-la nesse período." : undefined} />
            {!fechadas.has("equipes") &&
              porContrato.map(([projeto, equipes]) => {
                const cor = corDoContrato(projeto);
                const c = contagemDe(equipes.map((e) => e.id), hoje);
                const viaturas = dados.veiculos.filter((v) => localizacaoNoDia(dados.movimentos.filter((m) => m.veiculoId === v.id), hoje)?.projeto === projeto).length;
                const gestor = dados.contratos.find((x) => x.codigo === projeto)?.gestor ?? null;
                return (
                  <div key={projeto}>
                    <div className="flex border-b border-line bg-white">
                      <Esq className="flex items-center gap-2 px-4" altura={46}>
                        <button onClick={() => alternar(fechadas, `c:${projeto}`, setFechadas)} className="flex min-w-0 items-center gap-2 text-left" aria-expanded={!fechadas.has(`c:${projeto}`)}>
                          <span className={`text-gray-400 transition-transform ${fechadas.has(`c:${projeto}`) ? "-rotate-90" : ""}`}>
                            <IcBaixo tam={14} />
                          </span>
                          <PontoContrato cor={cor} />
                          <span className="min-w-0">
                            <span className="block truncate font-display text-[15px] font-semibold leading-tight tracking-tight">{rotuloContrato(projeto)}</span>
                            <span className="block truncate text-[10.5px] text-gray-500">
                              {equipes.length} equipe{equipes.length === 1 ? "" : "s"} · {c.comNome} pessoas · {c.abertas} vagas{gestor ? ` · ${gestor}` : ""}
                            </span>
                          </span>
                        </button>
                      </Esq>
                      <Lane inicio={inicio} totalDias={totalDias} dw={dw} altura={46}>
                        <div className="absolute inset-0" style={{ background: `${cor}0F` }} />
                        <CelulasSoma somas={somaDe(equipes.map((e) => e.id))} dw={dw} topo={9} alto={28} titulo={`${rotuloContrato(projeto)} · ${equipes.length} equipe(s)`} />
                      </Lane>
                    </div>

                    {!fechadas.has(`c:${projeto}`) &&
                      equipes.map((e) => {
                        const vs = vagasPorEquipe.get(e.id) ?? [];
                        const expandida = expandidas.has(e.id);
                        const cm = contagemDe([e.id], hoje);
                        const est = ROTULO_ESTADO_EQUIPE[estadoDaEquipe(e, cm, hoje)];
                        const nViaturas = (veiculosPorEquipe.get(e.id) ?? []).length;
                        return (
                          <div key={e.id}>
                            <div className="flex border-b border-gray-100 hover:bg-gray-50/40">
                              <Esq className="flex items-start gap-1.5 px-3 py-1.5" altura={64}>
                                <button onClick={() => alternar(expandidas, e.id, setExpandidas)} className="mt-0.5 rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-ink" aria-label={expandida ? "Recolher pessoas" : "Mostrar pessoas"} aria-expanded={expandida}>
                                  <span className={`block transition-transform ${expandida ? "" : "-rotate-90"}`}>
                                    <IcBaixo tam={16} />
                                  </span>
                                </button>
                                <div className="min-w-0 flex-1" {...ligarDica(tip, <DicaEquipe e={e} cm={cm} viaturas={nViaturas} contrato={contratoNoDia(e, hoje)} />)}>
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-mono text-[10.5px] text-gray-500">{e.codigo}</span>
                                    <span className={est.chip}>{est.rotulo}</span>
                                  </div>
                                  <Link href={`/equipes?equipe=${e.id}`} className="block truncate text-[13px] font-semibold leading-snug text-ink hover:text-brand-dark hover:underline">
                                    {e.nome}
                                  </Link>
                                  <div className="text-[11px] text-gray-500">
                                    {e.grupo} · <span className="num">{cm.comNome + cm.semNome}/{cm.posicoes}</span> posições{cm.abertas > 0 ? <span className="font-semibold" style={{ color: "#B86E00" }}> · {cm.abertas} vaga{cm.abertas === 1 ? "" : "s"}</span> : ""}
                                  </div>
                                </div>
                                {podeEditar && (
                                  <div className="flex shrink-0 flex-col gap-1">
                                    <Link href={`/vagas/abrir?equipe=${e.id}`} className="rounded-md border border-line p-1 text-gray-500 hover:bg-gray-50 hover:text-brand-dark" title="Abrir vaga / novo cargo nesta equipe" aria-label="Abrir vaga">
                                      <IcMais tam={14} />
                                    </Link>
                                    <button onClick={() => setModal({ t: "equipe", equipe: e })} className="rounded-md border border-line px-1 text-[10px] font-semibold text-gray-500 hover:bg-gray-50 hover:text-brand-dark" title="Editar equipe">
                                      editar
                                    </button>
                                  </div>
                                )}
                              </Esq>
                              <Lane
                                inicio={inicio}
                                totalDias={totalDias}
                                dw={dw}
                                altura={64}
                                barras={barrasDaEquipe(e)}
                                topoBarras={2}
                                alturaBarra={14}
                                onSelecionar={podeEditar ? (a, b) => router.push(`/equipes/movimentar?equipe=${e.id}&inicio=${a}&fim=${b}`) : undefined}
                                umDia={dw >= 20}
                                dica="Arraste para movimentar esta equipe nesse período"
                              >
                                <CelulasSemanais detalhes={deEquipe(e.id)} dw={dw} topo={21} alto={37} equipe={{ nome: e.nome, projeto: contratoNoDia(e, hoje) }} viaturas={nViaturas} />
                              </Lane>
                            </div>

                            {expandida &&
                              vs.map((v) => {
                                const aberta = !temNome(v);
                                const sit = situacaoDe(v);
                                return (
                                  <div key={v.id} className="flex border-b border-gray-50 bg-gray-50/40">
                                    <Esq className="flex items-center gap-2 bg-gray-50/40 py-1 pl-11 pr-3" altura={34}>
                                      <div
                                        className="min-w-0 flex-1"
                                        {...ligarDica(
                                          tip,
                                          <div className="space-y-0.5">
                                            <div className="font-semibold text-ink">{aberta ? (v.semNome ? "Nome não informado" : "Vaga aberta") : nomeDe(v)}</div>
                                            <div className="text-gray-600">{v.cargo}</div>
                                            <LinhaDica rotulo="Empresa">{v.empresa}</LinhaDica>
                                            <LinhaDica rotulo="Atividade">{v.atividade}</LinhaDica>
                                            {v.nivel && <LinhaDica rotulo="Nível">{v.nivel}</LinhaDica>}
                                            <LinhaDica rotulo="Hoje">{sit.motivo ?? "Em equipe"}</LinhaDica>
                                            {v.veiculoId && <LinhaDica rotulo="Viatura">{veiculoPorId.get(v.veiculoId)?.identificacao}</LinhaDica>}
                                            {v.direcao4x4 && <LinhaDica rotulo="Dirige 4x4">sim</LinhaDica>}
                                          </div>
                                        )}
                                      >
                                        <div className={`truncate text-[12.5px] ${aberta ? "italic text-gray-400" : "font-medium text-ink"}`}>{aberta ? (v.semNome ? "nome não informado" : "vaga aberta") : nomeDe(v)}</div>
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
                                      altura={34}
                                      barras={distribuir(barrasDaPessoa(v, e)).map((x) => ({ ...x, faixa: 0 }))}
                                      topoBarras={7}
                                      alturaBarra={20}
                                      onSelecionar={podeEditar && !aberta ? (a, b) => setModal({ t: "ausencia", vagaIds: [v.id], periodo: { inicio: a, fim: b } }) : undefined}
                                      umDia={dw >= 20}
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
            {!fechadas.has("equipes") && porContrato.every(([, l]) => l.length === 0) && (
              <div className="flex border-b border-gray-100">
                <Esq className="px-4 py-3 text-sm text-gray-400">Nenhuma equipe neste filtro.</Esq>
                <div className="flex-1" />
              </div>
            )}

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
                        <Esq className="flex items-center gap-2.5 px-4 pl-9" altura={46}>
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
                          altura={46}
                          barras={distribuir(barras).map((x) => ({ ...x, faixa: 0 }))}
                          topoBarras={10}
                          alturaBarra={26}
                          onSelecionar={podeEditar ? (a, b) => setModal({ t: "mover", veiculo: v, periodo: { inicio: a, fim: b } }) : undefined}
                          umDia={dw >= 20}
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
              <div className="pointer-events-none absolute bottom-0 top-0 z-[8] w-px bg-accent/70" style={{ left: ESQ + posHoje * dw + dw / 2 }}>
                <span className="absolute -top-px left-1 rounded-b bg-accent px-1 text-[9px] font-bold uppercase leading-4 text-white">hoje</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* legenda */}
      <div className="no-print mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[11px] text-gray-500">
        <span className="font-semibold uppercase tracking-wide">Semana</span>
        {(["completa", "vagas", "ausencia", "ambos"] as NivelSemana[]).map((k) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-4 rounded" style={{ background: COR_NIVEL[k].fundo, boxShadow: `inset 0 0 0 1px ${COR_NIVEL[k].texto}55` }} />
            {COR_NIVEL[k].rotulo}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span className="listrado inline-block h-2.5 w-4 rounded" style={{ background: COR_NIVEL.fora.fundo }} /> equipe fora do período
        </span>
        <span className="mx-1 text-gray-300">|</span>
        <span className="font-semibold uppercase tracking-wide">Barras</span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-4 rounded" style={{ background: "#2F6FDE" }} /> contrato da equipe (passagem)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-4 rounded" style={{ background: COR_AUSENCIA["Férias"] }} /> ausência
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-1 w-4 rounded" style={{ background: "#0E8F63" }} /> na equipe
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-4 rounded" style={{ background: "#CFE0F8" }} /> disponível
        </span>
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
      {veiculoAberto && (
        <DrawerVeiculo
          veiculo={veiculoAberto}
          onFechar={() => setDrawer(null)}
          onMover={() => setModal({ t: "mover", veiculo: veiculoAberto })}
          onEditar={() => setModal({ t: "veiculo", veiculo: veiculoAberto })}
          onHistorico={() => setModal({ t: "historico", veiculo: veiculoAberto })}
        />
      )}
    </div>
  );
}

/** Dica do nome da equipe: a situação de hoje, em números. */
function DicaEquipe({ e, cm, viaturas, contrato }: { e: Equipe; cm: ReturnType<ReturnType<typeof useDados>["contagemDe"]>; viaturas: number; contrato: string }) {
  return (
    <div className="space-y-1">
      <div className="font-semibold text-ink">{e.nome}</div>
      <div className="text-[11px] text-gray-500">
        {e.codigo} · {rotuloContrato(contrato)}
        {e.local ? ` · ${e.local}` : ""}
      </div>
      {(e.inicio || e.fim) && (
        <LinhaDica rotulo="Período">
          {e.inicio ? fmtDia(e.inicio) : "…"} a {e.fim ? fmtDia(e.fim) : "sem fim"}
        </LinhaDica>
      )}
      <LinhaDica rotulo="Posições">{cm.posicoes}</LinhaDica>
      <LinhaDica rotulo="Em equipe" cor="#0E8F63">
        {cm.emEquipe}
      </LinhaDica>
      <LinhaDica rotulo="Ausentes" cor="#E63329">
        {cm.ausentes}
      </LinhaDica>
      <LinhaDica rotulo="Sem nome informado">{cm.semNome}</LinhaDica>
      <LinhaDica rotulo="Vagas abertas" cor="#E0A100">
        {cm.abertas}
      </LinhaDica>
      <LinhaDica rotulo="Viaturas">{viaturas}</LinhaDica>
      {e.gestor && <LinhaDica rotulo="Gestor MRN">{e.gestor}</LinhaDica>}
    </div>
  );
}
