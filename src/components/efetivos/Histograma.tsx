"use client";

// Histograma: pessoas, posições, vagas, ausências, viaturas e equipes, mês a mês, por equipe, contrato, cliente ou cargo.
// Cada mês é a média dos dias (equipe que começa no dia 20 entra pela fração). Filtra por contrato, equipe e cargo; o mesmo
// cálculo alimenta o gráfico, a tabela equipe × mês e o Excel.
import Link from "next/link";
import { useMemo, useState } from "react";
import { AGRUPAMENTOS, MEDIDAS, SEM_FILTROS, agrupamentosDaMedida, agruparTopo, calcularHistograma, type Agrupar, type Filtros, type Medida } from "@/lib/efetivos/histograma";
import { janelaPadrao, mesDe, nomeDoMes, somarMeses } from "@/lib/efetivos/linhaDoTempo";
import { useDados } from "./DadosContext";
import { ehReserva, rotuloContrato } from "./comum";
import { ColunasEmpilhadas, Legenda, type Serie } from "./graficos";
import { CabecalhoPagina, Secao, Vazio } from "./ui";

// Paleta categórica de 8 posições (azul, laranja, água, amarelo, magenta, verde, violeta, vermelho), na ordem validada para
// colunas empilhadas: vizinhos sempre distinguíveis, inclusive por quem não enxerga bem as cores. O resto vai em cinza ("Outros").
const SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7"];
const OUTROS = "#9AA8A1";
// Sequencial de um tom só (azul), do claro ao escuro, para a tabela equipe × mês.
const RAMPA = ["#cde2fb", "#b7d3f6", "#9ec5f4", "#86b6ef", "#6da7ec", "#5598e7", "#3987e5", "#2a78d6", "#256abf", "#1c5cab", "#184f95", "#104281"];
const TOPO = SERIES.length;

const rotuloMes = (m: string) => `${nomeDoMes(Number(m.slice(5, 7)))}/${m.slice(2, 4)}`;
const nomeLongoDoMes = (m: string) => `${nomeDoMes(Number(m.slice(5, 7)), true)} de ${m.slice(0, 4)}`;
const nomeLongoMaiusculo = (m: string) => nomeLongoDoMes(m).replace(/^./, (c) => c.toUpperCase());
const fmtNum = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace(".", ","));

function corDaRampa(v: number, max: number): { fundo: string; texto: string } {
  if (v <= 0 || max <= 0) return { fundo: "transparent", texto: "#9AA8A1" };
  const i = Math.min(RAMPA.length - 1, Math.round((v / max) * (RAMPA.length - 1)));
  return { fundo: RAMPA[i], texto: i >= 6 ? "#FFFFFF" : "#101B17" };
}

type Janelas = "auto" | "6m" | "12m" | "ano" | "personalizado";

export default function Histograma() {
  const { dados, hoje, idx, equipesCampo } = useDados();
  const [medida, setMedida] = useState<Medida>("efetivo");
  const [agrupar, setAgrupar] = useState<Agrupar>("equipe");
  const [filtros, setFiltros] = useState<Filtros>(SEM_FILTROS);
  const [preset, setPreset] = useState<Janelas>("auto");
  const [custom, setCustom] = useState({ de: mesDe(hoje), ate: somarMeses(mesDe(hoje), 11) });
  const [mesSel, setMesSel] = useState<string | null>(null);
  const [baixando, setBaixando] = useState(false);

  const agrupamentos = agrupamentosDaMedida(medida);
  const agruparEfetivo: Agrupar = agrupamentos.includes(agrupar) ? agrupar : "equipe";
  const info = MEDIDAS.find((m) => m.id === medida)!;

  // ---- o período: do mês em que o planejamento começa ao mês em que termina (no máximo 24 meses)
  const { de, ate } = useMemo(() => {
    const mes = mesDe(hoje);
    if (preset === "6m") return { de: somarMeses(mes, -1), ate: somarMeses(mes, 4) };
    if (preset === "12m") return { de: somarMeses(mes, -1), ate: somarMeses(mes, 10) };
    if (preset === "ano") return { de: `${hoje.slice(0, 4)}-01`, ate: `${hoje.slice(0, 4)}-12` };
    if (preset === "personalizado" && /^\d{4}-\d{2}$/.test(custom.de) && /^\d{4}-\d{2}$/.test(custom.ate) && custom.de <= custom.ate && custom.ate <= somarMeses(custom.de, 35)) return { de: custom.de, ate: custom.ate };
    const j = janelaPadrao(equipesCampo, hoje);
    const ini = mesDe(j.de);
    const fim = mesDe(j.ate);
    return { de: ini, ate: fim > somarMeses(ini, 23) ? somarMeses(ini, 23) : fim };
  }, [preset, custom, hoje, equipesCampo]);

  const h = useMemo(
    () =>
      calcularHistograma(
        {
          equipes: dados.equipes,
          vagas: dados.vagas as any,
          idx,
          contratos: dados.contratos,
          usos: dados.usosVeiculo ?? [],
        },
        { medida, agrupar: agruparEfetivo, de, ate, filtros }
      ),
    [dados, idx, medida, agruparEfetivo, de, ate, filtros]
  );

  const topo = useMemo(() => agruparTopo(h, TOPO), [h]);
  const corDoGrupo = (chave: string) => {
    const i = h.grupos.findIndex((g) => g.chave === chave);
    return i >= 0 && i < TOPO ? SERIES[i] : OUTROS;
  };

  const series: Serie[] = topo.map((g, i) => ({ nome: g.rotulo, cor: g.chave === "__outros" ? OUTROS : SERIES[i] }));
  const colunas = h.meses.map((m, i) => ({ rotulo: rotuloMes(m), dica: nomeLongoDoMes(m), valores: topo.map((g) => g.valores[i]), destaque: m === mesDe(hoje) }));
  const compSeries: Serie[] = [
    { nome: "Em equipe", cor: SERIES[0] },
    { nome: "Ausentes", cor: SERIES[1] },
    { nome: "Vagas abertas", cor: SERIES[2] },
    { nome: "Sem nome informado", cor: OUTROS },
  ];
  const compColunas = h.meses.map((m, i) => ({ rotulo: rotuloMes(m), dica: nomeLongoDoMes(m), valores: [h.composicao[i].emEquipe, h.composicao[i].ausentes, h.composicao[i].abertas, h.composicao[i].semNome], destaque: m === mesDe(hoje) }));

  const mesAtual = mesSel && h.meses.includes(mesSel) ? mesSel : h.meses.includes(mesDe(hoje)) ? mesDe(hoje) : h.meses[0];
  const iMes = h.meses.indexOf(mesAtual);
  const pico = Math.max(0, ...h.totais);
  const iPico = h.totais.indexOf(pico);
  const media = h.totais.length ? Math.round((h.totais.reduce((s, v) => s + v, 0) / h.totais.length) * 10) / 10 : 0;
  const maxCelula = Math.max(0, ...h.grupos.flatMap((g) => g.valores));

  // ---- opções dos filtros
  const opContratos = useMemo(() => [...new Set(equipesCampo.map((e) => e.projeto))].sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true })).map((c) => ({ id: c, rotulo: rotuloContrato(c) })), [equipesCampo]);
  const opEquipes = useMemo(() => equipesCampo.map((e) => ({ id: e.id, rotulo: `${e.codigo} · ${e.nome}` })), [equipesCampo]);
  const opCargos = useMemo(() => [...new Set(dados.vagas.filter((v) => !ehReserva({ grupo: dados.equipes.find((e) => e.id === v.equipeId)?.grupo ?? "" })).map((v) => (v.atividade || v.cargo || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR")).map((c) => ({ id: c, rotulo: c })), [dados]);
  const nFiltros = filtros.contratos.length + filtros.equipes.length + filtros.cargos.length + (filtros.semDatas ? 0 : 1);

  // clicar no nome de uma linha filtra por ela
  function soEsta(chave: string) {
    if (chave === "__outros") return;
    if (agruparEfetivo === "equipe") setFiltros((f) => ({ ...f, equipes: [chave] }));
    else if (agruparEfetivo === "contrato") setFiltros((f) => ({ ...f, contratos: [chave] }));
    else if (agruparEfetivo === "cargo") setFiltros((f) => ({ ...f, cargos: [chave] }));
  }
  const podeFiltrarLinha = agruparEfetivo !== "cliente";

  async function baixarExcel() {
    setBaixando(true);
    try {
      const XLSX = await import("xlsx");
      const cab = [AGRUPAMENTOS.find((a) => a.id === agruparEfetivo)!.rotulo, ...h.meses.map(rotuloMes), "Média", "Pico"];
      const linhas = h.grupos.map((g) => [g.rotulo, ...g.valores, g.media, g.pico]);
      linhas.push(["Total", ...h.totais, media, pico]);
      const ws = XLSX.utils.aoa_to_sheet([cab, ...linhas]);
      ws["!cols"] = [{ wch: 40 }, ...h.meses.map(() => ({ wch: 9 })), { wch: 9 }, { wch: 9 }];
      const filt = XLSX.utils.aoa_to_sheet([
        ["Medida", info.rotulo],
        ["O que é", info.ajuda],
        ["Agrupado por", AGRUPAMENTOS.find((a) => a.id === agruparEfetivo)!.rotulo],
        ["Período", `${nomeLongoDoMes(de)} a ${nomeLongoDoMes(ate)}`],
        ["Contratos", filtros.contratos.join(", ") || "todos"],
        ["Equipes", filtros.equipes.map((id) => opEquipes.find((o) => o.id === id)?.rotulo ?? id).join(", ") || "todas"],
        ["Cargos", filtros.cargos.join(", ") || "todos"],
        ["Equipes sem datas", filtros.semDatas ? "entram como ativas o tempo todo" : "ficam de fora"],
        ["Cada mês", "média dos dias do mês"],
      ]);
      filt["!cols"] = [{ wch: 20 }, { wch: 90 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Histograma");
      XLSX.utils.book_append_sheet(wb, filt, "Filtros");
      XLSX.writeFile(wb, `histograma_${medida}_${de}_${ate}.xlsx`);
    } finally {
      setBaixando(false);
    }
  }

  return (
    <div>
      <CabecalhoPagina
        titulo="Histograma"
        subtitulo="Quanto cada equipe, contrato ou cargo usa de pessoas e viaturas, mês a mês. Cada mês é a média dos dias: uma equipe que começa no dia 20 entra pela fração do mês."
        acoes={
          <button onClick={baixarExcel} disabled={baixando || h.grupos.length === 0} className="btn-ghost">
            {baixando ? "Gerando…" : "Baixar Excel"}
          </button>
        }
      />

      <div className="card mb-4 p-3.5">
        <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
          <label>
            <span className="label">Medida</span>
            <select value={medida} onChange={(e) => setMedida(e.target.value as Medida)} className="field">
              {MEDIDAS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.rotulo}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="label">Agrupar por</span>
            <select value={agruparEfetivo} onChange={(e) => setAgrupar(e.target.value as Agrupar)} className="field">
              {AGRUPAMENTOS.filter((a) => agrupamentos.includes(a.id)).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.rotulo}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="label">Período</span>
            <select value={preset} onChange={(e) => setPreset(e.target.value as Janelas)} className="field">
              <option value="auto">Tudo o que está planejado</option>
              <option value="6m">6 meses</option>
              <option value="12m">12 meses</option>
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
          <MultiSelecao rotulo="Contratos" opcoes={opContratos} valor={filtros.contratos} onChange={(contratos) => setFiltros((f) => ({ ...f, contratos }))} />
          <MultiSelecao rotulo="Equipes" opcoes={opEquipes} valor={filtros.equipes} onChange={(equipes) => setFiltros((f) => ({ ...f, equipes }))} />
          {agrupamentos.includes("cargo") && <MultiSelecao rotulo="Cargos" opcoes={opCargos} valor={filtros.cargos} onChange={(cargos) => setFiltros((f) => ({ ...f, cargos }))} />}
          <label className="flex cursor-pointer items-center gap-2 pb-2 text-[13px] text-gray-700" title="Equipes sem data de início e de fim contam como ativas durante todo o período">
            <input type="checkbox" checked={filtros.semDatas} onChange={(e) => setFiltros((f) => ({ ...f, semDatas: e.target.checked }))} className="h-4 w-4 accent-[#0A9E7F]" />
            Incluir equipes sem datas
          </label>
          {nFiltros > 0 && (
            <button onClick={() => setFiltros(SEM_FILTROS)} className="btn-ghost mb-0.5">
              Limpar filtros ({nFiltros})
            </button>
          )}
        </div>
        <p className="mt-2.5 text-[12px] text-gray-500">
          <b className="text-gray-700">{info.rotulo}:</b> {info.ajuda}
          {medida === "viaturas" && " A mesma viatura usada por mais de uma equipe aparece em cada uma, mas conta uma vez só no total."}
        </p>
      </div>

      {h.equipesSemDatas > 0 && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-warn/25 bg-warn-soft px-4 py-2.5 text-[13px] text-warn">
          <span>
            <b>{h.equipesSemDatas}</b> equipe(s) sem data de início e fim estão contadas como ativas em todos os meses. Defina os períodos para o histograma refletir o tempo real.
          </span>
          <Link href="/linha-do-tempo" className="font-semibold underline">
            Ver na linha do tempo
          </Link>
        </div>
      )}

      {h.grupos.length === 0 ? (
        <div className="card">
          <Vazio titulo="Nada para mostrar neste filtro" texto="Ajuste o período ou limpe os filtros. Equipes sem datas só entram se a opção “Incluir equipes sem datas” estiver marcada." />
        </div>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              ["Pico no período", fmtNum(pico), `${info.unidade} em ${h.meses[iPico] ? nomeLongoDoMes(h.meses[iPico]) : "—"}`],
              ["Média por mês", fmtNum(media), info.unidade],
              [`Em ${nomeLongoDoMes(mesAtual)}`, fmtNum(h.totais[iMes] ?? 0), info.unidade],
              [AGRUPAMENTOS.find((a) => a.id === agruparEfetivo)!.rotulo === "Equipe" ? "Equipes na análise" : "Grupos na análise", String(h.grupos.length), `de ${h.equipesNoCalculo} equipe(s) consideradas`],
            ].map(([r, v, s]) => (
              <div key={r} className="card px-4 py-3">
                <div className="text-[10.5px] font-semibold uppercase tracking-wider text-gray-500">{r}</div>
                <div className="num mt-1 font-display text-[26px] font-semibold leading-none text-ink">{v}</div>
                <div className="mt-1 text-[11px] text-gray-500">{s}</div>
              </div>
            ))}
          </div>

          <div className="mb-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
            <Secao titulo={`${info.rotulo}, mês a mês`} sub={`Por ${AGRUPAMENTOS.find((a) => a.id === agruparEfetivo)!.rotulo.toLowerCase()} · passe o mouse para ver os números, clique numa coluna para ver o mês`}>
              <Legenda series={series} className="mb-2" />
              <ColunasEmpilhadas colunas={colunas} series={series} altura={260} aoClicar={(i) => setMesSel(h.meses[i])} rotuloEixo={`${info.rotulo} por mês`} />
            </Secao>

            <Secao titulo={nomeLongoMaiusculo(mesAtual)} sub={`${info.rotulo}, média do mês`}>
              <ul className="space-y-1.5">
                {h.grupos.slice(0, 14).map((g) => {
                  const v = g.valores[iMes];
                  const total = h.totais[iMes] || 1;
                  return (
                    <li key={g.chave} className="text-[12.5px]">
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: corDoGrupo(g.chave) }} />
                          <span className="truncate text-ink" title={g.rotulo}>
                            {g.rotulo}
                          </span>
                        </span>
                        <span className="num shrink-0 font-semibold text-ink">{fmtNum(v)}</span>
                      </div>
                      <div className="mt-0.5 h-1.5 rounded-full bg-gray-100">
                        <div className="h-full rounded-full" style={{ width: `${Math.max(0, (v / total) * 100)}%`, background: corDoGrupo(g.chave), minWidth: v > 0 ? 3 : 0 }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
              {h.grupos.length > 14 && <p className="mt-2 text-[11.5px] text-gray-500">+ {h.grupos.length - 14} na tabela abaixo</p>}
              <div className="mt-3 flex items-center justify-between border-t border-line pt-2 text-[12.5px]">
                <span className="font-semibold text-ink">Total</span>
                <span className="num font-semibold text-ink">{fmtNum(h.totais[iMes] ?? 0)}</span>
              </div>
              <Link href={`/consulta?data=${mesAtual}-15`} className="mt-2 inline-block text-[12px] font-semibold text-brand-dark hover:underline">
                Ver quem está livre em {nomeLongoDoMes(mesAtual)}
              </Link>
            </Secao>
          </div>

          {medida !== "viaturas" && medida !== "equipes" && (
            <div className="mb-4">
              <Secao titulo="Como ficam as posições" sub="Em equipe, ausentes, vagas abertas e sem nome informado, mês a mês (todas as equipes do filtro)">
                <Legenda series={compSeries} className="mb-2" />
                <ColunasEmpilhadas colunas={compColunas} series={compSeries} altura={200} aoClicar={(i) => setMesSel(h.meses[i])} rotuloEixo="Composição das posições por mês" />
              </Secao>
            </div>
          )}

          <Secao
            titulo={`Tabela ${AGRUPAMENTOS.find((a) => a.id === agruparEfetivo)!.rotulo.toLowerCase()} × mês`}
            sub={`${info.rotulo}. Quanto mais escuro, maior o valor.${podeFiltrarLinha ? " Clique no nome para ver só esta linha." : ""}`}
            semPadding
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-max border-separate border-spacing-0 text-[12px]">
                <thead>
                  <tr className="text-[10.5px] font-semibold uppercase tracking-wide text-gray-500">
                    <th className="sticky left-0 z-10 min-w-[250px] border-b border-line bg-gray-50 px-3 py-2 text-left">{AGRUPAMENTOS.find((a) => a.id === agruparEfetivo)!.rotulo}</th>
                    {h.meses.map((m) => (
                      <th key={m} className={`min-w-[52px] border-b border-line px-1.5 py-2 text-center ${m === mesDe(hoje) ? "bg-brand-soft text-brand-dark" : "bg-gray-50"} ${m === mesAtual ? "ring-1 ring-inset ring-brand" : ""}`}>
                        <button onClick={() => setMesSel(m)} className="uppercase hover:underline" title={nomeLongoDoMes(m)}>
                          {rotuloMes(m)}
                        </button>
                      </th>
                    ))}
                    <th className="min-w-[56px] border-b border-l border-line bg-gray-50 px-2 py-2 text-right">Média</th>
                    <th className="min-w-[56px] border-b border-line bg-gray-50 px-2 py-2 text-right">Pico</th>
                  </tr>
                </thead>
                <tbody>
                  {h.grupos.map((g) => (
                    <tr key={g.chave} className="group">
                      <th className="sticky left-0 z-10 border-b border-line bg-white px-3 py-1.5 text-left font-medium text-ink group-hover:bg-gray-50">
                        <span className="flex items-center gap-2">
                          <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: corDoGrupo(g.chave) }} />
                          {podeFiltrarLinha ? (
                            <button onClick={() => soEsta(g.chave)} className="truncate text-left hover:underline" title={`${g.rotulo} — ver só esta linha`}>
                              {g.rotulo}
                            </button>
                          ) : (
                            <span className="truncate">{g.rotulo}</span>
                          )}
                        </span>
                        {g.sub && agruparEfetivo === "equipe" && <span className="ml-[18px] block text-[10.5px] font-normal text-gray-500">{rotuloContrato(g.sub)}</span>}
                      </th>
                      {g.valores.map((v, i) => {
                        const c = corDaRampa(v, maxCelula);
                        return (
                          <td key={i} className={`border-b border-line/60 p-0 text-center ${h.meses[i] === mesAtual ? "outline outline-1 -outline-offset-1 outline-brand" : ""}`}>
                            <button onClick={() => setMesSel(h.meses[i])} className="num block w-full px-1.5 py-1.5" style={{ background: c.fundo, color: c.texto }} title={`${g.rotulo} · ${nomeLongoDoMes(h.meses[i])}: ${fmtNum(v)} ${info.unidade}`}>
                              {v > 0 ? fmtNum(v) : "·"}
                            </button>
                          </td>
                        );
                      })}
                      <td className="num border-b border-l border-line px-2 py-1.5 text-right font-semibold text-ink">{fmtNum(g.media)}</td>
                      <td className="num border-b border-line px-2 py-1.5 text-right text-gray-600">{fmtNum(g.pico)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="font-semibold text-ink">
                    <th className="sticky left-0 z-10 bg-gray-50 px-3 py-2 text-left">Total</th>
                    {h.totais.map((v, i) => (
                      <td key={i} className="num bg-gray-50 px-1.5 py-2 text-center">
                        {fmtNum(v)}
                      </td>
                    ))}
                    <td className="num border-l border-line bg-gray-50 px-2 py-2 text-right">{fmtNum(media)}</td>
                    <td className="num bg-gray-50 px-2 py-2 text-right">{fmtNum(pico)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Secao>
        </>
      )}
    </div>
  );
}

/** Lista suspensa com várias escolhas: o botão diz quantas estão marcadas. */
function MultiSelecao({ rotulo, opcoes, valor, onChange }: { rotulo: string; opcoes: { id: string; rotulo: string }[]; valor: string[]; onChange: (v: string[]) => void }) {
  const [busca, setBusca] = useState("");
  const t = busca.trim().toLowerCase();
  const lista = opcoes.filter((o) => !t || o.rotulo.toLowerCase().includes(t));
  return (
    <div className="relative">
      <span className="label">{rotulo}</span>
      <details className="group">
        <summary className="field flex min-w-[150px] cursor-pointer list-none items-center justify-between gap-2">
          <span className="truncate">{valor.length === 0 ? "Todos" : valor.length === 1 ? opcoes.find((o) => o.id === valor[0])?.rotulo ?? valor[0] : `${valor.length} escolhidos`}</span>
          <span className="text-gray-400 group-open:rotate-180">▾</span>
        </summary>
        <div className="absolute left-0 z-40 mt-1 w-72 rounded-xl border border-line bg-white p-2 shadow-pop">
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar…" className="field mb-2" />
          <div className="max-h-60 overflow-y-auto">
            {lista.map((o) => {
              const marcado = valor.includes(o.id);
              return (
                <label key={o.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-[12.5px] hover:bg-gray-50">
                  <input type="checkbox" checked={marcado} onChange={() => onChange(marcado ? valor.filter((x) => x !== o.id) : [...valor, o.id])} className="h-4 w-4 accent-[#0A9E7F]" />
                  <span className="truncate">{o.rotulo}</span>
                </label>
              );
            })}
            {lista.length === 0 && <p className="px-2 py-1 text-[12px] text-gray-400">Nada encontrado.</p>}
          </div>
          {valor.length > 0 && (
            <button onClick={() => onChange([])} className="mt-1 w-full rounded-md px-2 py-1 text-left text-[12px] font-semibold text-brand-dark hover:bg-gray-50">
              Limpar escolha
            </button>
          )}
        </div>
      </details>
    </div>
  );
}
