"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  STATUS_CAMPANHA_QUE_LIBERAM,
  atendimentoDaCampanha,
  balancoCapacidade,
  estadoDaVaga,
  montarPainel,
  serieDisponibilidade,
  somarDias,
  temNome,
  type LinhaEquipe,
} from "@/lib/efetivos/disponibilidade";
import { localizacaoNoDia, resumoPorContrato } from "@/lib/efetivos/veiculos";
import { useDados } from "./DadosContext";
import { A_DEFINIR, CHIP_ATENDIMENTO, CHIP_STATUS_CAMPANHA, ESTADO_VISUAL, corDoContrato, estadoVisual, fmtDia, fmtDiaCurto, rotuloContrato, segundaDaSemana, type EstadoVisual } from "./comum";
import { IcAlerta, IcCalendario, IcCarro } from "./icones";
import { Aviso, CabecalhoPagina, PontoContrato, Segmentado } from "./ui";

const COR_GRUPO: Record<string, string> = { Fauna: "#0A9E7F", Flora: "#6B8E23", Apoio: "#5B7083" };
const corGrupo = (g: string) => COR_GRUPO[g] ?? "#5B7083";

// ---------------------------------------------------------------- peças

function Kpi({ rotulo, valor, sub, cor, children }: { rotulo: string; valor: number | string; sub?: string; cor?: string; children?: React.ReactNode }) {
  return (
    <div className="card p-4">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">{rotulo}</div>
      <div className="num mt-2 font-display text-[40px] font-semibold leading-none" style={{ color: cor ?? "#101B17" }}>
        {valor}
      </div>
      {sub && <div className="mt-1.5 text-xs text-gray-500">{sub}</div>}
      {children}
    </div>
  );
}

/** Barra de proporções (cada parte com a sua cor). */
function BarraPartes({ partes, alto = 8, listrada }: { partes: { n: number; cor: string; rotulo: string; listrada?: boolean }[]; alto?: number; listrada?: boolean }) {
  const total = partes.reduce((s, p) => s + p.n, 0) || 1;
  return (
    <div className="flex w-full overflow-hidden rounded-full bg-gray-100" style={{ height: alto }} role="img" aria-label={partes.map((p) => `${p.n} ${p.rotulo}`).join(", ")}>
      {partes
        .filter((p) => p.n > 0)
        .map((p) => (
          <div key={p.rotulo} className={p.listrada ? "listrado" : ""} style={{ width: `${(p.n / total) * 100}%`, background: p.cor }} title={`${p.n} ${p.rotulo}`} />
        ))}
    </div>
  );
}

function Legenda({ itens }: { itens: { cor: string; rotulo: string; n?: number }[] }) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-gray-500">
      {itens.map((i) => (
        <span key={i.rotulo} className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-sm" style={{ background: i.cor }} />
          {i.n !== undefined && <strong className="num text-gray-700">{i.n}</strong>} {i.rotulo}
        </span>
      ))}
    </div>
  );
}

const COR = { livre: "#0E8F63", alocada: "#1D6FB8", ausente: "#E63329", aberta: "#E0A100" };

// ---------------------------------------------------------------- tela

export default function Painel() {
  const { dados, regra, idx, hoje, vagasPorEquipe, equipePorId } = useDados();
  const [dataRef, setDataRef] = useState(hoje);
  const [visao, setVisao] = useState<"cards" | "tabela">("cards");

  const painel = useMemo(() => montarPainel(regra, dataRef), [regra, dataRef]);

  // composição de cada equipe na data: livres / alocadas / ausentes / vagas abertas
  const composicao = useMemo(() => {
    const m = new Map<string, { livres: number; alocadas: number; ausentes: number; abertas: number; total: number }>();
    for (const e of dados.equipes) {
      const c = { livres: 0, alocadas: 0, ausentes: 0, abertas: 0, total: 0 };
      for (const v of vagasPorEquipe.get(e.id) ?? []) {
        const s = estadoDaVaga(v, idx, dataRef).situacao;
        c.total++;
        if (s === "LIVRE") c.livres++;
        else if (s === "ALOCADA") c.alocadas++;
        else if (s === "AUSENTE") c.ausentes++;
        else c.abertas++;
      }
      m.set(e.id, c);
    }
    return m;
  }, [dados.equipes, vagasPorEquipe, idx, dataRef]);

  const viaturasPorEquipe = useMemo(() => {
    const m = new Map<string, number>();
    for (const v of dados.veiculos) {
      const loc = localizacaoNoDia(dados.movimentos.filter((x) => x.veiculoId === v.id), dataRef);
      if (loc?.equipeId) m.set(loc.equipeId, (m.get(loc.equipeId) ?? 0) + 1);
    }
    return m;
  }, [dados.veiculos, dados.movimentos, dataRef]);

  // agora e depois
  const marcos = useMemo(() => [0, 7, 15, 30, 60, 90].map((n) => ({ n, dia: somarDias(hoje, n) })), [hoje]);
  const serie = useMemo(() => serieDisponibilidade(regra, marcos.map((m) => m.dia)), [regra, marcos]);
  const semanas = useMemo(() => Array.from({ length: 16 }, (_, k) => somarDias(segundaDaSemana(hoje), k * 7)), [hoje]);
  const serieSemanal = useMemo(() => serieDisponibilidade(regra, semanas), [regra, semanas]);
  const grupos = painel.grupos.map((g) => g.grupo);
  const maxLivres = Math.max(1, ...serieSemanal.flatMap((p) => grupos.map((g) => p.porGrupo[g]?.livres ?? 0)));
  const balancos = useMemo(
    () => [0, 30, 60, 90].map((n) => ({ n, dia: somarDias(hoje, n), linhas: balancoCapacidade(regra, dados.campanhas, somarDias(hoje, n)) })),
    [regra, dados.campanhas, hoje]
  );

  // vagas abertas por cargo (decisão de contratar)
  const abertasPorCargo = useMemo(() => {
    const m = new Map<string, { cargo: string; total: number; porEmpresa: Map<string, number>; emContratacao: number }>();
    for (const v of dados.vagas) {
      if (temNome(v)) continue;
      const eq = equipePorId.get(v.equipeId);
      if (!eq || eq.status === "Inativa") continue;
      const x = m.get(v.cargo) ?? { cargo: v.cargo, total: 0, porEmpresa: new Map(), emContratacao: 0 };
      x.total++;
      x.porEmpresa.set(v.empresa, (x.porEmpresa.get(v.empresa) ?? 0) + 1);
      if (v.status === "Em contratação") x.emContratacao++;
      m.set(v.cargo, x);
    }
    return [...m.values()].sort((a, b) => b.total - a.total);
  }, [dados.vagas, equipePorId]);
  const empresas = useMemo(() => Array.from(new Set(abertasPorCargo.flatMap((c) => [...c.porEmpresa.keys()]))).sort(), [abertasPorCargo]);
  const totalAbertas = abertasPorCargo.reduce((s, c) => s + c.total, 0);

  const resumoFrota = useMemo(() => resumoPorContrato(dados.veiculos, dados.movimentos, dataRef), [dados.veiculos, dados.movimentos, dataRef]);

  const pendentes = useMemo(() => {
    const alocs = regra.alocacoes;
    return dados.campanhas
      .filter((c) => !STATUS_CAMPANHA_QUE_LIBERAM.includes(c.status) && c.fim >= hoje)
      .map((c) => ({ c, at: atendimentoDaCampanha({ ...regra, alocacoes: alocs }, c) }))
      .filter((x) => x.at.pessoasAlocadas === 0 && x.at.atendimento !== "CAPACIDADE SUFICIENTE");
  }, [dados.campanhas, regra, hoje]);

  const aConfirmar = dados.equipes.filter((e) => !e.contratoConfirmado).length;
  const t = painel.totais;

  // equipes por contrato (gráfico de capacidade), nos cinco estados
  const porContrato = useMemo(() => {
    const m = new Map<string, { projeto: string; n: Record<EstadoVisual, number>; total: number }>();
    for (const l of painel.equipes) {
      const x = m.get(l.projeto) ?? { projeto: l.projeto, n: { disponivel: 0, alocada: 0, incompleta: 0, ausencia: 0, inativa: 0 }, total: 0 };
      x.n[estadoVisual(l)]++;
      x.total++;
      m.set(l.projeto, x);
    }
    return [...m.values()].sort((a, b) => (a.projeto === A_DEFINIR ? 1 : b.projeto === A_DEFINIR ? -1 : a.projeto.localeCompare(b.projeto)));
  }, [painel.equipes]);

  return (
    <div className="space-y-7">
      <CabecalhoPagina
        titulo="Painel"
        subtitulo={`Situação das equipes de campo em ${fmtDia(dataRef)}${dataRef === hoje ? " (hoje)" : ""}.`}
        acoes={
          <>
            <label className="flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-1.5 text-sm text-gray-600">
              <IcCalendario tam={16} />
              <span className="text-xs font-medium">Data de referência</span>
              <input type="date" value={dataRef} onChange={(e) => e.target.value && setDataRef(e.target.value)} className="bg-transparent text-sm font-medium text-ink focus:outline-none" />
            </label>
            {dataRef !== hoje && (
              <button onClick={() => setDataRef(hoje)} className="btn-ghost">
                Voltar para hoje
              </button>
            )}
          </>
        }
      />

      {(aConfirmar > 0 || t.conflitos > 0) && (
        <div className="space-y-2">
          {t.conflitos > 0 && (
            <Aviso tipo="erro">
              <strong>{t.conflitos}</strong> pessoa{t.conflitos > 1 ? "s" : ""} escalada{t.conflitos > 1 ? "s" : ""} em campanha e ausente{t.conflitos > 1 ? "s" : ""} em {fmtDia(dataRef)}. Revise a equipe da campanha em{" "}
              <Link href="/campanhas" className="font-semibold underline">Campanhas</Link>.
            </Aviso>
          )}
          {aConfirmar > 0 && (
            <Aviso tipo="atencao">
              <strong>{aConfirmar}</strong> equipe{aConfirmar > 1 ? "s" : ""} com contrato <strong>a confirmar</strong> (a planilha não informa o contrato de cada equipe). Confira em{" "}
              <Link href="/equipes" className="font-semibold underline">Equipes e pessoas</Link>.
            </Aviso>
          )}
        </div>
      )}

      {/* indicadores */}
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6" aria-label="Indicadores">
        <Kpi rotulo="Equipes" valor={t.equipes} sub={`${t.pessoas.vagas} vagas no total`} />
        <Kpi rotulo="Disponíveis" valor={t.disponiveis} cor={COR.livre} sub="completas e livres" />
        <Kpi rotulo="Alocadas" valor={t.alocadas} cor={COR.alocada} sub="em campanha" />
        <Kpi rotulo="Indisponíveis" valor={t.indisponiveis} cor={COR.ausente} sub="incompletas ou com ausência" />
        <Kpi rotulo="Pessoas livres" valor={t.pessoas.livres} cor={COR.livre} sub={`de ${t.pessoas.preenchidas} com profissional`} />
        <Kpi rotulo="Vagas abertas" valor={t.pessoas.abertas} cor={COR.aberta} sub="sem profissional" />
      </section>

      {/* resumo por grupo */}
      <section aria-label="Resumo por grupo">
        <h2 className="mb-3 font-display text-lg font-semibold tracking-tight">Resumo por grupo</h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {painel.grupos.map((g) => (
            <article key={g.grupo} className="card p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="h-3 w-3 rotate-45 rounded-[3px]" style={{ background: corGrupo(g.grupo) }} />
                  <h3 className="font-display text-xl font-semibold tracking-tight">{g.grupo}</h3>
                </div>
                <span className="chip-mute">
                  {g.total} equipe{g.total === 1 ? "" : "s"}
                </span>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-3 text-center">
                <div>
                  <div className="num font-display text-3xl font-semibold" style={{ color: COR.livre }}>{g.disponiveis}</div>
                  <div className="text-[11px] font-medium text-gray-500">Disponíveis</div>
                </div>
                <div>
                  <div className="num font-display text-3xl font-semibold" style={{ color: COR.alocada }}>{g.alocadas}</div>
                  <div className="text-[11px] font-medium text-gray-500">Alocadas</div>
                </div>
                <div>
                  <div className="num font-display text-3xl font-semibold" style={{ color: COR.ausente }}>{g.indisponiveis}</div>
                  <div className="text-[11px] font-medium text-gray-500">Indisponíveis</div>
                </div>
              </div>
              <div className="mt-4">
                <BarraPartes
                  partes={[
                    { n: g.disponiveis, cor: COR.livre, rotulo: "disponíveis" },
                    { n: g.alocadas, cor: COR.alocada, rotulo: "alocadas" },
                    { n: g.indisponiveis, cor: COR.ausente, rotulo: "indisponíveis" },
                  ]}
                />
              </div>

              <div className="mt-5 border-t border-line pt-4">
                <div className="mb-2 flex items-baseline justify-between text-xs text-gray-500">
                  <span>Pessoas</span>
                  <span>
                    <strong className="num text-ink">{g.pessoas.preenchidas}</strong> de {g.pessoas.vagas} vagas preenchidas
                  </span>
                </div>
                <BarraPartes
                  alto={10}
                  partes={[
                    { n: g.pessoas.livres, cor: COR.livre, rotulo: "livres" },
                    { n: g.pessoas.alocadas, cor: COR.alocada, rotulo: "alocadas" },
                    { n: g.pessoas.ausentes, cor: COR.ausente, rotulo: "ausentes" },
                    { n: g.pessoas.abertas, cor: "#F2D48B", rotulo: "vagas abertas", listrada: true },
                  ]}
                />
                <div className="mt-2">
                  <Legenda
                    itens={[
                      { cor: COR.livre, rotulo: "livres", n: g.pessoas.livres },
                      { cor: COR.alocada, rotulo: "alocadas", n: g.pessoas.alocadas },
                      { cor: COR.ausente, rotulo: "ausentes", n: g.pessoas.ausentes },
                      { cor: "#F2D48B", rotulo: "abertas", n: g.pessoas.abertas },
                    ]}
                  />
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* situação das equipes */}
      <section aria-label="Situação das equipes">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-lg font-semibold tracking-tight">Situação das equipes</h2>
          <Segmentado valor={visao} onChange={setVisao} opcoes={[{ id: "cards", rotulo: "Cartões" }, { id: "tabela", rotulo: "Tabela" }]} />
        </div>

        {visao === "cards" ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {painel.equipes.map((l) => (
              <CartaoEquipe key={l.id} l={l} cor={corDoContrato(l.projeto)} confirmado={equipePorId.get(l.id)?.contratoConfirmado ?? true} comp={composicao.get(l.id)!} viaturas={viaturasPorEquipe.get(l.id) ?? 0} />
            ))}
          </div>
        ) : (
          <div className="card overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Contrato</th>
                  <th>Grupo</th>
                  <th>Equipe / base</th>
                  <th>Status da equipe</th>
                  <th>Situação RH</th>
                  <th className="text-right">Preenchidas</th>
                  <th className="text-right">Alocações</th>
                  <th>Disponibilidade</th>
                </tr>
              </thead>
              <tbody>
                {painel.equipes.map((l) => {
                  const ev = ESTADO_VISUAL[estadoVisual(l)];
                  return (
                    <tr key={l.id}>
                      <td className="font-mono text-[13px] font-medium">{l.codigo}</td>
                      <td>
                        <span className="inline-flex items-center gap-2">
                          <PontoContrato cor={corDoContrato(l.projeto)} />
                          {rotuloContrato(l.projeto)}
                        </span>
                      </td>
                      <td className="text-gray-600">{l.grupo}</td>
                      <td className="font-medium">{l.nome}</td>
                      <td className="text-gray-600">{l.status}</td>
                      <td className="text-gray-600">{l.situacaoRh}</td>
                      <td className="num text-right">
                        {l.nomesPreenchidos}/{l.vagasPrevistas}
                      </td>
                      <td className="num text-right">{l.alocacoes}</td>
                      <td>
                        <span className={ev.chip}>{l.disponibilidade}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* gráficos */}
      <section className="grid gap-4 lg:grid-cols-2" aria-label="Capacidade">
        <div className="card p-5">
          <h3 className="card-t">Capacidade das equipes por contrato</h3>
          <p className="mb-4 text-xs text-gray-500">Equipes disponíveis, alocadas e indisponíveis em cada contrato.</p>
          <div className="space-y-3">
            {porContrato.map((c) => (
              <div key={c.projeto}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="inline-flex items-center gap-2 font-medium">
                    <PontoContrato cor={corDoContrato(c.projeto)} />
                    {rotuloContrato(c.projeto)}
                  </span>
                  <span className="num text-xs text-gray-500">{c.total} equipe{c.total === 1 ? "" : "s"}</span>
                </div>
                <BarraPartes alto={14} partes={(Object.keys(ESTADO_VISUAL) as EstadoVisual[]).map((k) => ({ n: c.n[k], cor: ESTADO_VISUAL[k].cor, rotulo: ESTADO_VISUAL[k].rotulo.toLowerCase() }))} />
              </div>
            ))}
          </div>
          <div className="mt-4">
            <Legenda itens={(Object.keys(ESTADO_VISUAL) as EstadoVisual[]).filter((k) => k !== "inativa").map((k) => ({ cor: ESTADO_VISUAL[k].cor, rotulo: ESTADO_VISUAL[k].rotulo.toLowerCase() }))} />
          </div>
        </div>

        <div className="card p-5">
          <h3 className="card-t">Pessoas livres nas próximas 16 semanas</h3>
          <p className="mb-3 text-xs text-gray-500">Considera férias, atestados, campanhas já escaladas e quem ainda está em outro contrato.</p>
          <div className="flex h-44 items-end gap-1" role="img" aria-label="Pessoas livres por semana">
            {serieSemanal.map((p) => (
              <div key={p.data} className="flex min-w-0 flex-1 flex-col items-center">
                <div className="flex h-36 w-full items-end justify-center gap-[2px]">
                  {grupos.map((g) => {
                    const v = p.porGrupo[g]?.livres ?? 0;
                    return <div key={g} title={`${g}: ${v} livres na semana de ${fmtDia(p.data)}`} className="w-full max-w-[14px] rounded-t" style={{ height: `${(v / maxLivres) * 100}%`, minHeight: v > 0 ? 3 : 0, background: corGrupo(g) }} />;
                  })}
                </div>
                <div className="num mt-1.5 text-[10px] text-gray-400">{fmtDiaCurto(p.data)}</div>
              </div>
            ))}
          </div>
          <div className="mt-2 flex gap-4 text-[11px] text-gray-500">
            {grupos.map((g) => (
              <span key={g} className="inline-flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-sm" style={{ background: corGrupo(g) }} />
                {g}
              </span>
            ))}
            <span className="ml-auto">máx. {maxLivres}</span>
          </div>
        </div>
      </section>

      <section className="card" aria-label="Agora e depois">
        <div className="card-h">
          <div>
            <h3 className="card-t">Disponibilidade agora e depois</h3>
            <p className="text-xs text-gray-500">Equipes disponíveis e pessoas livres em cada data, com as campanhas e ausências já lançadas.</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Grupo</th>
                {marcos.map((m) => (
                  <th key={m.n} className="text-right">
                    {m.n === 0 ? "Hoje" : `+${m.n} dias`}
                    <div className="font-normal normal-case text-gray-400">{fmtDiaCurto(m.dia)}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grupos.map((g) => (
                <tr key={g}>
                  <td className="font-medium">
                    <span className="inline-flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rotate-45 rounded-[2px]" style={{ background: corGrupo(g) }} />
                      {g}
                    </span>
                  </td>
                  {serie.map((p) => (
                    <td key={p.data} className="num text-right">
                      <span className="font-semibold" style={{ color: COR.livre }}>{p.porGrupo[g].equipesDisponiveis}</span>
                      <span className="text-gray-400">{p.porGrupo[g].equipesDisponiveis === 1 ? " equipe · " : " equipes · "}</span>
                      <span className="font-semibold">{p.porGrupo[g].livres}</span>
                      <span className="text-gray-400"> livres</span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2" aria-label="Contratar ou realocar">
        <div className="card p-5">
          <h3 className="card-t">Capacidade × demanda</h3>
          <p className="mb-3 text-xs text-gray-500">Equipes completas contra as equipes pedidas pelas campanhas em andamento: dá para ver se falta gente.</p>
          <div className="space-y-4">
            {grupos.map((g) => (
              <div key={g}>
                <div className="mb-1.5 flex items-center gap-2 text-sm font-semibold">
                  <span className="h-2.5 w-2.5 rotate-45 rounded-[2px]" style={{ background: corGrupo(g) }} />
                  {g}
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {balancos.map((b) => {
                    const l = b.linhas.find((x) => x.grupo === g);
                    if (!l) return <div key={b.n} />;
                    const cls = l.saldo < 0 ? "bg-bad-soft text-bad" : l.saldo === 0 ? "bg-warn-soft text-warn" : "bg-ok-soft text-ok";
                    return (
                      <div key={b.n} className={`rounded-xl px-3 py-2 ${cls}`}>
                        <div className="text-[10px] font-semibold uppercase tracking-wide opacity-80">{b.n === 0 ? "Hoje" : `+${b.n} dias`}</div>
                        <div className="num font-display text-xl font-semibold leading-tight">{l.saldo > 0 ? `+${l.saldo}` : l.saldo}</div>
                        <div className="text-[10px] opacity-80">
                          {l.equipesCompletas} completas · {l.demandaEquipes} pedidas
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card p-5">
          <div className="flex items-baseline justify-between">
            <h3 className="card-t">Vagas abertas por cargo</h3>
            <span className="num text-sm font-semibold text-warn">{totalAbertas} vagas</span>
          </div>
          <p className="mb-3 text-xs text-gray-500">Onde falta profissional — base para decidir contratação.</p>
          <div className="space-y-2.5">
            {abertasPorCargo.slice(0, 8).map((c) => (
              <div key={c.cargo}>
                <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                  <span className="truncate font-medium" title={c.cargo}>{c.cargo}</span>
                  <span className="num shrink-0 font-semibold">{c.total}</span>
                </div>
                <div className="flex h-2 w-full overflow-hidden rounded-full bg-gray-100">
                  {empresas.map((e, i) => (
                    <div key={e} title={`${e}: ${c.porEmpresa.get(e) ?? 0}`} style={{ width: `${((c.porEmpresa.get(e) ?? 0) / (abertasPorCargo[0]?.total || 1)) * 100}%`, background: i === 0 ? "#0A9E7F" : "#2F6FDE" }} />
                  ))}
                </div>
                <div className="mt-0.5 text-[11px] text-gray-400">
                  {empresas.filter((e) => c.porEmpresa.get(e)).map((e) => `${e}: ${c.porEmpresa.get(e)}`).join(" · ")}
                  {c.emContratacao > 0 && ` · ${c.emContratacao} em contratação`}
                </div>
              </div>
            ))}
            {abertasPorCargo.length === 0 && <p className="text-sm text-gray-400">Todas as vagas têm profissional.</p>}
          </div>
        </div>
      </section>

      <section className="card" aria-label="Frota por contrato">
        <div className="card-h">
          <div>
            <h3 className="card-t">Frota por contrato em {fmtDia(dataRef)}</h3>
            <p className="text-xs text-gray-500">Onde cada veículo está agora.</p>
          </div>
          <Link href="/frota" className="btn-ghost btn-sm">
            <IcCarro tam={15} /> Abrir frota
          </Link>
        </div>
        <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4">
          {resumoFrota.map((r) => (
            <div key={r.projeto} className="rounded-xl border border-line p-3.5">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <PontoContrato cor={r.projeto === "Sem localização" ? "#9AA8A1" : corDoContrato(r.projeto)} />
                {r.projeto === "Sem localização" ? r.projeto : rotuloContrato(r.projeto)}
              </div>
              <div className="num mt-1 font-display text-3xl font-semibold">{r.total}</div>
              <div className="text-[11px] text-gray-500">{Object.entries(r.porStatus).map(([s, n]) => `${n} ${s.toLowerCase()}`).join(" · ")}</div>
            </div>
          ))}
          {resumoFrota.length === 0 && <p className="text-sm text-gray-400">Nenhum veículo cadastrado.</p>}
        </div>
      </section>

      {pendentes.length > 0 && (
        <section className="card border-warn/30 p-5" aria-label="Campanhas sem equipe">
          <h3 className="card-t flex items-center gap-2 text-warn">
            <IcAlerta tam={18} /> Campanhas sem equipe e que a capacidade não cobre
          </h3>
          <ul className="mt-3 divide-y divide-line">
            {pendentes.map(({ c, at }) => (
              <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                <span className="font-mono text-[13px] font-semibold">{c.codigo}</span>
                <span className="text-gray-600">
                  {c.projeto} · {c.grupo} · {fmtDia(c.inicio)} a {fmtDia(c.fim)} · pede {c.qtdEquipes} equipe{c.qtdEquipes > 1 ? "s" : ""}
                </span>
                <span className={CHIP_STATUS_CAMPANHA[c.status]}>{c.status}</span>
                <span className={CHIP_ATENDIMENTO[at.atendimento]}>{at.atendimento}</span>
                <span className="text-xs text-gray-500">{at.pessoasLivresNoGrupo} pessoas livres no período</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- cartão de equipe

function CartaoEquipe({ l, cor, confirmado, comp, viaturas }: { l: LinhaEquipe; cor: string; confirmado: boolean; comp: { livres: number; alocadas: number; ausentes: number; abertas: number; total: number }; viaturas: number }) {
  const ev = ESTADO_VISUAL[estadoVisual(l)];
  return (
    <article className="card flex flex-col p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[12px] font-medium text-gray-500">{l.codigo}</span>
            <span className="text-gray-300">·</span>
            <span className="text-[12px] text-gray-500">{l.grupo}</span>
          </div>
          <h3 className="mt-0.5 font-display text-[17px] font-semibold leading-snug tracking-tight">{l.nome}</h3>
        </div>
        <span className={ev.chip} title={ev.dica}>{ev.rotulo}</span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        <span className="inline-flex items-center gap-1.5 rounded-md bg-gray-100 px-2 py-1 font-medium text-gray-700">
          <PontoContrato cor={cor} tam={9} />
          {rotuloContrato(l.projeto)}
        </span>
        {!confirmado && <span className="chip-warn" title="Contrato deduzido pelo nome ou ainda não informado">a confirmar</span>}
        {l.gestor && <span className="text-gray-500">gestor {l.gestor}</span>}
      </div>

      <div className="mt-4">
        <div className="mb-1.5 flex items-baseline justify-between text-xs text-gray-500">
          <span>
            <strong className="num text-base font-semibold text-ink">{l.nomesPreenchidos}</strong>/{l.vagasPrevistas} vagas preenchidas
          </span>
          <span className="num">{Math.round((l.nomesPreenchidos / Math.max(1, l.vagasPrevistas)) * 100)}%</span>
        </div>
        <BarraPartes
          alto={10}
          partes={[
            { n: comp.livres, cor: COR.livre, rotulo: "livres" },
            { n: comp.alocadas, cor: COR.alocada, rotulo: "alocadas" },
            { n: comp.ausentes, cor: COR.ausente, rotulo: "ausentes" },
            { n: comp.abertas, cor: "#F2D48B", rotulo: "vagas abertas", listrada: true },
          ]}
        />
        <div className="mt-2">
          <Legenda
            itens={[
              { cor: COR.livre, rotulo: "livres", n: comp.livres },
              { cor: COR.alocada, rotulo: "aloc.", n: comp.alocadas },
              { cor: COR.ausente, rotulo: "aus.", n: comp.ausentes },
              { cor: "#F2D48B", rotulo: "abertas", n: comp.abertas },
            ]}
          />
        </div>
      </div>

      <div className="mt-auto flex items-center justify-between border-t border-line pt-3 text-xs text-gray-500">
        <span className="inline-flex items-center gap-1.5">
          <IcCarro tam={15} />
          {viaturas} viatura{viaturas === 1 ? "" : "s"}
        </span>
        <Link href={`/quadro?equipe=${l.id}`} className="font-semibold text-brand-dark hover:underline">
          Ver no quadro
        </Link>
      </div>
    </article>
  );
}
