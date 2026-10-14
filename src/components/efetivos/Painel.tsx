"use client";

// Painel: a situação das 11 equipes da planilha, hoje e nas próximas semanas, em uma tela só.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { STATUS_CAMPANHA_QUE_LIBERAM, conferirNecessidade, estadoDaVaga, montarPainel, somarDias, temNome } from "@/lib/efetivos/disponibilidade";
import { useDados } from "./DadosContext";
import { BarraPartes, BarrasHorizontais, ColunasEmpilhadas, Legenda, type Coluna, type Serie } from "./graficos";
import { CHIP_STATUS_CAMPANHA, ESTADO_VISUAL, estadoVisual, fmtDia, fmtDiaCurto, nomeDaEquipeDaCampanha, rotuloContrato, segundaDaSemana } from "./comum";
import { IcCalendario, IcMais } from "./icones";
import { CabecalhoPagina, Secao } from "./ui";

const COR = { livre: "#0E8F63", alocada: "#1D6FB8", ausente: "#E63329", aberta: "#E0A100", reserva: "#7CCDB4" };
const SEMANAS_NO_GRAFICO = 16;

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
  const { dados, regra, idx, hoje, vagasPorEquipe, equipePorId, vagaPorId, nomeDe } = useDados();
  const router = useRouter();
  const [dataRef, setDataRef] = useState(hoje);
  const painel = useMemo(() => montarPainel(regra, dataRef), [regra, dataRef]);
  const t = painel.totais.pessoas;

  // composição de cada equipe na data de referência
  const composicao = useMemo(() => {
    const m = new Map<string, { livres: number; alocadas: number; ausentes: number; abertas: number }>();
    for (const l of painel.equipes) {
      const c = { livres: 0, alocadas: 0, ausentes: 0, abertas: 0 };
      for (const v of vagasPorEquipe.get(l.id) ?? []) {
        const s = estadoDaVaga(v, idx, dataRef).situacao;
        if (s === "LIVRE") c.livres++;
        else if (s === "ALOCADA") c.alocadas++;
        else if (s === "AUSENTE") c.ausentes++;
        else c.abertas++;
      }
      m.set(l.id, c);
    }
    return m;
  }, [painel.equipes, vagasPorEquipe, idx, dataRef]);

  // campanhas em que cada equipe tem gente na data
  const campanhasDaEquipe = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const a of regra.alocacoes) {
      if (a.inicio > dataRef || a.fim < dataRef) continue;
      const v = vagaPorId.get(a.vagaId);
      const c = dados.campanhas.find((x) => x.id === a.campanhaId);
      if (!v || !c) continue;
      if (!m.has(v.equipeId)) m.set(v.equipeId, new Set());
      m.get(v.equipeId)!.add(c.codigo);
    }
    return m;
  }, [regra.alocacoes, dataRef, vagaPorId, dados.campanhas]);

  const viaturasPorEquipe = useMemo(() => {
    const m = new Map<string, number>();
    for (const v of dados.veiculos) {
      const movs = dados.movimentos.filter((x) => x.veiculoId === v.id && x.inicio <= dataRef && (!x.fim || x.fim >= dataRef));
      const loc = movs.sort((a, b) => b.inicio.localeCompare(a.inicio))[0];
      if (loc?.equipeId) m.set(loc.equipeId, (m.get(loc.equipeId) ?? 0) + 1);
    }
    return m;
  }, [dados.veiculos, dados.movimentos, dataRef]);

  // pessoas nas próximas semanas: livres, em campanha, ausentes + reserva de apoio já livre
  const semanas = useMemo(() => Array.from({ length: SEMANAS_NO_GRAFICO }, (_, k) => somarDias(segundaDaSemana(hoje), k * 7)), [hoje]);
  const colunas: Coluna[] = useMemo(
    () =>
      semanas.map((seg, k) => {
        const p = montarPainel(regra, seg);
        const q = p.totais.pessoas;
        return {
          rotulo: fmtDiaCurto(seg),
          dica: `Semana de ${fmtDia(seg)}`,
          destaque: k === 0,
          valores: [q.livres, q.alocadas, q.ausentes, p.reserva.livres],
        };
      }),
    [semanas, regra]
  );
  const series: Serie[] = [
    { nome: "Livres", cor: COR.livre },
    { nome: "Em campanha", cor: COR.alocada },
    { nome: "Ausentes", cor: COR.ausente },
    { nome: "Reserva de apoio livre", cor: COR.reserva, listrada: true },
  ];

  // vagas abertas por função e empresa (base para decidir contratação)
  const abertas = useMemo(() => {
    const porCargo = new Map<string, Map<string, number>>();
    for (const v of dados.vagas) {
      if (temNome(v)) continue;
      const eq = equipePorId.get(v.equipeId);
      if (!eq || eq.status === "Inativa") continue;
      if (!porCargo.has(v.cargo)) porCargo.set(v.cargo, new Map());
      const e = porCargo.get(v.cargo)!;
      e.set(v.empresa, (e.get(v.empresa) ?? 0) + 1);
    }
    const empresas = Array.from(new Set([...porCargo.values()].flatMap((m) => [...m.keys()]))).sort();
    const itens = [...porCargo.entries()]
      .map(([cargo, m]) => ({ cargo, partes: empresas.map((e) => m.get(e) ?? 0), total: [...m.values()].reduce((s, n) => s + n, 0) }))
      .sort((a, b) => b.total - a.total || a.cargo.localeCompare(b.cargo, "pt-BR"));
    return { empresas, itens, total: itens.reduce((s, i) => s + i.total, 0) };
  }, [dados.vagas, equipePorId]);
  const coresEmpresa = ["#0A9E7F", "#2F6FDE", "#B86E00", "#7C5CD6"];

  // campanhas em aberto (as mais próximas primeiro)
  const campanhas = useMemo(
    () =>
      dados.campanhas
        .filter((c) => !STATUS_CAMPANHA_QUE_LIBERAM.includes(c.status) && c.fim >= hoje)
        .sort((a, b) => a.inicio.localeCompare(b.inicio))
        .map((c) => {
          const membros = dados.alocacoes.filter((a) => a.campanhaId === c.id).map((a) => vagaPorId.get(a.vagaId)).filter((v): v is NonNullable<typeof v> => !!v);
          return { c, membros, conf: c.necessidade.length ? conferirNecessidade(c.necessidade, membros, []) : null };
        }),
    [dados.campanhas, dados.alocacoes, vagaPorId, hoje]
  );

  const reserva = useMemo(() => dados.vagas.filter((v) => equipePorId.get(v.equipeId)?.grupo === "Apoio"), [dados.vagas, equipePorId]);
  const temContrato = painel.equipes.some((l) => l.projeto && l.projeto !== "A definir");
  const totalViaturas = dados.veiculos.length;
  const pct = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 100)}%` : "0%");

  return (
    <div className="space-y-5">
      <CabecalhoPagina
        titulo="Painel"
        subtitulo={`As ${painel.totais.equipes} equipes de campo em ${fmtDia(dataRef)}${dataRef === hoje ? " (hoje)" : ""}.`}
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
              <Link href="/montar" className="btn-primary">
                <IcMais tam={16} /> Nova campanha
              </Link>
            )}
          </>
        }
      />

      {/* resumo */}
      <section className="card overflow-hidden" aria-label="Resumo">
        <div className="grid grid-cols-2 divide-x divide-y divide-line sm:grid-cols-3 lg:grid-cols-6 lg:divide-y-0">
          <Indicador rotulo="Equipes" valor={painel.totais.equipes} sub={`${t.vagas} vagas · ${totalViaturas} viaturas`} />
          <Indicador rotulo="Com profissional" valor={t.preenchidas} sub={`${pct(t.preenchidas, t.vagas)} das vagas`} />
          <Indicador rotulo="Livres" valor={t.livres} sub="podem ser escaladas" cor={COR.livre} />
          <Indicador rotulo="Em campanha" valor={t.alocadas} sub={`${campanhas.length} campanha${campanhas.length === 1 ? "" : "s"} em aberto`} cor={COR.alocada} />
          <Indicador rotulo="Ausentes" valor={t.ausentes} sub="férias, atestado, afastamento" cor={COR.ausente} />
          <Indicador rotulo="Vagas abertas" valor={t.abertas} sub="sem profissional" cor={COR.aberta} />
        </div>
        <div className="border-t border-line px-4 py-3">
          <BarraPartes
            alto={10}
            partes={[
              { n: t.livres, cor: COR.livre, rotulo: "livres" },
              { n: t.alocadas, cor: COR.alocada, rotulo: "em campanha" },
              { n: t.ausentes, cor: COR.ausente, rotulo: "ausentes" },
              { n: t.abertas, cor: "#F2D48B", rotulo: "vagas abertas", listrada: true },
            ]}
          />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <Legenda
              series={[
                { nome: `${t.livres} livres`, cor: COR.livre },
                { nome: `${t.alocadas} em campanha`, cor: COR.alocada },
                { nome: `${t.ausentes} ausentes`, cor: COR.ausente },
                { nome: `${t.abertas} vagas abertas`, cor: "#F2D48B", listrada: true },
              ]}
            />
            {painel.reserva.vagas > 0 && (
              <span className="text-[11.5px] text-gray-500">
                + {painel.reserva.vagas} na reserva de apoio ({painel.reserva.livres} livre{painel.reserva.livres === 1 ? "" : "s"} em {fmtDiaCurto(dataRef)})
              </span>
            )}
          </div>
        </div>
      </section>

      {/* disponibilidade ao longo do tempo + vagas abertas */}
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Secao titulo="Disponibilidade nas próximas 16 semanas" sub="Pessoas livres, em campanha e ausentes a cada segunda-feira. Clique numa semana para ver quem está livre.">
          <ColunasEmpilhadas colunas={colunas} series={series} altura={230} rotuloEixo="Pessoas por situação a cada semana" aoClicar={(i) => router.push(`/montar?inicio=${semanas[i]}&fim=${somarDias(semanas[i], 6)}`)} />
          <Legenda series={series} className="mt-2" />
        </Secao>

        <Secao titulo="Vagas abertas por função" sub={`${abertas.total} vagas sem profissional — onde contratar ou remanejar.`}>
          {abertas.itens.length === 0 ? (
            <p className="text-sm text-gray-400">Todas as vagas têm profissional.</p>
          ) : (
            <>
              <BarrasHorizontais
                itens={abertas.itens.slice(0, 8).map((i) => ({ rotulo: i.cargo, partes: i.partes }))}
                series={abertas.empresas.map((e, k) => ({ nome: e, cor: coresEmpresa[k % coresEmpresa.length] }))}
              />
              {abertas.itens.length > 8 && <p className="mt-2 text-[11px] text-gray-400">+ {abertas.itens.length - 8} outras funções</p>}
              <Legenda className="mt-3" series={abertas.empresas.map((e, k) => ({ nome: e, cor: coresEmpresa[k % coresEmpresa.length] }))} />
            </>
          )}
        </Secao>
      </div>

      {/* equipes */}
      <Secao
        titulo="Equipes"
        sub={`Situação de cada equipe em ${fmtDia(dataRef)}.`}
        semPadding
        direita={
          <Link href="/equipes" className="text-xs font-semibold text-brand-dark hover:underline">
            ver composição
          </Link>
        }
      >
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Equipe</th>
                {temContrato && <th>Contrato</th>}
                <th className="w-[260px]">Pessoas</th>
                <th className="text-right">Livres</th>
                <th className="text-right">Viaturas</th>
                <th>Em campanha / situação</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {painel.equipes.map((l) => {
                const c = composicao.get(l.id)!;
                const ev = ESTADO_VISUAL[estadoVisual(l)];
                const codigos = [...(campanhasDaEquipe.get(l.id) ?? [])];
                return (
                  <tr key={l.id}>
                    <td className="py-2">
                      <div className="text-[13px] font-medium text-ink">{l.nome}</div>
                      <div className="font-mono text-[10.5px] text-gray-400">{l.codigo}</div>
                    </td>
                    {temContrato && <td className="py-2 text-[13px] text-gray-600">{rotuloContrato(l.projeto)}</td>}
                    <td className="py-2">
                      <div className="flex items-center gap-3">
                        <div className="w-36 shrink-0">
                          <BarraPartes
                            alto={8}
                            partes={[
                              { n: c.livres, cor: COR.livre, rotulo: "livres" },
                              { n: c.alocadas, cor: COR.alocada, rotulo: "em campanha" },
                              { n: c.ausentes, cor: COR.ausente, rotulo: "ausentes" },
                              { n: c.abertas, cor: "#F2D48B", rotulo: "vagas abertas", listrada: true },
                            ]}
                          />
                        </div>
                        <span className="num whitespace-nowrap text-[12px] text-gray-600">
                          <strong className="text-ink">{l.nomesPreenchidos}</strong>/{l.vagasPrevistas} vagas
                        </span>
                      </div>
                    </td>
                    <td className="num py-2 text-right text-[13px] font-semibold" style={{ color: c.livres > 0 ? COR.livre : undefined }}>
                      {c.livres}
                    </td>
                    <td className="num py-2 text-right text-[13px]">{viaturasPorEquipe.get(l.id) ?? 0}</td>
                    <td className="py-2">
                      {codigos.length > 0 ? (
                        <span className="chip-info font-mono">{codigos.join(", ")}</span>
                      ) : estadoVisual(l) !== "incompleta" ? (
                        <span className={ev.chip} title={ev.dica}>
                          {ev.rotulo}
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="py-2 text-right">
                      <Link href={`/quadro?equipe=${l.id}`} className="text-xs font-semibold text-brand-dark hover:underline">
                        quadro
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-line bg-gray-50 text-[12px] font-semibold text-gray-700">
                <td className="px-3 py-2">{painel.totais.equipes} equipes</td>
                {temContrato && <td />}
                <td className="num px-3 py-2">
                  {t.preenchidas}/{t.vagas} vagas com profissional
                </td>
                <td className="num px-3 py-2 text-right">{t.livres}</td>
                <td className="num px-3 py-2 text-right">{[...viaturasPorEquipe.values()].reduce((s, n) => s + n, 0)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      </Secao>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Secao
          titulo="Campanhas em aberto"
          sub="Cada campanha com a sua equipe."
          semPadding
          direita={
            <Link href="/campanhas" className="text-xs font-semibold text-brand-dark hover:underline">
              ver todas
            </Link>
          }
        >
          {campanhas.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-8 text-center">
              <p className="text-sm text-gray-500">Nenhuma campanha em aberto.</p>
              {dados.podeEditar && (
                <Link href="/montar" className="btn-primary btn-sm">
                  <IcMais tam={14} /> Criar campanha
                </Link>
              )}
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {campanhas.slice(0, 7).map(({ c, membros, conf }) => (
                <li key={c.id}>
                  <Link href={`/montar?campanha=${c.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 hover:bg-gray-50">
                    <div className="min-w-[180px] flex-1">
                      <div className="text-[13px] font-medium text-ink">{nomeDaEquipeDaCampanha(c)}</div>
                      <div className="text-[11px] text-gray-500">
                        <span className="font-mono">{c.codigo}</span> · {rotuloContrato(c.projeto)} · {c.atividade}
                      </div>
                    </div>
                    <div className="num text-[12px] text-gray-600">
                      {fmtDiaCurto(c.inicio)} a {fmtDiaCurto(c.fim)}
                    </div>
                    <div className="num w-24 text-[12px] text-gray-600">
                      <strong className="text-ink">{membros.length}</strong> pessoa{membros.length === 1 ? "" : "s"}
                      {conf && conf.falta > 0 && <span className="block text-[11px] text-warn">faltam {conf.falta}</span>}
                    </div>
                    <span className={CHIP_STATUS_CAMPANHA[c.status]}>{c.status}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Secao>

        <Secao titulo="Reserva de apoio" sub="Pessoas de outro contrato que ficam livres: podem entrar em qualquer campanha." semPadding>
          {reserva.length === 0 ? (
            <p className="px-4 py-6 text-sm text-gray-400">Sem pessoas na reserva.</p>
          ) : (
            <ul className="divide-y divide-line">
              {reserva.map((v) => (
                <li key={v.id} className="px-4 py-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[13px] font-medium text-ink">{nomeDe(v)}</span>
                    <span className="num shrink-0 text-[11.5px] text-gray-500">{v.disponivelAPartir ? `livre desde ${fmtDiaCurto(v.disponivelAPartir)}` : "livre"}</span>
                  </div>
                  <div className="truncate text-[11px] text-gray-500">
                    {v.cargo}
                    {v.destino ? ` · vai para ${v.destino.toLowerCase()}` : ""}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Secao>
      </div>
    </div>
  );
}
