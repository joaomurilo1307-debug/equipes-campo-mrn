"use client";

// Histograma de VIATURAS: quantas estão em uso por equipe, contrato ou cliente, mês a mês, e quantas estão LIVRES, em manutenção
// ou previstas (ainda não chegaram). Cada mês é a média dos dias; a mesma viatura usada por duas equipes aparece nas duas, mas
// conta uma vez só no total. O status (manutenção, parada) é o de hoje: o sistema não guarda o histórico dele.
import Link from "next/link";
import { useMemo, useState } from "react";
import { AGRUPAMENTOS, SEM_FILTROS, agrupamentosDaMedida, agruparTopo, calcularHistograma, type Agrupar, type Filtros } from "@/lib/efetivos/histograma";
import { calcularFrotaPorMes, chegadaDaPrevista, situacaoDaViaturaNoDia, viaturasEmUsoNoDia } from "@/lib/efetivos/frota";
import { janelaPadrao, mesDe, somarMeses } from "@/lib/efetivos/linhaDoTempo";
import { useDados } from "./DadosContext";
import { rotuloContrato } from "./comum";
import { ColunasEmpilhadas, Legenda, type Serie } from "./graficos";
import { MultiSelecao, OUTROS, SERIES, TOPO, corDaRampa, fmtNum, nomeLongoDoMes, nomeLongoMaiusculo, rotuloMes, type Janelas } from "./histogramaComum";
import { CabecalhoPagina, Secao, Vazio } from "./ui";

const AGRUPAR_VIATURA = agrupamentosDaMedida("viaturas");
const media = (v: number[]) => (v.length ? Math.round((v.reduce((s, x) => s + x, 0) / v.length) * 10) / 10 : 0);

export default function HistogramaViaturas() {
  const { dados, hoje, idx, equipesCampo, veiculoPorId } = useDados();
  const [agrupar, setAgrupar] = useState<Agrupar>("equipe");
  const [filtros, setFiltros] = useState<Filtros>(SEM_FILTROS);
  const [preset, setPreset] = useState<Janelas>("auto");
  const [custom, setCustom] = useState({ de: mesDe(hoje), ate: somarMeses(mesDe(hoje), 11) });
  const [mesSel, setMesSel] = useState<string | null>(null);
  const [baixando, setBaixando] = useState(false);

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

  // em uso, por grupo (respeita os filtros) e a frota inteira (em uso, livres, indisponíveis, previstas)
  const h = useMemo(
    () => calcularHistograma({ equipes: dados.equipes, vagas: dados.vagas as any, idx, contratos: dados.contratos, usos: dados.usosVeiculo ?? [] }, { medida: "viaturas", agrupar, de, ate, filtros }),
    [dados, idx, agrupar, de, ate, filtros]
  );
  const fr = useMemo(() => calcularFrotaPorMes({ equipes: dados.equipes, vagas: dados.vagas, usos: dados.usosVeiculo ?? [], veiculos: dados.veiculos }, de, ate), [dados, de, ate]);
  const topo = useMemo(() => agruparTopo(h, TOPO), [h]);
  const corDoGrupo = (chave: string) => {
    const i = h.grupos.findIndex((g) => g.chave === chave);
    return i >= 0 && i < TOPO ? SERIES[i] : OUTROS;
  };

  const mesAtual = mesSel && h.meses.includes(mesSel) ? mesSel : h.meses.includes(mesDe(hoje)) ? mesDe(hoje) : h.meses[0];
  const iMes = h.meses.indexOf(mesAtual);
  const pico = Math.max(0, ...h.totais);
  const iPico = h.totais.indexOf(pico);
  const mediaEmUso = media(h.totais);
  const maxCelula = Math.max(0, ...h.grupos.flatMap((g) => g.valores));
  const rotuloGrupo = AGRUPAMENTOS.find((a) => a.id === agrupar)!.rotulo;

  const series: Serie[] = topo.map((g, i) => ({ nome: g.rotulo, cor: g.chave === "__outros" ? OUTROS : SERIES[i] }));
  const colunas = h.meses.map((m, i) => ({ rotulo: rotuloMes(m), dica: nomeLongoDoMes(m), valores: topo.map((g) => g.valores[i]), destaque: m === mesDe(hoje) }));
  const frotaSeries: Serie[] = [
    { nome: "Em uso", cor: SERIES[0] },
    { nome: "Livres", cor: SERIES[2] },
    { nome: "Em manutenção ou paradas", cor: SERIES[1] },
    { nome: "Previstas (a chegar)", cor: OUTROS },
  ];
  const frotaColunas = fr.meses.map((m, i) => ({ rotulo: rotuloMes(m), dica: nomeLongoDoMes(m), valores: [fr.emUso[i], fr.livres[i], fr.indisponiveis[i], fr.previstas[i]], destaque: m === mesDe(hoje) }));

  // quais estão livres no meio do mês escolhido (dia 15), para a pessoa ver quais são
  const livresNoMes = useMemo(() => {
    if (!mesAtual) return [];
    const dia = `${mesAtual}-15`;
    const usadas = viaturasEmUsoNoDia({ equipes: dados.equipes, vagas: dados.vagas, usos: dados.usosVeiculo ?? [] }, dia);
    return dados.veiculos
      .filter((v) => situacaoDaViaturaNoDia(v, usadas.has(v.id), v.status === "Prevista" ? chegadaDaPrevista(v, dados.veiculos) : null, dia) === "livre")
      .sort((a, b) => a.identificacao.localeCompare(b.identificacao, "pt-BR", { numeric: true }));
  }, [dados, mesAtual]);

  const opContratos = useMemo(() => [...new Set(equipesCampo.map((e) => e.projeto))].sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true })).map((c) => ({ id: c, rotulo: rotuloContrato(c) })), [equipesCampo]);
  const opEquipes = useMemo(() => equipesCampo.map((e) => ({ id: e.id, rotulo: `${e.codigo} · ${e.nome}` })), [equipesCampo]);
  const nFiltros = filtros.contratos.length + filtros.equipes.length + (filtros.semDatas ? 0 : 1);

  function soEsta(chave: string) {
    if (chave === "__outros") return;
    if (agrupar === "equipe") setFiltros((f) => ({ ...f, equipes: [chave] }));
    else if (agrupar === "contrato") setFiltros((f) => ({ ...f, contratos: [chave] }));
  }
  const podeFiltrarLinha = agrupar !== "cliente";

  async function baixarExcel() {
    setBaixando(true);
    try {
      const XLSX = await import("xlsx");
      const cab = [rotuloGrupo, ...h.meses.map(rotuloMes), "Média", "Pico"];
      const linhas: (string | number)[][] = h.grupos.map((g) => [g.rotulo, ...g.valores, g.media, g.pico]);
      linhas.push(["Total em uso (cada viatura conta uma vez)", ...h.totais, mediaEmUso, pico]);
      linhas.push(["Viaturas livres", ...fr.livres, media(fr.livres), Math.max(0, ...fr.livres)]);
      linhas.push(["Em manutenção ou paradas", ...fr.indisponiveis, media(fr.indisponiveis), Math.max(0, ...fr.indisponiveis)]);
      linhas.push(["Previstas (a chegar)", ...fr.previstas, media(fr.previstas), Math.max(0, ...fr.previstas)]);
      linhas.push(["Frota (soma)", ...fr.frota, media(fr.frota), Math.max(0, ...fr.frota)]);
      const ws = XLSX.utils.aoa_to_sheet([cab, ...linhas]);
      ws["!cols"] = [{ wch: 42 }, ...h.meses.map(() => ({ wch: 9 })), { wch: 9 }, { wch: 9 }];
      const filt = XLSX.utils.aoa_to_sheet([
        ["Histograma", "Viaturas"],
        ["Agrupado por", rotuloGrupo],
        ["Período", `${nomeLongoDoMes(de)} a ${nomeLongoDoMes(ate)}`],
        ["Contratos", filtros.contratos.join(", ") || "todos"],
        ["Equipes", filtros.equipes.map((id) => opEquipes.find((o) => o.id === id)?.rotulo ?? id).join(", ") || "todas"],
        ["Equipes sem datas", filtros.semDatas ? "entram como ativas o tempo todo" : "ficam de fora"],
        ["Cada mês", "média dos dias do mês"],
        ["Livres", "viaturas operacionais que nenhuma equipe ativa está usando (não dependem dos filtros)"],
        ["Status", "manutenção/parada e viaturas previstas seguem o status de hoje"],
      ]);
      filt["!cols"] = [{ wch: 20 }, { wch: 90 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Viaturas");
      XLSX.utils.book_append_sheet(wb, filt, "Filtros");
      XLSX.writeFile(wb, `histograma_viaturas_${de}_${ate}.xlsx`);
    } finally {
      setBaixando(false);
    }
  }

  const semDados = dados.veiculos.length === 0;

  return (
    <div>
      <CabecalhoPagina
        titulo="Histograma de viaturas"
        subtitulo="Quantas viaturas cada equipe, contrato ou cliente usa, mês a mês, e quantas estão livres, em manutenção ou ainda por chegar. Cada mês é a média dos dias."
        acoes={
          <button onClick={baixarExcel} disabled={baixando || semDados} className="btn-ghost">
            {baixando ? "Gerando…" : "Baixar Excel"}
          </button>
        }
      />

      <div className="card mb-4 p-3.5">
        <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
          <label>
            <span className="label">Agrupar por</span>
            <select value={agrupar} onChange={(e) => setAgrupar(e.target.value as Agrupar)} className="field">
              {AGRUPAMENTOS.filter((a) => AGRUPAR_VIATURA.includes(a.id)).map((a) => (
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
          <b className="text-gray-700">Em uso:</b> viaturas servindo a equipes ativas, conforme o período de cada uma na equipe. <b className="text-gray-700">Livres:</b> viaturas em operação que nenhuma equipe ativa está usando (não dependem dos filtros). A mesma viatura em duas equipes conta uma vez só no total.
        </p>
      </div>

      {h.equipesSemDatas > 0 && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-warn/25 bg-warn-soft px-4 py-2.5 text-[13px] text-warn">
          <span>
            <b>{h.equipesSemDatas}</b> equipe(s) sem data de início e fim estão contadas como ativas em todos os meses; por isso quase nenhuma viatura aparece livre. Defina os períodos das equipes e das viaturas para refletir o tempo real.
          </span>
          <Link href="/linha-do-tempo" className="font-semibold underline">
            Ver na linha do tempo
          </Link>
        </div>
      )}

      {semDados || h.meses.length === 0 ? (
        <div className="card">
          <Vazio titulo="Nenhuma viatura cadastrada" texto="Cadastre as viaturas em Viaturas ou na base em Excel." />
        </div>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              ["Pico em uso", fmtNum(pico), `viaturas em ${h.meses[iPico] ? nomeLongoDoMes(h.meses[iPico]) : "—"}`],
              ["Média em uso por mês", fmtNum(mediaEmUso), "viaturas"],
              [`Livres em ${nomeLongoDoMes(mesAtual)}`, fmtNum(fr.livres[iMes] ?? 0), `de ${fmtNum(fr.frota[iMes] ?? 0)} na frota`],
              [`Em manutenção em ${nomeLongoDoMes(mesAtual)}`, fmtNum(fr.indisponiveis[iMes] ?? 0), `${fmtNum(fr.previstas[iMes] ?? 0)} previstas a chegar`],
            ].map(([r, v, s]) => (
              <div key={r} className="card px-4 py-3">
                <div className="text-[10.5px] font-semibold uppercase tracking-wider text-gray-500">{r}</div>
                <div className="num mt-1 font-display text-[26px] font-semibold leading-none text-ink">{v}</div>
                <div className="mt-1 text-[11px] text-gray-500">{s}</div>
              </div>
            ))}
          </div>

          <div className="mb-4">
            <Secao titulo="Como fica a frota" sub="Em uso, livres, em manutenção ou paradas e previstas, mês a mês (cada viatura conta uma vez)">
              <Legenda series={frotaSeries} className="mb-2" />
              <ColunasEmpilhadas colunas={frotaColunas} series={frotaSeries} altura={220} aoClicar={(i) => setMesSel(fr.meses[i])} rotuloEixo="Frota por mês" />
            </Secao>
          </div>

          <div className="mb-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
            <Secao titulo={`Viaturas em uso, por ${rotuloGrupo.toLowerCase()}`} sub="Cada equipe mostra as suas; uma viatura usada por duas equipes aparece nas duas (o total da tabela conta uma vez). Clique numa coluna para ver o mês">
              {h.grupos.length === 0 ? (
                <Vazio titulo="Nenhuma viatura em uso neste filtro" texto="Ajuste o período ou limpe os filtros." />
              ) : (
                <>
                  <Legenda series={series} className="mb-2" />
                  <ColunasEmpilhadas colunas={colunas} series={series} altura={260} aoClicar={(i) => setMesSel(h.meses[i])} rotuloEixo="Viaturas em uso por mês" />
                </>
              )}
            </Secao>

            <Secao titulo={nomeLongoMaiusculo(mesAtual)} sub="Quais estão livres no meio do mês">
              <div className="mb-2 flex items-baseline justify-between text-[12.5px]">
                <span className="font-semibold text-ink">Em uso</span>
                <span className="num font-semibold text-ink">{fmtNum(h.totais[iMes] ?? 0)}</span>
              </div>
              <div className="mb-2 flex items-baseline justify-between border-b border-line pb-2 text-[12.5px]">
                <span className="font-semibold text-brand-dark">Livres</span>
                <span className="num font-semibold text-brand-dark">{fmtNum(fr.livres[iMes] ?? 0)}</span>
              </div>
              {livresNoMes.length === 0 ? (
                <p className="text-[12px] text-gray-500">Nenhuma viatura livre neste mês.</p>
              ) : (
                <ul className="space-y-1 text-[12.5px]">
                  {livresNoMes.slice(0, 14).map((v) => (
                    <li key={v.id} className="flex items-center justify-between gap-2">
                      <span className="font-medium text-ink">{v.identificacao}</span>
                      <span className="truncate text-[11px] text-gray-500">{[v.placa, v.modelo].filter(Boolean).join(" · ") || v.status}</span>
                    </li>
                  ))}
                </ul>
              )}
              {livresNoMes.length > 14 && <p className="mt-2 text-[11.5px] text-gray-500">+ {livresNoMes.length - 14} na tela Viaturas</p>}
              <Link href="/frota" className="mt-3 inline-block text-[12px] font-semibold text-brand-dark hover:underline">
                Ver a frota
              </Link>
            </Secao>
          </div>

          <Secao titulo={`Tabela ${rotuloGrupo.toLowerCase()} × mês`} sub={`Viaturas em uso. Quanto mais escuro, maior o valor.${podeFiltrarLinha ? " Clique no nome para ver só esta linha." : ""}`} semPadding>
            <div className="overflow-x-auto">
              <table className="w-full min-w-max border-separate border-spacing-0 text-[12px]">
                <thead>
                  <tr className="text-[10.5px] font-semibold uppercase tracking-wide text-gray-500">
                    <th className="sticky left-0 z-10 min-w-[250px] border-b border-line bg-gray-50 px-3 py-2 text-left">{rotuloGrupo}</th>
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
                        {g.sub && agrupar === "equipe" && <span className="ml-[18px] block text-[10.5px] font-normal text-gray-500">{rotuloContrato(g.sub)}</span>}
                      </th>
                      {g.valores.map((v, i) => {
                        const c = corDaRampa(v, maxCelula);
                        return (
                          <td key={i} className={`border-b border-line/60 p-0 text-center ${h.meses[i] === mesAtual ? "outline outline-1 -outline-offset-1 outline-brand" : ""}`}>
                            <button onClick={() => setMesSel(h.meses[i])} className="num block w-full px-1.5 py-1.5" style={{ background: c.fundo, color: c.texto }} title={`${g.rotulo} · ${nomeLongoDoMes(h.meses[i])}: ${fmtNum(v)} viaturas`}>
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
                    <th className="sticky left-0 z-10 bg-gray-50 px-3 py-2 text-left" title="Cada viatura conta uma vez, mesmo usada por duas equipes">
                      Total em uso
                      <span className="block text-[10.5px] font-normal text-gray-500">cada viatura conta uma vez</span>
                    </th>
                    {h.totais.map((v, i) => (
                      <td key={i} className="num bg-gray-50 px-1.5 py-2 text-center">
                        {fmtNum(v)}
                      </td>
                    ))}
                    <td className="num border-l border-line bg-gray-50 px-2 py-2 text-right">{fmtNum(mediaEmUso)}</td>
                    <td className="num bg-gray-50 px-2 py-2 text-right">{fmtNum(pico)}</td>
                  </tr>
                  {([
                    ["Viaturas livres", "operacionais, sem equipe ativa", fr.livres, "bg-brand-soft text-brand-dark", true],
                    ["Em manutenção ou paradas", "status de hoje", fr.indisponiveis, "bg-warn-soft text-warn", false],
                    ["Previstas (a chegar)", "viaturas Previstas", fr.previstas, "bg-gray-100 text-gray-600", false],
                    ["Frota", "em uso + livres + manutenção + previstas", fr.frota, "bg-gray-50 text-ink", false],
                  ] as [string, string, number[], string, boolean][]).map(([rotulo, sub, valores, cor]) => (
                    <tr key={rotulo} className={`font-semibold ${cor}`}>
                      <th className={`sticky left-0 z-10 border-t border-line px-3 py-2 text-left ${cor.split(" ")[0]}`}>
                        {rotulo}
                        <span className="block text-[10.5px] font-normal text-gray-500">{sub}</span>
                      </th>
                      {valores.map((v, i) => (
                        <td key={i} className={`num border-t border-line px-1.5 py-2 text-center ${h.meses[i] === mesAtual ? "outline outline-1 -outline-offset-1 outline-brand" : ""}`}>
                          {fmtNum(v)}
                        </td>
                      ))}
                      <td className="num border-l border-t border-line px-2 py-2 text-right">{fmtNum(media(valores))}</td>
                      <td className="num border-t border-line px-2 py-2 text-right">{fmtNum(Math.max(0, ...valores))}</td>
                    </tr>
                  ))}
                </tfoot>
              </table>
            </div>
          </Secao>
          <p className="mt-2 text-[11.5px] text-gray-500">
            {veiculoPorId.size} viatura(s) cadastrada(s). A frota não conta as devolvidas. O status (manutenção, parada) vale para todos os meses porque o sistema guarda só o de hoje.
          </p>
        </>
      )}
    </div>
  );
}
