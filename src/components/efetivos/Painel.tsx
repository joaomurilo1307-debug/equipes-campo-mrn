"use client";

// Painel: os números das equipes de campo, todos contados pela mesma regra (lib/efetivos/situacao) e cada um com o
// caminho até as linhas que o formam (clique no número e abre a Base filtrada).
import Link from "next/link";
import { useMemo, useState } from "react";
import { somarDias, temNome } from "@/lib/efetivos/disponibilidade";
import { ROTULO_ESTADO_EQUIPE, estadoDaEquipe } from "@/lib/efetivos/situacao";
import { useDados } from "./DadosContext";
import { BarraPartes, BarrasHorizontais, ColunasEmpilhadas, Legenda, Rosca, type Coluna, type Serie } from "./graficos";
import { A_DEFINIR, COR_AUSENCIA, corDoContrato, fmtDia, fmtDiaCurto, rotuloContrato, segundaDaSemana, type Equipe } from "./comum";
import { IcBaixo, IcCalendario, IcMais } from "./icones";
import { CabecalhoPagina, PontoContrato, Secao } from "./ui";

const COR = { emEquipe: "#0E8F63", ausente: "#E63329", disponivel: "#2F6FDE", outro: "#9DB7E8", aberta: "#E0A100", semNome: "#9CC9BB" };
const CORES_EMPRESA = ["#0A9E7F", "#2F6FDE", "#B86E00", "#7C5CD6"];
const SEMANAS = 16;

function Indicador({ rotulo, valor, sub, cor, href }: { rotulo: string; valor: number | string; sub?: string; cor?: string; href?: string }) {
  const corpo = (
    <>
      <div className="truncate text-[11px] font-semibold uppercase tracking-wider text-gray-500">{rotulo}</div>
      <div className="num mt-0.5 font-display text-[22px] font-semibold leading-tight" style={{ color: cor ?? "#101B17" }}>
        {valor}
      </div>
      {sub && <div className="truncate text-[11.5px] text-gray-500">{sub}</div>}
    </>
  );
  return href ? (
    <Link href={href} className="block min-w-0 px-4 py-3 transition-colors hover:bg-gray-50" title="Ver as linhas que formam este número">
      {corpo}
    </Link>
  ) : (
    <div className="min-w-0 px-4 py-3">{corpo}</div>
  );
}

export default function Painel() {
  const { dados, hoje, vagasPorEquipe, equipesCampo, equipePorId, vagaPorId, veiculosPorEquipe, nomeDe, situacaoDe, contagemDe, resumoDoDia, contratoNoDia } = useDados();
  const [dataRef, setDataRef] = useState(hoje);
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const r = useMemo(() => resumoDoDia(dataRef), [dados, dataRef]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- por contrato: equipes, posições (com nome / sem nome / abertas), pessoas e viaturas
  const contratos = useMemo(() => {
    const m = new Map<string, Equipe[]>();
    for (const c of dados.contratos.filter((x) => x.ativo)) m.set(c.codigo, []);
    for (const e of equipesCampo) {
      const k = contratoNoDia(e, dataRef) || A_DEFINIR;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(e);
    }
    return [...m.entries()]
      .map(([codigo, equipes]) => {
        const c = contagemDe(equipes.map((e) => e.id), dataRef);
        const gestor = dados.contratos.find((x) => x.codigo === codigo)?.gestor ?? equipes.find((e) => e.gestor)?.gestor ?? null;
        // a mesma viatura em várias equipes do contrato conta uma vez
        const viaturas = new Set(equipes.flatMap((e) => (veiculosPorEquipe.get(e.id) ?? []).map((v) => v.id))).size;
        const porEmpresa = new Map<string, number>();
        for (const e of equipes) for (const v of vagasPorEquipe.get(e.id) ?? []) if (temNome(v)) porEmpresa.set(v.empresa, (porEmpresa.get(v.empresa) ?? 0) + 1);
        return { codigo, equipes, gestor, c, viaturas, porEmpresa };
      })
      .sort((a, b) => (a.codigo === A_DEFINIR ? 1 : b.codigo === A_DEFINIR ? -1 : a.codigo.localeCompare(b.codigo, "pt-BR", { numeric: true })));
  }, [dados, equipesCampo, dataRef, vagasPorEquipe, veiculosPorEquipe]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- pessoas nas próximas semanas
  const semanas = useMemo(() => Array.from({ length: SEMANAS }, (_, k) => somarDias(segundaDaSemana(hoje), k * 7)), [hoje]);
  const colunas: Coluna[] = useMemo(
    () =>
      semanas.map((seg, k) => {
        const q = resumoDoDia(seg);
        return { rotulo: fmtDiaCurto(seg), dica: `Semana de ${fmtDia(seg)}`, destaque: k === 0, valores: [q.emEquipe, q.ausentes, q.disponiveis, q.outroContrato] };
      }),
    [semanas, dados] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const series: Serie[] = [
    { nome: "Em equipe", cor: COR.emEquipe },
    { nome: "Ausentes", cor: COR.ausente },
    { nome: "Disponíveis (sem equipe)", cor: COR.disponivel },
    { nome: "Em outro contrato", cor: COR.outro, listrada: true },
  ];

  // ---- vagas abertas por função e empresa
  const abertasPorFuncao = useMemo(() => {
    const porCargo = new Map<string, Map<string, number>>();
    for (const e of equipesCampo) {
      for (const v of vagasPorEquipe.get(e.id) ?? []) {
        if (situacaoDe(v, dataRef).situacao !== "VAGA_ABERTA") continue;
        if (!porCargo.has(v.cargo)) porCargo.set(v.cargo, new Map());
        porCargo.get(v.cargo)!.set(v.empresa, (porCargo.get(v.cargo)!.get(v.empresa) ?? 0) + 1);
      }
    }
    const empresas = Array.from(new Set([...porCargo.values()].flatMap((m) => [...m.keys()]))).sort();
    const itens = [...porCargo.entries()].map(([cargo, m]) => ({ cargo, partes: empresas.map((e) => m.get(e) ?? 0), total: [...m.values()].reduce((s, n) => s + n, 0) })).sort((a, b) => b.total - a.total);
    return { empresas, itens, total: itens.reduce((s, i) => s + i.total, 0) };
  }, [equipesCampo, vagasPorEquipe, dataRef, dados]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- colaboradores por empresa
  const porEmpresa = useMemo(() => {
    const m = new Map<string, number>();
    for (const v of dados.vagas) if (temNome(v) && v.status !== "Desmobilizado") m.set(v.empresa, (m.get(v.empresa) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [dados.vagas]);

  // ---- listas de baixo
  const vagasParaPreencher = useMemo(
    () => equipesCampo.flatMap((e) => (vagasPorEquipe.get(e.id) ?? []).filter((v) => situacaoDe(v, dataRef).situacao === "VAGA_ABERTA").map((v) => ({ v, e }))).slice(0, 40),
    [equipesCampo, vagasPorEquipe, dataRef, dados] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const ausencias = useMemo(() => {
    const fim = somarDias(hoje, 60);
    return dados.ausencias
      .filter((a) => a.fim >= hoje && a.inicio <= fim)
      .map((a) => ({ a, v: vagaPorId.get(a.vagaId) }))
      .filter((x) => !!x.v)
      .sort((x, y) => x.a.inicio.localeCompare(y.a.inicio));
  }, [dados.ausencias, hoje, vagaPorId]);
  const aMobilizar = useMemo(
    () =>
      dados.vagas
        .filter((v) => temNome(v) && v.status !== "Desmobilizado" && (situacaoDe(v, dataRef).situacao === "DISPONIVEL" || (v.disponivelAPartir && v.disponivelAPartir >= hoje)))
        .sort((a, b) => (a.disponivelAPartir ?? "").localeCompare(b.disponivelAPartir ?? "")),
    [dados, dataRef, hoje] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const alternar = (k: string) =>
    setAbertos((s) => {
      const x = new Set(s);
      if (x.has(k)) x.delete(k);
      else x.add(k);
      return x;
    });
  const totalViaturas = dados.veiculos.length;
  const posicoesSeries: Serie[] = [
    { nome: "Com profissional", cor: COR.emEquipe },
    { nome: "Preenchida sem nome informado", cor: COR.semNome },
    { nome: "Vaga aberta", cor: COR.aberta, listrada: true },
  ];
  const q = (p: string) => `/base?${p}`;

  return (
    <div className="space-y-4">
      <CabecalhoPagina
        titulo="Painel"
        subtitulo={`${r.equipes} equipes em ${r.contratos} contrato${r.contratos === 1 ? "" : "s"}, em ${fmtDia(dataRef)}${dataRef === hoje ? " (hoje)" : ""}. Cada número abre as linhas que o formam.`}
        acoes={
          <>
            <label className="flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-1.5 text-sm text-gray-600">
              <IcCalendario tam={16} />
              <span className="text-xs font-medium">Data</span>
              <input type="date" value={dataRef} onChange={(e) => e.target.value && setDataRef(e.target.value)} className="bg-transparent text-sm font-medium text-ink focus:outline-none" />
            </label>
            {[7, 30, 60].map((n) => (
              <button key={n} onClick={() => setDataRef(somarDias(hoje, n))} className={`btn-ghost btn-sm ${dataRef === somarDias(hoje, n) ? "!border-brand !text-brand-dark" : ""}`}>
                +{n} dias
              </button>
            ))}
            {dataRef !== hoje && (
              <button onClick={() => setDataRef(hoje)} className="btn-ghost btn-sm">
                Hoje
              </button>
            )}
            {dados.podeEditar && (
              <Link href="/equipes/nova" className="btn-primary">
                <IcMais tam={16} /> Nova equipe
              </Link>
            )}
          </>
        }
      />

      {/* resumo: cada número leva às linhas dele */}
      <section className="card overflow-hidden" aria-label="Resumo">
        <div className="grid grid-cols-2 divide-x divide-y divide-line sm:grid-cols-4 xl:grid-cols-8 xl:divide-y-0">
          <Indicador rotulo="Contratos" valor={r.contratos} sub={`${dados.contratos.length} cadastrados`} href="/contratos" />
          <Indicador rotulo="Equipes" valor={r.equipes} sub={`${totalViaturas} viaturas`} href="/equipes" />
          <Indicador rotulo="Posições" valor={r.posicoes} sub={`${r.comNome} com nome · ${r.semNome} sem nome`} href={q("")} />
          <Indicador rotulo="Colaboradores" valor={r.colaboradores} sub="com nome, que não saíram" href="/colaboradores" />
          <Indicador rotulo="Em equipe" valor={r.emEquipe} sub="presentes nas equipes" cor={COR.emEquipe} href={q("situacao=EM_EQUIPE")} />
          <Indicador rotulo="Ausentes" valor={r.ausentes} sub="férias, INSS, em contratação" cor={COR.ausente} href={q("situacao=AUSENTE")} />
          <Indicador rotulo="Disponíveis" valor={r.disponiveis} sub="sem equipe, prontos para uma" cor={COR.disponivel} href={q("situacao=DISPONIVEL")} />
          <Indicador rotulo="Vagas abertas" valor={r.abertas} sub="para contratar ou puxar" cor={COR.aberta} href="/vagas" />
        </div>
        <div className="grid gap-x-8 gap-y-3 border-t border-line px-4 py-3 lg:grid-cols-2">
          <div>
            <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2 text-[12px] text-gray-600">
              <span>
                <strong className="num text-ink">{r.colaboradores}</strong> colaboradores = <strong className="num" style={{ color: COR.emEquipe }}>{r.emEquipe}</strong> em equipe + <strong className="num" style={{ color: COR.ausente }}>{r.ausentes}</strong> ausentes + <strong className="num" style={{ color: COR.disponivel }}>{r.disponiveis}</strong> disponíveis
                {r.outroContrato > 0 && (
                  <>
                    {" "}+ <strong className="num">{r.outroContrato}</strong> em outro contrato
                  </>
                )}
              </span>
              <Link href="/colaboradores" className="font-semibold text-brand-dark hover:underline">
                ver pessoas
              </Link>
            </div>
            <BarraPartes
              alto={10}
              partes={[
                { n: r.emEquipe, cor: COR.emEquipe, rotulo: "em equipe" },
                { n: r.ausentes, cor: COR.ausente, rotulo: "ausentes" },
                { n: r.disponiveis, cor: COR.disponivel, rotulo: "disponíveis" },
                { n: r.outroContrato, cor: COR.outro, rotulo: "em outro contrato", listrada: true },
              ]}
            />
          </div>
          <div>
            <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2 text-[12px] text-gray-600">
              <span>
                <strong className="num text-ink">{r.posicoes}</strong> posições = <strong className="num" style={{ color: COR.emEquipe }}>{r.comNome}</strong> com nome + <strong className="num">{r.semNome}</strong> sem nome informado + <strong className="num" style={{ color: COR.aberta }}>{r.abertas}</strong> vagas abertas
              </span>
              <Link href="/base" className="font-semibold text-brand-dark hover:underline">
                ver a base
              </Link>
            </div>
            <BarraPartes
              alto={10}
              partes={[
                { n: r.comNome, cor: COR.emEquipe, rotulo: "com nome" },
                { n: r.semNome, cor: COR.semNome, rotulo: "sem nome informado" },
                { n: r.abertas, cor: "#F2D48B", rotulo: "vagas abertas", listrada: true },
              ]}
            />
          </div>
        </div>
      </section>

      {/* gráficos */}
      <div className="grid items-stretch gap-4 lg:grid-cols-2 2xl:grid-cols-12">
        <div className="2xl:col-span-4">
          <Secao cheio titulo="Posições por contrato" sub="Com profissional, sem nome informado e vagas abertas.">
            <BarrasHorizontais
              itens={contratos.filter((c) => c.c.posicoes > 0).map((c) => ({ rotulo: rotuloContrato(c.codigo), partes: [c.c.comNome, c.c.semNome, c.c.abertas], sub: `${c.equipes.length} equipe${c.equipes.length === 1 ? "" : "s"}` }))}
              series={posicoesSeries}
            />
            <Legenda className="mt-3" series={posicoesSeries} />
          </Secao>
        </div>
        <div className="2xl:col-span-5">
          <Secao cheio titulo={`Pessoas nas próximas ${SEMANAS} semanas`} sub="Em equipe, ausentes e disponíveis a cada segunda-feira. Equipe que termina libera as pessoas no dia seguinte.">
            <ColunasEmpilhadas colunas={colunas} series={series} altura={300} rotuloEixo="Pessoas por situação a cada semana" />
            <Legenda series={series} className="mt-2" />
          </Secao>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:col-span-2 2xl:col-span-3 2xl:grid-cols-1">
          <Secao titulo="Colaboradores por empresa" sub="Quem trabalha em cada empresa.">
            <div className="flex items-center gap-5">
              <Rosca tamanho={118} partes={porEmpresa.map(([e, n], i) => ({ n, cor: CORES_EMPRESA[i % CORES_EMPRESA.length], rotulo: e }))} centro={{ valor: r.colaboradores, rotulo: "pessoas" }} />
              <ul className="space-y-1.5 text-[12.5px]">
                {porEmpresa.map(([e, n], i) => (
                  <li key={e} className="flex items-center gap-2">
                    <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: CORES_EMPRESA[i % CORES_EMPRESA.length] }} />
                    <span className="text-gray-600">{e}</span>
                    <strong className="num text-ink">{n}</strong>
                  </li>
                ))}
              </ul>
            </div>
          </Secao>
          <Secao titulo="Vagas abertas por função" sub={`${abertasPorFuncao.total} vagas para contratar ou puxar.`} direita={<Link href="/vagas" className="text-xs font-semibold text-brand-dark hover:underline">ver vagas</Link>}>
            {abertasPorFuncao.itens.length === 0 ? (
              <p className="text-sm text-gray-400">Nenhuma vaga aberta.</p>
            ) : (
              <BarrasHorizontais itens={abertasPorFuncao.itens.slice(0, 5).map((i) => ({ rotulo: i.cargo, partes: i.partes }))} series={abertasPorFuncao.empresas.map((e, k) => ({ nome: e, cor: CORES_EMPRESA[k % CORES_EMPRESA.length] }))} />
            )}
          </Secao>
        </div>
      </div>

      {/* contratos e equipes */}
      <Secao
        titulo="Contratos e equipes"
        sub={`Situação de cada equipe em ${fmtDia(dataRef)}. Clique no contrato para abrir as equipes.`}
        semPadding
        direita={
          <div className="flex items-center gap-3 text-xs">
            <button onClick={() => setAbertos(new Set(contratos.map((c) => c.codigo)))} className="font-semibold text-brand-dark hover:underline">
              abrir todos
            </button>
            <button onClick={() => setAbertos(new Set())} className="font-semibold text-gray-500 hover:underline">
              fechar todos
            </button>
            <Link href="/equipes" className="font-semibold text-brand-dark hover:underline">
              ver composição
            </Link>
          </div>
        }
      >
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Contrato / equipe</th>
                <th className="w-[280px]">Posições</th>
                <th className="text-right">Em equipe</th>
                <th className="text-right">Ausentes</th>
                <th className="text-right">Sem nome</th>
                <th className="text-right">Vagas abertas</th>
                <th className="text-right">Viaturas</th>
                <th>Situação</th>
                <th />
              </tr>
            </thead>
            {contratos.map((c) => {
              const aberto = abertos.has(c.codigo);
              return (
                <tbody key={c.codigo}>
                  <tr className="cursor-pointer border-t border-line bg-gray-50/70" onClick={() => alternar(c.codigo)}>
                    <td className="py-2">
                      <span className="inline-flex items-center gap-2">
                        <span className={`text-gray-400 transition-transform ${aberto ? "" : "-rotate-90"}`}>
                          <IcBaixo tam={14} />
                        </span>
                        <PontoContrato cor={c.codigo === A_DEFINIR ? "#9AA8A1" : corDoContrato(c.codigo)} />
                        <span className="font-display text-[14px] font-semibold tracking-tight text-ink">{rotuloContrato(c.codigo)}</span>
                        <span className="text-[11.5px] text-gray-500">
                          {c.equipes.length} equipe{c.equipes.length === 1 ? "" : "s"}
                          {c.gestor ? ` · gestor ${c.gestor}` : ""}
                        </span>
                      </span>
                    </td>
                    <td className="py-2">
                      <BarraPartes
                        alto={8}
                        partes={[
                          { n: c.c.comNome, cor: COR.emEquipe, rotulo: "com nome" },
                          { n: c.c.semNome, cor: COR.semNome, rotulo: "sem nome informado" },
                          { n: c.c.abertas, cor: "#F2D48B", rotulo: "vagas abertas", listrada: true },
                        ]}
                      />
                    </td>
                    <td className="num py-2 text-right text-[13px] font-semibold">{c.c.emEquipe}</td>
                    <td className="num py-2 text-right text-[13px]" style={{ color: c.c.ausentes > 0 ? COR.ausente : undefined }}>
                      {c.c.ausentes}
                    </td>
                    <td className="num py-2 text-right text-[13px] text-gray-600">{c.c.semNome}</td>
                    <td className="num py-2 text-right text-[13px] font-semibold" style={{ color: c.c.abertas > 0 ? "#B86E00" : undefined }}>
                      {c.c.abertas}
                    </td>
                    <td className="num py-2 text-right text-[13px]">{c.viaturas}</td>
                    <td />
                    <td />
                  </tr>
                  {aberto &&
                    c.equipes.map((e) => {
                      const cm = contagemDe([e.id], dataRef);
                      const est = ROTULO_ESTADO_EQUIPE[estadoDaEquipe(e, cm, dataRef)];
                      return (
                        <tr key={e.id} className="border-t border-gray-100">
                          <td className="py-1.5 pl-9">
                            <div className="text-[13px] font-medium text-ink">{e.nome}</div>
                            <div className="font-mono text-[10.5px] text-gray-400">
                              {e.codigo}
                              {e.inicio ? ` · ${fmtDiaCurto(e.inicio)}–${e.fim ? fmtDiaCurto(e.fim) : "…"}` : ""}
                            </div>
                          </td>
                          <td className="py-1.5">
                            <BarraPartes
                              alto={7}
                              partes={[
                                { n: cm.comNome, cor: COR.emEquipe, rotulo: "com nome" },
                                { n: cm.semNome, cor: COR.semNome, rotulo: "sem nome informado" },
                                { n: cm.abertas, cor: "#F2D48B", rotulo: "vagas abertas", listrada: true },
                              ]}
                            />
                          </td>
                          <td className="num py-1.5 text-right text-[12.5px]">{cm.emEquipe}</td>
                          <td className="num py-1.5 text-right text-[12.5px]" style={{ color: cm.ausentes > 0 ? COR.ausente : undefined }}>
                            {cm.ausentes}
                          </td>
                          <td className="num py-1.5 text-right text-[12.5px] text-gray-500">{cm.semNome}</td>
                          <td className="num py-1.5 text-right text-[12.5px]" style={{ color: cm.abertas > 0 ? "#B86E00" : undefined }}>
                            {cm.abertas}
                          </td>
                          <td className="num py-1.5 text-right text-[12.5px]">{(veiculosPorEquipe.get(e.id) ?? []).length}</td>
                          <td className="py-1.5">
                            <span className={est.chip} title={est.dica}>
                              {est.rotulo}
                            </span>
                          </td>
                          <td className="py-1.5 text-right">
                            <Link href={`/equipes?equipe=${e.id}`} className="text-xs font-semibold text-brand-dark hover:underline">
                              abrir
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  {aberto && c.equipes.length === 0 && (
                    <tr className="border-t border-gray-100">
                      <td colSpan={9} className="py-2 pl-9 text-xs text-gray-400">
                        Nenhuma equipe neste contrato ainda.{" "}
                        {dados.podeEditar && (
                          <Link href={`/equipes/nova?contrato=${encodeURIComponent(c.codigo)}`} className="font-semibold text-brand-dark hover:underline">
                            criar a primeira
                          </Link>
                        )}
                      </td>
                    </tr>
                  )}
                </tbody>
              );
            })}
          </table>
        </div>
      </Secao>

      {/* o que pede ação */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Secao titulo="Vagas para preencher" sub={`${r.abertas} aberta${r.abertas === 1 ? "" : "s"} em ${fmtDia(dataRef)}.`} semPadding direita={<Link href="/vagas" className="text-xs font-semibold text-brand-dark hover:underline">ver todas</Link>}>
          {vagasParaPreencher.length === 0 ? (
            <p className="px-4 py-6 text-sm text-gray-400">Nenhuma vaga aberta.</p>
          ) : (
            <ul className="divide-y divide-line">
              {vagasParaPreencher.slice(0, 7).map(({ v, e }) => (
                <li key={v.id}>
                  <Link href={`/equipes?equipe=${e.id}`} className="flex items-center justify-between gap-3 px-4 py-2 hover:bg-gray-50">
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-medium text-ink">{v.cargo}</span>
                      <span className="block truncate text-[11px] text-gray-500">
                        {e.nome} · {v.empresa}
                      </span>
                    </span>
                    <span className={v.status === "Em contratação" ? "chip-info" : "chip-warn"}>{v.status === "Em contratação" ? "contratação" : "aberta"}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Secao>

        <Secao titulo="Férias e ausências" sub="Nos próximos 60 dias." semPadding direita={<Link href="/ferias" className="text-xs font-semibold text-brand-dark hover:underline">ver tudo</Link>}>
          {ausencias.length === 0 ? (
            <p className="px-4 py-6 text-sm text-gray-400">Nenhuma ausência lançada para os próximos 60 dias.</p>
          ) : (
            <ul className="divide-y divide-line">
              {ausencias.slice(0, 7).map(({ a, v }) => (
                <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-2">
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-medium text-ink">{nomeDe(v!)}</span>
                    <span className="block truncate text-[11px] text-gray-500">{equipePorId.get(v!.equipeId)?.nome}</span>
                  </span>
                  <span className="shrink-0 text-right text-[11.5px]">
                    <span className="inline-flex items-center gap-1.5 font-semibold" style={{ color: COR_AUSENCIA[a.tipo] ?? "#6F7E77" }}>
                      <span className="inline-block h-2 w-2 rounded-sm" style={{ background: COR_AUSENCIA[a.tipo] ?? "#6F7E77" }} />
                      {a.tipo}
                    </span>
                    <span className="num block text-gray-500">
                      {fmtDiaCurto(a.inicio)}–{fmtDiaCurto(a.fim)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Secao>

        <Secao titulo="Disponíveis e a mobilizar" sub="Quem está sem equipe, ou vem de outro contrato." semPadding direita={<Link href="/colaboradores" className="text-xs font-semibold text-brand-dark hover:underline">colaboradores</Link>}>
          {aMobilizar.length === 0 ? (
            <p className="px-4 py-6 text-sm text-gray-400">Ninguém disponível agora.</p>
          ) : (
            <ul className="divide-y divide-line">
              {aMobilizar.slice(0, 7).map((v) => (
                <li key={v.id} className="flex items-center justify-between gap-3 px-4 py-2">
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-medium text-ink">{nomeDe(v)}</span>
                    <span className="block truncate text-[11px] text-gray-500">
                      {v.cargo}
                      {v.destino ? ` · vai para ${v.destino.toLowerCase()}` : ""}
                    </span>
                  </span>
                  <span className="num shrink-0 text-[11.5px] text-gray-500">{v.disponivelAPartir && v.disponivelAPartir > dataRef ? `livre ${fmtDiaCurto(v.disponivelAPartir)}` : "livre agora"}</span>
                </li>
              ))}
            </ul>
          )}
        </Secao>
      </div>
    </div>
  );
}
