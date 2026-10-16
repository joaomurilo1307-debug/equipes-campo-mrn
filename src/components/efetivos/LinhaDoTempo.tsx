"use client";

// Linha do tempo: cada equipe é uma barra do dia em que começa ao dia em que termina, numa escala macro (trimestres ou meses)
// ou semanal. Mostra por quanto tempo cada equipe é usada, agrupada por contrato, e abre para as viaturas, as ausências e as
// entradas previstas de cada uma. Equipe sem data de fim não vai "até o infinito": a barra some em degradê e pede a data.
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { diferencaDias, somarDias, type Dia } from "@/lib/efetivos/disponibilidade";
import { clienteDaEquipe } from "@/lib/efetivos/clientes";
import { PX_POR_DIA, ROTULO_ESCALA, colunasDaEscala, duracaoTexto, faseDaEquipe, janelaPadrao, larguraDaJanela, mesDe, posicaoNaJanela, somarMeses, ultimoDiaDoMes, type Escala, type FaseDaEquipe, type Janela, type PosicaoBarra } from "@/lib/efetivos/linhaDoTempo";
import { useDados } from "./DadosContext";
import { LinhaDica, ligarDica, useDica } from "./quadro/dicas";
import { A_DEFINIR, corDoContrato, fmtDia, rotuloContrato, type Equipe } from "./comum";
import { IcBaixo, IcCarro, IcDir } from "./icones";
import ModalPeriodo from "./modais/ModalPeriodo";
import { CabecalhoPagina, Segmentado, Vazio } from "./ui";

const ROT = 296; // largura da coluna dos nomes
const ALTURA_CAB = 60;
const ALTURA_GRUPO = 38;
const ALTURA_EQUIPE = 46;
const ALTURA_SUB = 30;
const TINTA = "#101B17";

type Agrupamento = "contrato" | "cliente" | "nenhum";
type Janelas = "auto" | "6m" | "12m" | "ano" | "personalizado";

/** Texto branco ou escuro, o que ler melhor sobre a cor da barra. */
function textoSobre(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return L > 0.36 ? TINTA : "#FFFFFF";
}

const FADE_DIR = "linear-gradient(to right, #000 55%, transparent)";
const FADE_ESQ = "linear-gradient(to left, #000 55%, transparent)";
const FADE_AMBOS = "linear-gradient(to right, transparent, #000 18%, #000 82%, transparent)";
const mascara = (p: Pick<PosicaoBarra, "abertoEsq" | "abertoDir">) => (p.abertoEsq && p.abertoDir ? FADE_AMBOS : p.abertoDir ? FADE_DIR : p.abertoEsq ? FADE_ESQ : undefined);

const ROTULO_FASE: Record<FaseDaEquipe, string> = { futura: "Ainda não começou", andamento: "Em andamento", encerrada: "Encerrada", sem_datas: "Sem datas", sem_fim: "Sem data de fim", sem_inicio: "Sem data de início" };
const CHIP_FASE: Record<FaseDaEquipe, string> = { futura: "chip-info", andamento: "chip-ok", encerrada: "chip-mute", sem_datas: "chip-warn", sem_fim: "chip-warn", sem_inicio: "chip-warn" };

type Barra = { id: string; pos: PosicaoBarra };

export default function LinhaDoTempo() {
  const { dados, hoje, equipesCampo, contratoNoDia, contagemDe, vagasPorEquipe, vagaPorId, usosPorEquipe, veiculoPorId, conferenciaDoUso, nomeDe } = useDados();
  const tip = useDica();
  const [escala, setEscala] = useState<Escala>("mes");
  const [agrupar, setAgrupar] = useState<Agrupamento>("contrato");
  const [mostrar, setMostrar] = useState({ viaturas: true, ausencias: true, entradas: true });
  const [abertas, setAbertas] = useState<Set<string>>(new Set());
  const [busca, setBusca] = useState("");
  const [preset, setPreset] = useState<Janelas>("auto");
  const [custom, setCustom] = useState({ de: mesDe(hoje), ate: somarMeses(mesDe(hoje), 11) });
  const [editando, setEditando] = useState<Equipe | null>(null);
  const rolagem = useRef<HTMLDivElement>(null);

  const janela: Janela = useMemo(() => {
    const mes = mesDe(hoje);
    if (preset === "6m") return { de: `${somarMeses(mes, -1)}-01`, ate: ultimoDiaDoMes(`${somarMeses(mes, 5)}-01`) };
    if (preset === "12m") return { de: `${somarMeses(mes, -1)}-01`, ate: ultimoDiaDoMes(`${somarMeses(mes, 11)}-01`) };
    if (preset === "ano") return { de: `${hoje.slice(0, 4)}-01-01`, ate: `${hoje.slice(0, 4)}-12-31` };
    if (preset === "personalizado" && /^\d{4}-\d{2}$/.test(custom.de) && /^\d{4}-\d{2}$/.test(custom.ate) && custom.de <= custom.ate && custom.ate <= somarMeses(custom.de, 35)) return { de: `${custom.de}-01`, ate: ultimoDiaDoMes(`${custom.ate}-01`) };
    return janelaPadrao(equipesCampo, hoje);
  }, [preset, custom, hoje, equipesCampo]);

  const px = PX_POR_DIA[escala];
  const largura = larguraDaJanela(janela, px);
  const colunas = useMemo(() => colunasDaEscala(escala, janela.de, janela.ate), [escala, janela]);
  const x = (d: Dia) => diferencaDias(janela.de, d) * px;
  const xHoje = hoje >= janela.de && hoje <= janela.ate ? x(hoje) + px / 2 : null;

  const colunasPx = useMemo(
    () =>
      colunas.map((c) => {
        const ini = Math.max(0, diferencaDias(janela.de, c.inicio)) * px;
        const fim = Math.min(larguraDaJanela(janela, 1), diferencaDias(janela.de, c.fim) + 1) * px;
        return { ...c, x0: ini, w: Math.max(0, fim - ini) };
      }),
    [colunas, janela, px]
  );
  const superiores = useMemo(() => {
    const out: { chave: string; rotulo: string; x0: number; w: number }[] = [];
    for (const c of colunasPx) {
      const ult = out[out.length - 1];
      if (ult && ult.chave === c.chave) ult.w = c.x0 + c.w - ult.x0;
      else out.push({ chave: c.chave, rotulo: c.superior, x0: c.x0, w: c.w });
    }
    return out;
  }, [colunasPx]);

  // ---- as linhas: equipe -> grupo
  const todas = useMemo(
    () =>
      equipesCampo.map((e) => {
        const contrato = contratoNoDia(e, hoje) || A_DEFINIR;
        return { e, contrato, cliente: clienteDaEquipe(e, dados.contratos) ?? "Sem cliente", fase: faseDaEquipe(e, hoje), pos: posicaoNaJanela(e.inicio, e.fim, janela, px), c: contagemDe([e.id], hoje), nViat: new Set([...(usosPorEquipe.get(e.id) ?? []).map((u) => u.veiculoId), ...(vagasPorEquipe.get(e.id) ?? []).map((v) => v.veiculoId).filter(Boolean) as string[]]).size };
      }),
    [equipesCampo, contratoNoDia, hoje, dados.contratos, janela, px, contagemDe, usosPorEquipe, vagasPorEquipe]
  );

  const grupos = useMemo(() => {
    const t = busca.trim().toLowerCase();
    const filtradas = todas.filter((l) => !t || `${l.e.codigo} ${l.e.nome} ${l.contrato} ${l.cliente} ${l.e.gestor ?? ""} ${l.e.local ?? ""}`.toLowerCase().includes(t));
    const porGrupo = new Map<string, typeof filtradas>();
    for (const l of filtradas) {
      const k = agrupar === "contrato" ? l.contrato : agrupar === "cliente" ? l.cliente : "todas";
      if (!porGrupo.has(k)) porGrupo.set(k, []);
      porGrupo.get(k)!.push(l);
    }
    const ordem = (a: (typeof filtradas)[number], b: (typeof filtradas)[number]) => (a.e.inicio ?? "9999").localeCompare(b.e.inicio ?? "9999") || a.e.codigo.localeCompare(b.e.codigo, "pt-BR", { numeric: true });
    return [...porGrupo.entries()]
      .map(([chave, linhas]) => {
        linhas.sort(ordem);
        const iniciosDatados = linhas.map((l) => l.e.inicio).filter(Boolean) as Dia[];
        const fimsDatados = linhas.map((l) => l.e.fim).filter(Boolean) as Dia[];
        const inicio = iniciosDatados.length ? iniciosDatados.reduce((a, b) => (a < b ? a : b)) : null;
        const fim = fimsDatados.length && fimsDatados.length === linhas.filter((l) => l.e.inicio || l.e.fim).length ? fimsDatados.reduce((a, b) => (a > b ? a : b)) : null;
        return { chave, linhas, inicio, fim, cor: agrupar === "contrato" ? corDoContrato(chave) : "#5B7083", sem: linhas.filter((l) => !l.e.inicio && !l.e.fim).length };
      })
      .sort((a, b) => (a.inicio ?? "9999").localeCompare(b.inicio ?? "9999") || a.chave.localeCompare(b.chave, "pt-BR", { numeric: true }));
  }, [todas, busca, agrupar]);

  // ---- números do topo
  const em30 = somarDias(hoje, 30);
  const kpi = useMemo(() => {
    const ativas = equipesCampo.filter((e) => (e.inicio || e.fim) && faseDaEquipe(e, hoje) !== "futura" && faseDaEquipe(e, hoje) !== "encerrada").length;
    return {
      ativas,
      comecam: equipesCampo.filter((e) => e.inicio && e.inicio > hoje && e.inicio <= em30).length,
      terminam: equipesCampo.filter((e) => e.fim && e.fim >= hoje && e.fim <= em30).length,
      semFim: equipesCampo.filter((e) => e.inicio && !e.fim).length,
      semDatas: equipesCampo.filter((e) => !e.inicio && !e.fim).length,
    };
  }, [equipesCampo, hoje, em30]);

  // abre já na data de hoje
  useEffect(() => {
    if (rolagem.current && xHoje !== null) rolagem.current.scrollLeft = Math.max(0, xHoje - 260);
  }, [escala, janela.de, janela.ate]); // eslint-disable-line react-hooks/exhaustive-deps

  const irParaHoje = () => rolagem.current && xHoje !== null && rolagem.current.scrollTo({ left: Math.max(0, xHoje - 260), behavior: "smooth" });
  const alternar = (id: string) =>
    setAbertas((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const todasAbertas = equipesCampo.length > 0 && equipesCampo.every((e) => abertas.has(e.id));

  // ---- uma barra desenhada na linha
  const barra = (b: Barra, props: { cor: string; altura: number; topo: number; conteudo?: ReactNode; dica?: ReactNode; aoClicar?: () => void; tracejada?: boolean; claro?: boolean }) => {
    const { pos } = b;
    if (pos.fora) return null;
    const w = Math.max(pos.largura, 8);
    const aberta = pos.abertoEsq || pos.abertoDir;
    const semNada = pos.abertoEsq && pos.abertoDir;
    const cor = props.cor;
    const corTexto = props.claro || semNada ? TINTA : textoSobre(cor);
    return (
      <div
        key={b.id}
        className={`absolute rounded-lg ${props.aoClicar ? "cursor-pointer" : ""}`}
        style={{ left: pos.esquerda, width: w, top: props.topo, height: props.altura }}
        onClick={props.aoClicar}
        {...(props.dica ? ligarDica(tip, props.dica) : {})}
      >
        <div
          className="absolute inset-0 rounded-lg"
          style={{
            background: semNada || props.tracejada ? "transparent" : props.claro ? `${cor}33` : cor,
            border: semNada || props.tracejada ? `1.5px dashed ${cor}` : props.claro ? `1px solid ${cor}66` : undefined,
            WebkitMaskImage: aberta && !props.tracejada ? mascara(pos) : undefined,
            maskImage: aberta && !props.tracejada ? mascara(pos) : undefined,
            boxShadow: props.claro || semNada || props.tracejada ? undefined : "0 1px 2px rgba(16,27,23,.18)",
          }}
        />
        <div className="relative h-full text-[11.5px] font-medium leading-none [overflow:clip]" style={{ color: corTexto }}>
          <div className="sticky flex h-full items-center gap-2 px-2.5" style={{ left: ROT + 6, width: "max-content" }}>
            {props.conteudo}
          </div>
        </div>
      </div>
    );
  };

  const dicaEquipe = (l: (typeof todas)[number]) => (
    <>
      <div className="font-semibold text-ink">{l.e.codigo} · {l.e.nome}</div>
      <div className="mb-1 text-gray-500">{rotuloContrato(l.contrato)}{l.cliente !== "Sem cliente" ? ` · ${l.cliente}` : ""}</div>
      <LinhaDica rotulo="Começa">{l.e.inicio ? fmtDia(l.e.inicio) : "sem data"}</LinhaDica>
      <LinhaDica rotulo="Termina">{l.e.fim ? fmtDia(l.e.fim) : "sem data"}</LinhaDica>
      {l.e.inicio && l.e.fim && <LinhaDica rotulo="Duração">{duracaoTexto(l.e.inicio, l.e.fim)}</LinhaDica>}
      <LinhaDica rotulo="Hoje">{l.c.emEquipe} em equipe de {l.c.posicoes} posições</LinhaDica>
      {l.c.abertas > 0 && <LinhaDica rotulo="Vagas abertas">{l.c.abertas}</LinhaDica>}
      {l.c.ausentes > 0 && <LinhaDica rotulo="Ausentes">{l.c.ausentes}</LinhaDica>}
      <LinhaDica rotulo="Viaturas">{l.nViat}</LinhaDica>
      {dados.podeEditar && <div className="mt-1 border-t border-line pt-1 text-[10.5px] text-gray-400">clique para definir o período</div>}
    </>
  );

  // ---- sub-linhas de uma equipe aberta
  function subLinhas(l: (typeof todas)[number]): ReactNode[] {
    const out: ReactNode[] = [];
    const linha = (chave: string, esquerda: ReactNode, direita: ReactNode) => (
      <div key={chave} className="flex border-b border-line/50" style={{ height: ALTURA_SUB }}>
        <div className="sticky left-0 z-20 flex shrink-0 items-center gap-2 overflow-hidden border-r border-line bg-gray-50 pl-12 pr-3 text-[12px]" style={{ width: ROT }}>
          {esquerda}
        </div>
        <div className="relative shrink-0" style={{ width: largura }}>
          {direita}
        </div>
      </div>
    );
    if (mostrar.viaturas) {
      for (const u of usosPorEquipe.get(l.e.id) ?? []) {
        const v = veiculoPorId.get(u.veiculoId);
        if (!v) continue;
        const conf = conferenciaDoUso(u);
        const cor = conf.nivel === "ok" ? "#0E8F63" : conf.nivel === "atencao" ? "#D9910A" : "#6F7E77";
        const pos = posicaoNaJanela(u.inicio, u.fim, janela, px);
        const troca = v.trocaEm && v.substituidoPorId ? { quando: v.trocaEm, para: veiculoPorId.get(v.substituidoPorId)?.identificacao ?? "" } : null;
        out.push(
          linha(
            `uso-${u.id}`,
            <>
              <IcCarro tam={14} />
              <span className="truncate font-semibold text-ink">{v.identificacao}</span>
              <span className="truncate text-[11px] text-gray-500">{[v.placa, v.modelo].filter(Boolean).join(" · ")}</span>
            </>,
            <>
              {barra({ id: `b-${u.id}`, pos }, {
                cor,
                altura: 18,
                topo: 6,
                claro: true,
                tracejada: !u.inicio && !u.fim,
                conteudo: <span className="truncate" style={{ color: TINTA }}>{u.inicio || u.fim ? `${conf.texto}` : "sem datas"}</span>,
                dica: (
                  <>
                    <div className="font-semibold text-ink">{v.identificacao} na equipe {l.e.codigo}</div>
                    <LinhaDica rotulo="Entra">{u.inicio ? fmtDia(u.inicio) : "sem data"}</LinhaDica>
                    <LinhaDica rotulo="Sai">{u.fim ? fmtDia(u.fim) : "sem data"}</LinhaDica>
                    <LinhaDica rotulo="Equipe">{`${l.e.inicio ? fmtDia(l.e.inicio) : "?"} → ${l.e.fim ? fmtDia(l.e.fim) : "?"}`}</LinhaDica>
                    <div className="mt-1 text-[11.5px]" style={{ color: cor }}>{conf.texto}</div>
                    {troca && <div className="mt-1 text-info">Será substituída pela {troca.para} em {fmtDia(troca.quando)}</div>}
                  </>
                ),
              })}
              {troca && troca.quando >= janela.de && troca.quando <= janela.ate && (
                <div className="absolute top-0 bottom-0 w-px bg-info" style={{ left: x(troca.quando) }} {...ligarDica(tip, `Troca em ${fmtDia(troca.quando)}\n${v.identificacao} → ${troca.para}`)}>
                  <span className="absolute -top-0.5 -translate-x-1/2 whitespace-nowrap rounded bg-info px-1 text-[9px] font-semibold leading-3 text-white">{troca.para}</span>
                </div>
              )}
            </>
          )
        );
      }
    }
    if (mostrar.ausencias) {
      const aus = dados.ausencias.filter((a) => vagaPorId.get(a.vagaId)?.equipeId === l.e.id).sort((a, b) => a.inicio.localeCompare(b.inicio));
      for (const a of aus.slice(0, 12)) {
        const v = vagaPorId.get(a.vagaId)!;
        const pos = posicaoNaJanela(a.inicio, a.fim, janela, px);
        out.push(
          linha(
            `aus-${a.id}`,
            <>
              <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-warn" />
              <span className="truncate text-ink">{nomeDe(v)}</span>
              <span className="shrink-0 text-[11px] text-gray-500">{a.tipo}</span>
            </>,
            barra({ id: `b-${a.id}`, pos }, { cor: "#D9910A", altura: 16, topo: 7, claro: true, conteudo: <span className="truncate">{a.tipo}</span>, dica: `${nomeDe(v)}\n${a.tipo}: ${fmtDia(a.inicio)} a ${fmtDia(a.fim)}` })
          )
        );
      }
      if (aus.length > 12) out.push(linha(`aus-mais-${l.e.id}`, <span className="text-gray-500">+ {aus.length - 12} ausências</span>, null));
    }
    if (mostrar.entradas) {
      const ent = (vagasPorEquipe.get(l.e.id) ?? []).filter((v) => v.previsaoInicio).sort((a, b) => a.previsaoInicio!.localeCompare(b.previsaoInicio!));
      for (const v of ent.slice(0, 12)) {
        const quando = v.previsaoInicio!;
        const dentro = quando >= janela.de && quando <= janela.ate;
        out.push(
          linha(
            `ent-${v.id}`,
            <>
              <span className="inline-block h-2 w-2 shrink-0 rotate-45 bg-info" />
              <span className="truncate text-ink">{v.nome ? nomeDe(v) : `Vaga · ${v.cargo}`}</span>
              <span className="shrink-0 text-[11px] text-gray-500">entra {fmtDia(quando)}</span>
            </>,
            dentro ? (
              <div className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ left: x(quando) + px / 2 }} {...ligarDica(tip, `${v.nome ? nomeDe(v) : `Vaga de ${v.cargo}`}\nEntrada prevista em ${fmtDia(quando)}\n${v.status}`)}>
                <span className="block h-3 w-3 rotate-45 bg-info ring-2 ring-white" />
              </div>
            ) : null
          )
        );
      }
    }
    if (out.length === 0) out.push(linha(`vazio-${l.e.id}`, <span className="text-gray-400">Nada a mostrar com os filtros atuais</span>, null));
    return out;
  }

  return (
    <div>
      <CabecalhoPagina
        titulo="Linha do tempo"
        subtitulo="Por quanto tempo cada equipe é usada, do começo ao fim. Veja por trimestre, mês ou semana; abra uma equipe para ver as viaturas, as ausências e as entradas previstas."
        acoes={
          <button onClick={irParaHoje} className="btn-ghost" disabled={xHoje === null}>
            Ir para hoje
          </button>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          ["Em andamento hoje", kpi.ativas, "#0E8F63", "equipes com período definido que estão rodando"],
          ["Começam em 30 dias", kpi.comecam, "#1D6FB8", "equipes que ainda vão começar"],
          ["Terminam em 30 dias", kpi.terminam, kpi.terminam > 0 ? "#B86E00" : "#101B17", "as pessoas e viaturas delas ficam livres depois"],
          ["Sem data de fim", kpi.semFim, kpi.semFim > 0 ? "#B86E00" : "#101B17", "a barra vai se apagando até alguém definir o fim"],
          ["Sem nenhuma data", kpi.semDatas, kpi.semDatas > 0 ? "#B86E00" : "#101B17", "não dá para desenhar: defina o período"],
        ].map(([r, v, c, d]) => (
          <div key={r as string} className="card px-4 py-3" title={d as string}>
            <div className="text-[10.5px] font-semibold uppercase tracking-wider text-gray-500">{r}</div>
            <div className="num mt-1 font-display text-[26px] font-semibold leading-none" style={{ color: c as string }}>
              {v}
            </div>
          </div>
        ))}
      </div>

      <div className="card mb-4 flex flex-wrap items-end gap-x-5 gap-y-3 p-3.5">
        <div>
          <span className="label">Escala</span>
          <Segmentado valor={escala} opcoes={(["trimestre", "mes", "semana"] as Escala[]).map((id) => ({ id, rotulo: ROTULO_ESCALA[id] }))} onChange={setEscala} />
        </div>
        <label>
          <span className="label">Período</span>
          <select value={preset} onChange={(e) => setPreset(e.target.value as Janelas)} className="field">
            <option value="auto">Tudo o que está planejado</option>
            <option value="6m">Próximos 6 meses</option>
            <option value="12m">Próximos 12 meses</option>
            <option value="ano">Este ano</option>
            <option value="personalizado">Escolher meses…</option>
          </select>
        </label>
        {preset === "personalizado" && (
          <>
            <label>
              <span className="label">De</span>
              <input type="month" value={custom.de} onChange={(e) => e.target.value && setCustom((c) => ({ ...c, de: e.target.value }))} className="field" />
            </label>
            <label>
              <span className="label">Até</span>
              <input type="month" value={custom.ate} onChange={(e) => e.target.value && setCustom((c) => ({ ...c, ate: e.target.value }))} className="field" />
            </label>
          </>
        )}
        <label>
          <span className="label">Agrupar por</span>
          <select value={agrupar} onChange={(e) => setAgrupar(e.target.value as Agrupamento)} className="field">
            <option value="contrato">Contrato</option>
            <option value="cliente">Cliente</option>
            <option value="nenhum">Sem grupos</option>
          </select>
        </label>
        <label className="min-w-[170px] flex-1">
          <span className="label">Buscar equipe</span>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="nome, contrato, gestor…" className="field" />
        </label>
        <div>
          <span className="label">Ao abrir uma equipe, mostrar</span>
          <div className="flex gap-3 text-[13px] text-gray-700">
            {([["viaturas", "Viaturas"], ["ausencias", "Ausências"], ["entradas", "Entradas previstas"]] as const).map(([k, r]) => (
              <label key={k} className="flex cursor-pointer items-center gap-1.5">
                <input type="checkbox" checked={mostrar[k]} onChange={(e) => setMostrar((m) => ({ ...m, [k]: e.target.checked }))} className="h-4 w-4 accent-[#0A9E7F]" />
                {r}
              </label>
            ))}
          </div>
        </div>
        <button onClick={() => setAbertas(todasAbertas ? new Set() : new Set(equipesCampo.map((e) => e.id)))} className="btn-ghost">
          {todasAbertas ? "Recolher todas" : "Abrir todas"}
        </button>
      </div>

      {kpi.semDatas > 0 && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-warn/25 bg-warn-soft px-4 py-2.5 text-[13px] text-warn">
          <span>
            <b>{kpi.semDatas}</b> equipe(s) ainda sem data de início e de fim aparecem tracejadas. Preencha na base em Excel ou na aba Planejamento para a linha do tempo mostrar o tempo real de cada uma.
          </span>
          <Link href="/equipes?aba=planejamento" className="font-semibold underline">
            Definir períodos
          </Link>
        </div>
      )}

      <div className="card overflow-hidden">
        <div ref={rolagem} className="overflow-auto" style={{ maxHeight: "calc(100vh - 300px)", minHeight: 280 }}>
          <div style={{ width: ROT + largura, minWidth: "100%" }}>
            {/* cabeçalho: o agrupador de cima (ano ou mês) e as colunas */}
            <div className="sticky top-0 z-30 flex">
              <div className="sticky left-0 z-40 flex shrink-0 items-end border-b border-r border-line bg-white px-4 pb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500" style={{ width: ROT, height: ALTURA_CAB }}>
                Equipe · {ROTULO_ESCALA[escala].toLowerCase()}
              </div>
              <div className="relative shrink-0 border-b border-line bg-white" style={{ width: largura, height: ALTURA_CAB }}>
                {superiores.map((s) => (
                  <div key={s.chave + s.x0} className="absolute top-0 flex h-[26px] items-center border-l border-line px-2 text-[11.5px] font-semibold text-ink first-letter:uppercase" style={{ left: s.x0, width: s.w }}>
                    <span className="sticky left-[300px] truncate">{s.rotulo}</span>
                  </div>
                ))}
                {colunasPx.map((c) => {
                  const atual = hoje >= c.inicio && hoje <= c.fim;
                  return (
                    <div key={c.inicio} className={`absolute bottom-0 flex h-[34px] items-center justify-center border-l border-line text-[11px] ${atual ? "bg-brand-soft font-bold text-brand-dark" : "text-gray-500"}`} style={{ left: c.x0, width: c.w }} title={`${fmtDia(c.inicio)} a ${fmtDia(c.fim)}`}>
                      {c.rotulo}
                    </div>
                  );
                })}
                {xHoje !== null && (
                  <>
                    <div className="absolute top-[5px] z-10 -translate-x-1/2 rounded bg-accent px-1.5 py-0.5 text-[9.5px] font-bold uppercase leading-3 tracking-wide text-white" style={{ left: xHoje }}>
                      hoje · {fmtDia(hoje).slice(0, 5)}
                    </div>
                    <div className="absolute bottom-0 top-[24px] z-[5] w-[2px] -translate-x-1/2 bg-accent/70" style={{ left: xHoje }} />
                  </>
                )}
              </div>
            </div>

            {/* corpo */}
            <div className="relative">
              <div className="pointer-events-none absolute bottom-0 top-0 z-0" style={{ left: ROT, width: largura }}>
                {colunasPx.map((c, i) => (
                  <div key={c.inicio} className={`absolute bottom-0 top-0 border-l border-line/70 ${i % 2 ? "bg-gray-50/60" : ""}`} style={{ left: c.x0, width: c.w }} />
                ))}
              </div>
              {xHoje !== null && <div className="pointer-events-none absolute bottom-0 top-0 z-10 w-[2px] bg-accent/70" style={{ left: ROT + xHoje - 1 }} />}

              {grupos.length === 0 && <Vazio titulo="Nenhuma equipe encontrada" texto="Ajuste a busca ou o cliente escolhido no menu." />}
              {grupos.map((g) => (
                <div key={g.chave} className="relative z-[1]">
                  {agrupar !== "nenhum" && (
                    <div className="flex border-b border-line bg-gray-50/90" style={{ height: ALTURA_GRUPO }}>
                      <div className="sticky left-0 z-20 flex shrink-0 items-center gap-2 border-r border-line bg-gray-50 px-4" style={{ width: ROT }}>
                        <span className="inline-block h-3 w-3 shrink-0 rounded-[4px]" style={{ background: g.cor }} />
                        <span className="truncate font-display text-[13px] font-semibold text-ink">{agrupar === "contrato" ? rotuloContrato(g.chave) : g.chave}</span>
                        <span className="num shrink-0 text-[11px] text-gray-500">{g.linhas.length} {g.linhas.length === 1 ? "equipe" : "equipes"}</span>
                      </div>
                      <div className="relative shrink-0" style={{ width: largura }}>
                        {g.inicio &&
                          barra({ id: `g-${g.chave}`, pos: posicaoNaJanela(g.inicio, g.fim, janela, px) }, {
                            cor: g.cor,
                            altura: 14,
                            topo: 12,
                            claro: true,
                            conteudo: <span className="truncate text-[10.5px]">{g.inicio && g.fim ? `${duracaoTexto(g.inicio, g.fim)} no total` : "sem data de fim"}</span>,
                            dica: `${agrupar === "contrato" ? rotuloContrato(g.chave) : g.chave}\n${g.linhas.length} equipe(s)\nDe ${fmtDia(g.inicio)} a ${g.fim ? fmtDia(g.fim) : "sem data de fim"}${g.sem ? `\n${g.sem} sem nenhuma data` : ""}`,
                          })}
                      </div>
                    </div>
                  )}
                  {g.linhas.map((l) => {
                    const aberta = abertas.has(l.e.id);
                    const cor = corDoContrato(l.contrato);
                    const larg = l.pos.largura;
                    return (
                      <div key={l.e.id}>
                        <div className="flex border-b border-line/60 hover:bg-gray-50/40" style={{ height: ALTURA_EQUIPE }}>
                          <div className="sticky left-0 z-20 flex shrink-0 items-center gap-1.5 border-r border-line bg-white py-1 pl-2 pr-3" style={{ width: ROT }}>
                            <button onClick={() => alternar(l.e.id)} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-ink" aria-label={aberta ? "Recolher" : "Abrir"} aria-expanded={aberta}>
                              {aberta ? <IcBaixo tam={14} /> : <IcDir tam={14} />}
                            </button>
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-[12.5px] font-semibold text-ink" title={l.e.nome}>
                                <span className="mr-1.5 font-mono text-[10px] font-normal text-gray-500">{l.e.codigo}</span>
                                {l.e.nome}
                              </div>
                              <div className="flex items-center gap-1.5 text-[10.5px] text-gray-500">
                                <span className={`${CHIP_FASE[l.fase]} !px-1.5 !py-0 !text-[9.5px]`}>{ROTULO_FASE[l.fase]}</span>
                                <span className="num truncate">{l.c.emEquipe}/{l.c.posicoes} {l.c.posicoes === 1 ? "pessoa" : "pessoas"} · {l.nViat} viat.</span>
                              </div>
                            </div>
                          </div>
                          <div className="relative shrink-0" style={{ width: largura }}>
                            {l.pos.fora ? (
                              <div className="absolute top-1/2 -translate-y-1/2 px-3 text-[11px] italic text-gray-400" style={{ left: l.e.fim && l.e.fim < janela.de ? 4 : undefined, right: l.e.inicio && l.e.inicio > janela.ate ? 4 : undefined }}>
                                {l.e.fim && l.e.fim < janela.de ? `encerrada em ${fmtDia(l.e.fim)}` : `começa em ${fmtDia(l.e.inicio)}`}
                              </div>
                            ) : (
                              barra({ id: `e-${l.e.id}`, pos: l.pos }, {
                                cor,
                                altura: 30,
                                topo: 8,
                                aoClicar: dados.podeEditar ? () => setEditando(l.e) : undefined,
                                dica: dicaEquipe(l),
                                conteudo:
                                  l.e.inicio || l.e.fim ? (
                                    <>
                                      {larg >= 100 && <span className="truncate font-semibold">{l.e.nome}</span>}
                                      {larg >= 210 && l.e.inicio && l.e.fim && <span className="shrink-0 rounded bg-black/15 px-1.5 py-1 text-[10px]">{duracaoTexto(l.e.inicio, l.e.fim)}</span>}
                                      {larg >= 300 && <span className="num shrink-0 opacity-90">{l.c.emEquipe} {l.c.emEquipe === 1 ? "pessoa" : "pessoas"}</span>}
                                    </>
                                  ) : (
                                    <span className="whitespace-nowrap italic">sem datas · {dados.podeEditar ? "clique para definir o período" : "período não definido"}</span>
                                  ),
                              })
                            )}
                          </div>
                        </div>
                        {aberta && <div className="bg-gray-50/50">{subLinhas(l)}</div>}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-line bg-gray-50 px-4 py-2.5 text-[11.5px] text-gray-600">
          <span className="inline-flex items-center gap-1.5"><span className="inline-block h-3 w-6 rounded-md bg-brand" /> equipe com período definido</span>
          <span className="inline-flex items-center gap-1.5"><span className="inline-block h-3 w-6 rounded-md bg-brand" style={{ WebkitMaskImage: FADE_DIR, maskImage: FADE_DIR }} /> sem data de fim (ou de início)</span>
          <span className="inline-flex items-center gap-1.5"><span className="inline-block h-3 w-6 rounded-md border border-dashed border-gray-400" /> sem nenhuma data</span>
          <span className="inline-flex items-center gap-1.5"><span className="inline-block h-3 w-6 rounded-md" style={{ background: "#0E8F6333", border: "1px solid #0E8F6366" }} /> viatura que confere com a equipe</span>
          <span className="inline-flex items-center gap-1.5"><span className="inline-block h-3 w-6 rounded-md" style={{ background: "#D9910A33", border: "1px solid #D9910A66" }} /> viatura que não confere / ausência</span>
          <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rotate-45 bg-info" /> entrada prevista</span>
          <span className="inline-flex items-center gap-1.5"><span className="inline-block h-3 w-0.5 bg-accent" /> hoje</span>
        </div>
      </div>

      {editando && <ModalPeriodo equipe={editando} onFechar={() => setEditando(null)} />}
    </div>
  );
}
