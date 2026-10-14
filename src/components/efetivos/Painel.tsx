"use client";

// Painel: visão geral por contrato — posições, pessoas, vagas abertas, disponibilidade nas próximas semanas, ausências e frota.
import Link from "next/link";
import { useMemo, useState } from "react";
import { STATUS_CAMPANHA_QUE_LIBERAM, estadoDaVaga, montarPainel, somarDias, temNome } from "@/lib/efetivos/disponibilidade";
import { useDados } from "./DadosContext";
import { BarraPartes, BarrasHorizontais, ColunasEmpilhadas, Legenda, Rosca, type Coluna, type Serie } from "./graficos";
import { A_DEFINIR, COR_AUSENCIA, CHIP_STATUS_CAMPANHA, corDoContrato, ehReserva, fmtDia, fmtDiaCurto, nomeDaEquipeDaCampanha, rotuloContrato, segundaDaSemana } from "./comum";
import { IcBaixo, IcCalendario, IcMais } from "./icones";
import { CabecalhoPagina, PontoContrato, Secao } from "./ui";

const COR = { livre: "#0E8F63", alocada: "#1D6FB8", ausente: "#E63329", aberta: "#E0A100", reserva: "#7CCDB4", semNome: "#9CC9BB" };
const CORES_EMPRESA = ["#0A9E7F", "#2F6FDE", "#B86E00", "#7C5CD6"];
const SEMANAS = 16;

function Indicador({ rotulo, valor, sub, cor }: { rotulo: string; valor: number | string; sub?: string; cor?: string }) {
  return (
    <div className="min-w-0 px-4 py-3">
      <div className="truncate text-[11px] font-semibold uppercase tracking-wider text-gray-500">{rotulo}</div>
      <div className="num mt-0.5 font-display text-[22px] font-semibold leading-tight" style={{ color: cor ?? "#101B17" }}>
        {valor}
      </div>
      {sub && <div className="truncate text-[11.5px] text-gray-500">{sub}</div>}
    </div>
  );
}

export default function Painel() {
  const { dados, regra, idx, hoje, vagasPorEquipe, equipesCampo, equipePorId, vagaPorId, veiculosPorEquipe, nomeDe } = useDados();
  const [dataRef, setDataRef] = useState(hoje);
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const painel = useMemo(() => montarPainel(regra, dataRef), [regra, dataRef]);
  const t = painel.totais.pessoas;

  // ---- por contrato: equipes, posições (com nome / sem nome / abertas) e viaturas
  const contratos = useMemo(() => {
    const m = new Map<string, { codigo: string; gestor: string | null; equipes: typeof equipesCampo }>();
    for (const c of dados.contratos.filter((x) => x.ativo)) m.set(c.codigo, { codigo: c.codigo, gestor: c.gestor, equipes: [] });
    for (const e of equipesCampo) {
      const k = e.projeto && e.projeto !== A_DEFINIR ? e.projeto : A_DEFINIR;
      if (!m.has(k)) m.set(k, { codigo: k, gestor: null, equipes: [] });
      m.get(k)!.equipes.push(e);
    }
    return [...m.values()]
      .map((c) => {
        let comNome = 0;
        let semNome = 0;
        let abertas = 0;
        let viaturas = 0;
        const porEmpresa = new Map<string, number>();
        for (const e of c.equipes) {
          for (const v of vagasPorEquipe.get(e.id) ?? []) {
            if (temNome(v)) {
              comNome++;
              porEmpresa.set(v.empresa, (porEmpresa.get(v.empresa) ?? 0) + 1);
            } else if (v.semNome) semNome++;
            else abertas++;
          }
          viaturas += (veiculosPorEquipe.get(e.id) ?? []).length;
        }
        return { ...c, comNome, semNome, abertas, viaturas, posicoes: comNome + semNome + abertas, porEmpresa };
      })
      .sort((a, b) => (a.codigo === A_DEFINIR ? 1 : b.codigo === A_DEFINIR ? -1 : a.codigo.localeCompare(b.codigo, "pt-BR", { numeric: true })));
  }, [dados.contratos, equipesCampo, vagasPorEquipe, veiculosPorEquipe]);

  // ---- composição de cada equipe na data de referência
  const composicao = useMemo(() => {
    const m = new Map<string, { livres: number; alocadas: number; ausentes: number; abertas: number; semNome: number; total: number }>();
    for (const e of equipesCampo) {
      const c = { livres: 0, alocadas: 0, ausentes: 0, abertas: 0, semNome: 0, total: 0 };
      for (const v of vagasPorEquipe.get(e.id) ?? []) {
        const s = estadoDaVaga(v, idx, dataRef).situacao;
        c.total++;
        if (s === "LIVRE") c.livres++;
        else if (s === "ALOCADA") c.alocadas++;
        else if (s === "AUSENTE") c.ausentes++;
        else if (s === "SEM_NOME") c.semNome++;
        else c.abertas++;
      }
      m.set(e.id, c);
    }
    return m;
  }, [equipesCampo, vagasPorEquipe, idx, dataRef]);

  // ---- disponibilidade nas próximas semanas
  const semanas = useMemo(() => Array.from({ length: SEMANAS }, (_, k) => somarDias(segundaDaSemana(hoje), k * 7)), [hoje]);
  const colunas: Coluna[] = useMemo(
    () =>
      semanas.map((seg, k) => {
        const p = montarPainel(regra, seg);
        const q = p.totais.pessoas;
        return { rotulo: fmtDiaCurto(seg), dica: `Semana de ${fmtDia(seg)}`, destaque: k === 0, valores: [q.livres, q.alocadas, q.ausentes, p.reserva.livres] };
      }),
    [semanas, regra]
  );
  const series: Serie[] = [
    { nome: "Livres", cor: COR.livre },
    { nome: "Em campanha", cor: COR.alocada },
    { nome: "Ausentes", cor: COR.ausente },
    { nome: "Disponíveis sem equipe", cor: COR.reserva, listrada: true },
  ];

  // ---- vagas abertas por função e empresa
  const abertasPorFuncao = useMemo(() => {
    const porCargo = new Map<string, Map<string, number>>();
    for (const e of equipesCampo) {
      if (e.status === "Inativa") continue;
      for (const v of vagasPorEquipe.get(e.id) ?? []) {
        if (temNome(v) || v.semNome) continue;
        if (!porCargo.has(v.cargo)) porCargo.set(v.cargo, new Map());
        porCargo.get(v.cargo)!.set(v.empresa, (porCargo.get(v.cargo)!.get(v.empresa) ?? 0) + 1);
      }
    }
    const empresas = Array.from(new Set([...porCargo.values()].flatMap((m) => [...m.keys()]))).sort();
    const itens = [...porCargo.entries()].map(([cargo, m]) => ({ cargo, partes: empresas.map((e) => m.get(e) ?? 0), total: [...m.values()].reduce((s, n) => s + n, 0) })).sort((a, b) => b.total - a.total);
    return { empresas, itens, total: itens.reduce((s, i) => s + i.total, 0) };
  }, [equipesCampo, vagasPorEquipe]);

  // ---- colaboradores por empresa (quem tem nome e não saiu)
  const porEmpresa = useMemo(() => {
    const m = new Map<string, number>();
    for (const v of dados.vagas) if (temNome(v) && v.status !== "Desmobilizado") m.set(v.empresa, (m.get(v.empresa) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [dados.vagas]);
  const totalColaboradores = porEmpresa.reduce((s, [, n]) => s + n, 0);
  const disponiveisSemEquipe = dados.vagas.filter((v) => temNome(v) && v.status !== "Desmobilizado" && ehReserva(equipePorId.get(v.equipeId) ?? { grupo: "" })).length;

  // ---- ausências nas próximas semanas (tipos)
  const ausencias = useMemo(() => {
    const fim = somarDias(hoje, 60);
    return dados.ausencias
      .filter((a) => a.fim >= hoje && a.inicio <= fim)
      .map((a) => ({ a, v: vagaPorId.get(a.vagaId) }))
      .filter((x) => !!x.v)
      .sort((x, y) => x.a.inicio.localeCompare(y.a.inicio));
  }, [dados.ausencias, hoje, vagaPorId]);

  const campanhas = useMemo(
    () => dados.campanhas.filter((c) => !STATUS_CAMPANHA_QUE_LIBERAM.includes(c.status) && c.fim >= hoje).sort((a, b) => a.inicio.localeCompare(b.inicio)),
    [dados.campanhas, hoje]
  );
  const aMobilizar = useMemo(() => dados.vagas.filter((v) => temNome(v) && v.disponivelAPartir && v.disponivelAPartir >= hoje).sort((a, b) => (a.disponivelAPartir ?? "").localeCompare(b.disponivelAPartir ?? "")), [dados.vagas, hoje]);

  const totalViaturas = dados.veiculos.length;
  const contratosComEquipe = contratos.filter((c) => c.equipes.length > 0 && c.codigo !== A_DEFINIR).length;
  const pct = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 100)}%` : "0%");
  const alternar = (k: string) =>
    setAbertos((s) => {
      const x = new Set(s);
      if (x.has(k)) x.delete(k);
      else x.add(k);
      return x;
    });

  const posicoesSeries: Serie[] = [
    { nome: "Com profissional", cor: COR.livre },
    { nome: "Preenchida sem nome informado", cor: COR.semNome },
    { nome: "Vaga aberta", cor: COR.aberta, listrada: true },
  ];

  return (
    <div className="space-y-4">
      <CabecalhoPagina
        titulo="Painel"
        subtitulo={`${painel.totais.equipes} equipes em ${contratosComEquipe} contrato${contratosComEquipe === 1 ? "" : "s"}, em ${fmtDia(dataRef)}${dataRef === hoje ? " (hoje)" : ""}.`}
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

      {/* resumo */}
      <section className="card overflow-hidden" aria-label="Resumo">
        <div className="grid grid-cols-2 divide-x divide-y divide-line sm:grid-cols-4 xl:grid-cols-8 xl:divide-y-0">
          <Indicador rotulo="Contratos" valor={contratosComEquipe} sub={`${dados.contratos.length} cadastrados`} />
          <Indicador rotulo="Equipes" valor={painel.totais.equipes} sub={`${totalViaturas} viaturas`} />
          <Indicador rotulo="Colaboradores" valor={totalColaboradores} sub={`${disponiveisSemEquipe} sem equipe`} />
          <Indicador rotulo="Posições" valor={t.vagas} sub={`${t.preenchidas} com nome · ${t.semNome} sem nome`} />
          <Indicador rotulo="Livres" valor={t.livres} sub={`${pct(t.livres, t.preenchidas)} dos com nome`} cor={COR.livre} />
          <Indicador rotulo="Em campanha" valor={t.alocadas} sub={`${campanhas.length} campanha${campanhas.length === 1 ? "" : "s"} em aberto`} cor={COR.alocada} />
          <Indicador rotulo="Ausentes" valor={t.ausentes} sub="férias, atestado, afastamento" cor={COR.ausente} />
          <Indicador rotulo="Vagas abertas" valor={t.abertas} sub="para contratar ou puxar" cor={COR.aberta} />
        </div>
        <div className="border-t border-line px-4 py-2.5">
          <BarraPartes
            alto={10}
            partes={[
              { n: t.preenchidas, cor: COR.livre, rotulo: "com profissional" },
              { n: t.semNome, cor: COR.semNome, rotulo: "preenchidas sem nome informado" },
              { n: t.abertas, cor: "#F2D48B", rotulo: "vagas abertas", listrada: true },
            ]}
          />
          <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
            <Legenda series={[{ nome: `${t.preenchidas} com profissional`, cor: COR.livre }, { nome: `${t.semNome} preenchidas sem nome informado`, cor: COR.semNome }, { nome: `${t.abertas} vagas abertas`, cor: "#F2D48B", listrada: true }]} />
            <span className="text-[11.5px] text-gray-500">{t.vagas} posições em {painel.totais.equipes} equipes</span>
          </div>
        </div>
      </section>

      {/* gráficos de cima: ocupam a largura toda */}
      <div className="grid items-stretch gap-4 lg:grid-cols-2 2xl:grid-cols-12">
        <div className="2xl:col-span-4">
          <Secao cheio titulo="Posições por contrato" sub="Com profissional, sem nome informado e vagas abertas.">
            <BarrasHorizontais
              itens={contratos.filter((c) => c.posicoes > 0).map((c) => ({ rotulo: c.codigo === A_DEFINIR ? "Sem contrato" : c.codigo, partes: [c.comNome, c.semNome, c.abertas], sub: `${c.equipes.length} equipe${c.equipes.length === 1 ? "" : "s"}` }))}
              series={posicoesSeries}
            />
            <Legenda className="mt-3" series={posicoesSeries} />
          </Secao>
        </div>
        <div className="2xl:col-span-5">
          <Secao cheio titulo={`Disponibilidade nas próximas ${SEMANAS} semanas`} sub="Pessoas livres, em campanha, ausentes e disponíveis sem equipe, a cada segunda-feira.">
            <ColunasEmpilhadas colunas={colunas} series={series} altura={300} rotuloEixo="Pessoas por situação a cada semana" />
            <Legenda series={series} className="mt-2" />
          </Secao>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:col-span-2 2xl:col-span-3 2xl:grid-cols-1">
          <Secao titulo="Colaboradores por empresa" sub="Quem trabalha em cada empresa.">
            <div className="flex items-center gap-5">
              <Rosca tamanho={118} partes={porEmpresa.map(([e, n], i) => ({ n, cor: CORES_EMPRESA[i % CORES_EMPRESA.length], rotulo: e }))} centro={{ valor: totalColaboradores, rotulo: "pessoas" }} />
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
          <Secao titulo="Vagas abertas por função" sub={`${abertasPorFuncao.total} vagas para contratar ou puxar.`}>
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
                <th className="w-[300px]">Posições</th>
                <th className="text-right">Com nome</th>
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
                        <span className="font-display text-[14px] font-semibold tracking-tight text-ink">{c.codigo === A_DEFINIR ? "Sem contrato" : c.codigo}</span>
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
                          { n: c.comNome, cor: COR.livre, rotulo: "com profissional" },
                          { n: c.semNome, cor: COR.semNome, rotulo: "sem nome informado" },
                          { n: c.abertas, cor: "#F2D48B", rotulo: "vagas abertas", listrada: true },
                        ]}
                      />
                    </td>
                    <td className="num py-2 text-right text-[13px] font-semibold">{c.comNome}</td>
                    <td className="num py-2 text-right text-[13px] text-gray-600">{c.semNome}</td>
                    <td className="num py-2 text-right text-[13px] font-semibold" style={{ color: c.abertas > 0 ? "#B86E00" : undefined }}>
                      {c.abertas}
                    </td>
                    <td className="num py-2 text-right text-[13px]">{c.viaturas}</td>
                    <td />
                    <td />
                  </tr>
                  {aberto &&
                    c.equipes.map((e) => {
                      const cm = composicao.get(e.id)!;
                      const l = painel.equipes.find((x) => x.id === e.id)!;
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
                                { n: cm.livres + cm.alocadas, cor: COR.livre, rotulo: "com profissional" },
                                { n: cm.ausentes, cor: COR.ausente, rotulo: "ausentes" },
                                { n: cm.semNome, cor: COR.semNome, rotulo: "sem nome informado" },
                                { n: cm.abertas, cor: "#F2D48B", rotulo: "vagas abertas", listrada: true },
                              ]}
                            />
                          </td>
                          <td className="num py-1.5 text-right text-[12.5px]">{l.nomesPreenchidos}</td>
                          <td className="num py-1.5 text-right text-[12.5px] text-gray-500">{l.semNome}</td>
                          <td className="num py-1.5 text-right text-[12.5px]" style={{ color: cm.abertas > 0 ? "#B86E00" : undefined }}>
                            {cm.abertas}
                          </td>
                          <td className="num py-1.5 text-right text-[12.5px]">{(veiculosPorEquipe.get(e.id) ?? []).length}</td>
                          <td className="py-1.5 text-[11.5px] text-gray-500">{cm.ausentes > 0 ? `${cm.ausentes} ausente${cm.ausentes === 1 ? "" : "s"}` : "—"}</td>
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
                      <td colSpan={8} className="py-2 pl-9 text-xs text-gray-400">
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

      {/* o que vem pela frente */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Secao titulo="Campanhas em aberto" sub="Cada campanha com a sua equipe." semPadding direita={<Link href="/campanhas" className="text-xs font-semibold text-brand-dark hover:underline">ver todas</Link>}>
          {campanhas.length === 0 ? (
            <p className="px-4 py-6 text-sm text-gray-400">Nenhuma campanha em aberto.</p>
          ) : (
            <ul className="divide-y divide-line">
              {campanhas.slice(0, 6).map((c) => (
                <li key={c.id}>
                  <Link href={`/montar?campanha=${c.id}`} className="flex items-center justify-between gap-3 px-4 py-2 hover:bg-gray-50">
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-medium text-ink">{nomeDaEquipeDaCampanha(c)}</span>
                      <span className="block truncate text-[11px] text-gray-500">
                        <span className="font-mono">{c.codigo}</span> · {rotuloContrato(c.projeto)} · {fmtDiaCurto(c.inicio)} a {fmtDiaCurto(c.fim)}
                      </span>
                    </span>
                    <span className={CHIP_STATUS_CAMPANHA[c.status]}>{c.status}</span>
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

        <Secao titulo="A mobilizar" sub="Pessoas de outro contrato que ficam livres: podem ir para uma equipe." semPadding direita={<Link href="/colaboradores" className="text-xs font-semibold text-brand-dark hover:underline">colaboradores</Link>}>
          {aMobilizar.length === 0 ? (
            <p className="px-4 py-6 text-sm text-gray-400">Ninguém com data de liberação à frente.</p>
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
                  <span className="num shrink-0 text-[11.5px] text-gray-500">livre {fmtDiaCurto(v.disponivelAPartir!)}</span>
                </li>
              ))}
            </ul>
          )}
        </Secao>
      </div>
    </div>
  );
}
