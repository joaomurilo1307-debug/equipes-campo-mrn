"use client";

// Relatórios: o que a gestão precisa mostrar, por período, com gráfico, tabela, Excel e impressão.
import { useMemo, useState } from "react";
import {
  STATUS_CAMPANHA_QUE_LIBERAM,
  conferirNecessidade,
  livresNoPeriodo,
  montarPainel,
  somarDias,
  temNome,
  trechosLivres,
} from "@/lib/efetivos/disponibilidade";
import { localizacaoNoDia } from "@/lib/efetivos/veiculos";
import { useDados } from "./DadosContext";
import { BarraPartes, BarrasHorizontais, ColunasEmpilhadas, Legenda, Rosca, type Coluna, type Serie } from "./graficos";
import { COR_AUSENCIA, COR_STATUS_CAMPANHA, diasDoPeriodo, fmtDia, fmtDiaCurto, nomeDaEquipeDaCampanha, rotuloContrato, rotuloEquipe, segundaDaSemana } from "./comum";
import { IcImprimir } from "./icones";
import { CabecalhoPagina, Secao, Segmentado } from "./ui";

type Relatorio = "efetivo" | "disponibilidade" | "ausencias" | "campanhas" | "frota";
type Tabela = { nome: string; cabecalho: string[]; linhas: (string | number)[][] };

const COR = { livre: "#0E8F63", alocada: "#1D6FB8", ausente: "#E63329", aberta: "#E0A100", reserva: "#7CCDB4" };
const CORES_EMPRESA = ["#0A9E7F", "#2F6FDE", "#B86E00", "#7C5CD6"];

function Numero({ rotulo, valor, sub, cor }: { rotulo: string; valor: string | number; sub?: string; cor?: string }) {
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

function Faixa({ children }: { children: React.ReactNode }) {
  return <div className="card grid grid-cols-2 divide-x divide-line overflow-hidden sm:grid-cols-4">{children}</div>;
}

function TabelaSimples({ t, vazio }: { t: Tabela; vazio?: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="tbl">
        <thead>
          <tr>
            {t.cabecalho.map((c, i) => (
              <th key={c} style={t.linhas.some((l) => typeof l[i] === "number") ? { textAlign: "right" } : undefined}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {t.linhas.map((l, i) => (
            <tr key={i}>
              {l.map((v, k) => (
                <td key={k} className={`py-1.5 text-[13px] ${typeof v === "number" ? "num text-right" : ""}`}>
                  {v}
                </td>
              ))}
            </tr>
          ))}
          {t.linhas.length === 0 && (
            <tr>
              <td colSpan={t.cabecalho.length} className="py-6 text-center text-sm text-gray-400">
                {vazio ?? "Nada neste período."}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export default function Relatorios() {
  const { dados, regra, idx, hoje, equipePorId, vagaPorId } = useDados();
  const [qual, setQual] = useState<Relatorio>("efetivo");
  const [inicio, setInicio] = useState(hoje);
  const [fim, setFim] = useState(somarDias(hoje, 89));
  const periodoOk = inicio <= fim;
  const dias = periodoOk ? diasDoPeriodo(inicio, fim) : 0;
  const campo = (id: string) => equipePorId.get(id)?.grupo !== "Apoio";

  // semanas (segundas-feiras) que cobrem o período, no máximo 40
  const semanas = useMemo(() => {
    if (!periodoOk) return [];
    const out: string[] = [];
    for (let d = segundaDaSemana(inicio); d <= fim && out.length < 40; d = somarDias(d, 7)) out.push(d);
    return out;
  }, [inicio, fim, periodoOk]);

  // ---------------------------------------------------------------- efetivo e vacâncias (na data inicial)
  const efetivo = useMemo(() => {
    const painel = montarPainel(regra, inicio);
    const porEquipe = painel.equipes.map((l) => ({ nome: l.nome, codigo: l.codigo, vagas: l.vagasPrevistas, preenchidas: l.nomesPreenchidos, semNome: l.semNome }));
    const porFuncao = new Map<string, { vagas: number; preenchidas: number; semNome: number; porEmpresa: Map<string, number> }>();
    const empresasPessoas = new Map<string, number>();
    for (const v of dados.vagas) {
      if (!campo(v.equipeId)) continue;
      const x = porFuncao.get(v.cargo) ?? { vagas: 0, preenchidas: 0, semNome: 0, porEmpresa: new Map() };
      x.vagas++;
      if (temNome(v)) {
        x.preenchidas++;
        empresasPessoas.set(v.empresa, (empresasPessoas.get(v.empresa) ?? 0) + 1);
      } else if (v.semNome) x.semNome++;
      else x.porEmpresa.set(v.empresa, (x.porEmpresa.get(v.empresa) ?? 0) + 1);
      porFuncao.set(v.cargo, x);
    }
    const empresasAbertas = Array.from(new Set([...porFuncao.values()].flatMap((x) => [...x.porEmpresa.keys()]))).sort();
    const funcoes = [...porFuncao.entries()].map(([cargo, x]) => ({ cargo, ...x, abertas: x.vagas - x.preenchidas - x.semNome })).sort((a, b) => b.abertas - a.abertas || b.vagas - a.vagas || a.cargo.localeCompare(b.cargo, "pt-BR"));

    // falta para atender as campanhas em aberto no período, por função
    const faltas = new Map<string, { pedido: number; escalados: number; livres: number; semGente: number }>();
    for (const c of dados.campanhas) {
      if (STATUS_CAMPANHA_QUE_LIBERAM.includes(c.status) || c.necessidade.length === 0 || c.fim < inicio || c.inicio > fim) continue;
      const membros = dados.alocacoes.filter((a) => a.campanhaId === c.id).map((a) => vagaPorId.get(a.vagaId)).filter((v): v is NonNullable<typeof v> => !!v);
      const livres = livresNoPeriodo(regra, c.inicio, c.fim, { ignorarCampanhaId: c.id }).livres.filter((p) => !membros.some((m) => m.id === p.id));
      const conf = conferirNecessidade(c.necessidade, membros, livres);
      for (const l of conf.linhas) {
        const x = faltas.get(l.cargo) ?? { pedido: 0, escalados: 0, livres: 0, semGente: 0 };
        x.pedido += l.pedido;
        x.escalados += l.escalados;
        x.livres += l.livresRestantes;
        x.semGente += l.semGente;
        faltas.set(l.cargo, x);
      }
    }
    return { painel, porEquipe, funcoes, empresasAbertas, empresasPessoas: [...empresasPessoas.entries()].sort((a, b) => b[1] - a[1]), faltas: [...faltas.entries()].map(([cargo, x]) => ({ cargo, ...x })).sort((a, b) => b.semGente - a.semGente) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regra, dados.vagas, dados.campanhas, dados.alocacoes, inicio, fim, vagaPorId, equipePorId]);

  // ---------------------------------------------------------------- disponibilidade no período
  const disp = useMemo(() => {
    if (!periodoOk) return null;
    const { livres, indisponiveis } = livresNoPeriodo(regra, inicio, fim);
    const parciais = indisponiveis
      .map((p) => ({ p, trechos: trechosLivres(vagaPorId.get(p.id)!, idx, inicio, fim) }))
      .filter((x) => x.trechos.length > 0)
      .sort((a, b) => (a.p.nome ?? "").localeCompare(b.p.nome ?? "", "pt-BR"));
    const colunas: Coluna[] = semanas.map((seg, k) => {
      const p = montarPainel(regra, seg < inicio ? inicio : seg);
      const q = p.totais.pessoas;
      return { rotulo: fmtDiaCurto(seg), dica: `Semana de ${fmtDia(seg)}`, destaque: k === 0, valores: [q.livres, q.alocadas, q.ausentes, p.reserva.livres] };
    });
    return { livres, indisponiveis, parciais, colunas };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regra, idx, inicio, fim, periodoOk, semanas, vagaPorId]);
  const seriesDisp: Serie[] = [
    { nome: "Livres", cor: COR.livre },
    { nome: "Em campanha", cor: COR.alocada },
    { nome: "Ausentes", cor: COR.ausente },
    { nome: "Reserva de apoio livre", cor: COR.reserva, listrada: true },
  ];

  // ---------------------------------------------------------------- férias e ausências
  const aus = useMemo(() => {
    const lista = dados.ausencias
      .filter((a) => periodoOk && a.fim >= inicio && a.inicio <= fim)
      .map((a) => {
        const v = vagaPorId.get(a.vagaId);
        const ini = a.inicio < inicio ? inicio : a.inicio;
        const f = a.fim > fim ? fim : a.fim;
        return { a, v, equipe: v ? equipePorId.get(v.equipeId) : undefined, diasNoPeriodo: diasDoPeriodo(ini, f) };
      })
      .sort((x, y) => x.a.inicio.localeCompare(y.a.inicio));
    const tipos = Array.from(new Set(lista.map((x) => x.a.tipo))).sort();
    const porTipo = tipos.map((t) => ({ tipo: t, dias: lista.filter((x) => x.a.tipo === t).reduce((s, x) => s + x.diasNoPeriodo, 0), n: lista.filter((x) => x.a.tipo === t).length }));
    const colunas: Coluna[] = semanas.map((seg, k) => {
      const fimSem = somarDias(seg, 6);
      return {
        rotulo: fmtDiaCurto(seg),
        dica: `Semana de ${fmtDia(seg)}`,
        destaque: k === 0,
        valores: tipos.map((t) => new Set(lista.filter((x) => x.a.tipo === t && x.a.inicio <= fimSem && x.a.fim >= seg).map((x) => x.a.vagaId)).size),
      };
    });
    return { lista, tipos, porTipo, colunas, pessoas: new Set(lista.map((x) => x.a.vagaId)).size };
  }, [dados.ausencias, vagaPorId, equipePorId, inicio, fim, periodoOk, semanas]);

  // ---------------------------------------------------------------- campanhas
  const camp = useMemo(() => {
    const lista = dados.campanhas
      .filter((c) => periodoOk && c.fim >= inicio && c.inicio <= fim)
      .sort((a, b) => a.inicio.localeCompare(b.inicio))
      .map((c) => {
        const membros = dados.alocacoes.filter((a) => a.campanhaId === c.id).map((a) => vagaPorId.get(a.vagaId)).filter((v): v is NonNullable<typeof v> => !!v);
        const pedido = c.necessidade.reduce((s, n) => s + n.qtd, 0);
        const conf = c.necessidade.length ? conferirNecessidade(c.necessidade, membros, []) : null;
        return { c, membros, pedido, falta: conf?.falta ?? 0 };
      });
    return lista;
  }, [dados.campanhas, dados.alocacoes, vagaPorId, inicio, fim, periodoOk]);

  // ---------------------------------------------------------------- frota
  const frota = useMemo(() => {
    const linhas = dados.veiculos.map((v) => {
      const loc = localizacaoNoDia(dados.movimentos.filter((m) => m.veiculoId === v.id), hoje);
      const eq = loc?.equipeId ? equipePorId.get(loc.equipeId) : undefined;
      const ocupantes = dados.vagas.filter((x) => x.veiculoId === v.id && temNome(x)).length;
      return { v, eq, ocupantes, projeto: loc?.projeto };
    });
    const porStatus = new Map<string, number>();
    for (const l of linhas) porStatus.set(l.v.status, (porStatus.get(l.v.status) ?? 0) + 1);
    const porEquipe = new Map<string, number>();
    for (const l of linhas) {
      const k = l.eq ? l.eq.nome : "Sem equipe";
      porEquipe.set(k, (porEquipe.get(k) ?? 0) + 1);
    }
    return { linhas, porStatus: [...porStatus.entries()], porEquipe: [...porEquipe.entries()].sort((a, b) => b[1] - a[1]) };
  }, [dados.veiculos, dados.movimentos, dados.vagas, equipePorId, hoje]);

  // ---------------------------------------------------------------- tabelas para exportar
  const tabelas: Tabela[] = useMemo(() => {
    if (qual === "efetivo")
      return [
        { nome: "Por equipe", cabecalho: ["Equipe", "Código", "Posições", "Com profissional", "Sem nome informado", "Vagas abertas", "% preenchido"], linhas: efetivo.porEquipe.map((e) => [e.nome, e.codigo, e.vagas, e.preenchidas, e.semNome, e.vagas - e.preenchidas - e.semNome, e.vagas ? Math.round(((e.preenchidas + e.semNome) / e.vagas) * 100) : 0]) },
        { nome: "Por função", cabecalho: ["Função", "Posições", "Com profissional", "Sem nome informado", "Vagas abertas"], linhas: efetivo.funcoes.map((f) => [f.cargo, f.vagas, f.preenchidas, f.semNome, f.abertas]) },
        { nome: "Falta p campanhas", cabecalho: ["Função", "Pedido", "Na equipe", "Livres", "Sem ninguém livre"], linhas: efetivo.faltas.map((f) => [f.cargo, f.pedido, f.escalados, f.livres, f.semGente]) },
      ];
    if (qual === "disponibilidade" && disp)
      return [
        { nome: "Livres na faixa", cabecalho: ["Nome", "Função", "Empresa", "Equipe"], linhas: disp.livres.map((p) => [p.nome ?? "", p.cargo, p.empresa, rotuloEquipe({ codigo: p.equipeCodigo, nome: p.equipeNome, grupo: p.grupo })]) },
        { nome: "Livres em parte", cabecalho: ["Nome", "Função", "Trechos livres"], linhas: disp.parciais.map((x) => [x.p.nome ?? "", x.p.cargo, x.trechos.map((t) => `${fmtDia(t.inicio)} a ${fmtDia(t.fim)}`).join("; ")]) },
        { nome: "Por semana", cabecalho: ["Semana", "Livres", "Em campanha", "Ausentes", "Reserva livre"], linhas: disp.colunas.map((c) => [c.dica, ...c.valores]) },
      ];
    if (qual === "ausencias")
      return [{ nome: "Ausências", cabecalho: ["Pessoa", "Equipe", "Tipo", "Início", "Fim", "Dias no período"], linhas: aus.lista.map((x) => [x.v?.nome ?? "", x.equipe ? rotuloEquipe(x.equipe) : "", x.a.tipo, fmtDia(x.a.inicio), fmtDia(x.a.fim), x.diasNoPeriodo]) }];
    if (qual === "campanhas")
      return [{ nome: "Campanhas", cabecalho: ["Equipe", "Código", "Contrato", "Atividade", "Local", "Início", "Fim", "Pessoas", "Pedido", "Falta", "Situação"], linhas: camp.map(({ c, membros, pedido, falta }) => [nomeDaEquipeDaCampanha(c), c.codigo, rotuloContrato(c.projeto), c.atividade, c.local ?? "", fmtDia(c.inicio), fmtDia(c.fim), membros.length, pedido, falta, c.status]) }];
    return [{ nome: "Frota", cabecalho: ["Viatura", "Placa", "Modelo", "Situação", "Equipe", "Pessoas"], linhas: frota.linhas.map((l) => [l.v.identificacao, l.v.placa ?? "", l.v.modelo ?? "", l.v.status, l.eq?.nome ?? "", l.ocupantes]) }];
  }, [qual, efetivo, disp, aus, camp, frota]);

  async function exportar() {
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    for (const t of tabelas) {
      const ws = XLSX.utils.aoa_to_sheet([t.cabecalho, ...t.linhas]);
      ws["!cols"] = t.cabecalho.map((c, i) => ({ wch: Math.min(48, Math.max(c.length + 2, ...t.linhas.map((l) => String(l[i] ?? "").length + 2))) }));
      XLSX.utils.book_append_sheet(wb, ws, t.nome.slice(0, 31));
    }
    XLSX.writeFile(wb, `relatorio-${qual}-${inicio}.xlsx`);
  }

  const titulo: Record<Relatorio, string> = { efetivo: "Efetivo e vacâncias", disponibilidade: "Disponibilidade", ausencias: "Férias e ausências", campanhas: "Campanhas e equipes", frota: "Frota" };
  const usaPeriodo = qual !== "frota";

  return (
    <div className="space-y-5">
      <CabecalhoPagina
        titulo="Relatórios"
        subtitulo="Para mostrar à gestão e ao cliente: escolha o relatório e o período; dá para baixar em Excel ou imprimir."
        acoes={
          <>
            <button onClick={exportar} className="btn-ghost">
              Baixar Excel
            </button>
            <button onClick={() => window.print()} className="btn-ghost">
              <IcImprimir tam={16} /> Imprimir / PDF
            </button>
          </>
        }
      />

      <div className="no-print flex flex-wrap items-end gap-3">
        <Segmentado
          valor={qual}
          onChange={setQual}
          opcoes={[
            { id: "efetivo", rotulo: "Efetivo e vacâncias" },
            { id: "disponibilidade", rotulo: "Disponibilidade" },
            { id: "ausencias", rotulo: "Férias e ausências" },
            { id: "campanhas", rotulo: "Campanhas" },
            { id: "frota", rotulo: "Frota" },
          ]}
        />
        {usaPeriodo && (
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs">
              <span className="label">De</span>
              <input type="date" value={inicio} onChange={(e) => e.target.value && setInicio(e.target.value)} className="field !mt-0.5 !py-1.5" />
            </label>
            <label className="text-xs">
              <span className="label">Até</span>
              <input type="date" value={fim} min={inicio} onChange={(e) => e.target.value && setFim(e.target.value)} className="field !mt-0.5 !py-1.5" />
            </label>
            {[30, 60, 90, 180].map((n) => (
              <button key={n} onClick={() => (setInicio(hoje), setFim(somarDias(hoje, n - 1)))} className={`btn-ghost btn-sm ${dias === n ? "!border-brand !text-brand-dark" : ""}`}>
                {n} dias
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="hidden print:block">
        <h2 className="font-display text-lg font-semibold">
          {titulo[qual]} {usaPeriodo ? `· ${fmtDia(inicio)} a ${fmtDia(fim)}` : `· em ${fmtDia(hoje)}`}
        </h2>
        <p className="text-xs text-gray-500">Equipes de campo — Grupo Consominas · gerado em {fmtDia(hoje)}</p>
      </div>

      {!periodoOk && usaPeriodo && <p className="text-sm text-bad">O fim não pode ser antes do início.</p>}

      {/* ------------------------------------------------ efetivo */}
      {qual === "efetivo" && (
        <>
          <Faixa>
            <Numero rotulo="Vagas" valor={efetivo.painel.totais.pessoas.vagas} sub={`${efetivo.painel.totais.equipes} equipes`} />
            <Numero rotulo="Com profissional" valor={efetivo.painel.totais.pessoas.preenchidas} sub={`${Math.round((efetivo.painel.totais.pessoas.preenchidas / Math.max(1, efetivo.painel.totais.pessoas.vagas)) * 100)}% preenchido`} cor={COR.livre} />
            <Numero rotulo="Vagas abertas" valor={efetivo.painel.totais.pessoas.abertas} sub="para contratar ou remanejar" cor={COR.aberta} />
            <Numero rotulo="Sem ninguém livre" valor={efetivo.faltas.reduce((s, f) => s + f.semGente, 0)} sub="falta nas campanhas do período" cor={COR.ausente} />
          </Faixa>

          <div className="grid items-start gap-5 xl:grid-cols-2">
            <Secao titulo="Vagas por equipe" sub="Com profissional e abertas, em cada uma das equipes.">
              <BarrasHorizontais
                itens={efetivo.porEquipe.map((e) => ({ rotulo: e.nome, partes: [e.preenchidas, e.semNome, e.vagas - e.preenchidas - e.semNome], sub: `${e.vagas} posições` }))}
                series={[
                  { nome: "Com profissional", cor: COR.livre },
                  { nome: "Sem nome informado", cor: "#9CC9BB" },
                  { nome: "Vaga aberta", cor: "#F2D48B", listrada: true },
                ]}
              />
              <Legenda className="mt-3" series={[{ nome: "Com profissional", cor: COR.livre }, { nome: "Sem nome informado", cor: "#9CC9BB" }, { nome: "Vaga aberta", cor: "#F2D48B", listrada: true }]} />
            </Secao>
            <div className="space-y-5">
              <Secao titulo="Vagas abertas por função" sub="Onde falta profissional, por empresa.">
                <BarrasHorizontais
                  itens={efetivo.funcoes.filter((f) => f.abertas > 0).slice(0, 8).map((f) => ({ rotulo: f.cargo, partes: efetivo.empresasAbertas.map((e) => f.porEmpresa.get(e) ?? 0) }))}
                  series={efetivo.empresasAbertas.map((e, k) => ({ nome: e, cor: CORES_EMPRESA[k % CORES_EMPRESA.length] }))}
                />
                <Legenda className="mt-3" series={efetivo.empresasAbertas.map((e, k) => ({ nome: e, cor: CORES_EMPRESA[k % CORES_EMPRESA.length] }))} />
              </Secao>
              <Secao titulo="Profissionais por empresa" sub="Quem já está nas equipes.">
                <div className="flex items-center gap-6">
                  <Rosca partes={efetivo.empresasPessoas.map(([e, n], k) => ({ n, cor: CORES_EMPRESA[k % CORES_EMPRESA.length], rotulo: e }))} centro={{ valor: efetivo.painel.totais.pessoas.preenchidas, rotulo: "pessoas" }} />
                  <ul className="space-y-1.5 text-[12.5px]">
                    {efetivo.empresasPessoas.map(([e, n], k) => (
                      <li key={e} className="flex items-center gap-2">
                        <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: CORES_EMPRESA[k % CORES_EMPRESA.length] }} />
                        <span className="text-gray-600">{e}</span>
                        <strong className="num text-ink">{n}</strong>
                      </li>
                    ))}
                  </ul>
                </div>
              </Secao>
            </div>
          </div>

          <Secao titulo="O que falta para atender as campanhas" sub="Por função, nas campanhas do período: o pedido, quem já está na equipe, quem está livre e o que fica sem ninguém." semPadding>
            <TabelaSimples t={tabelas[2]} vazio="Nenhuma campanha do período informou o pedido por função." />
          </Secao>
          <Secao titulo="Vagas por função" semPadding>
            <TabelaSimples t={tabelas[1]} />
          </Secao>
        </>
      )}

      {/* ------------------------------------------------ disponibilidade */}
      {qual === "disponibilidade" && disp && (
        <>
          <Faixa>
            <Numero rotulo="Livres na faixa toda" valor={disp.livres.length} sub="podem ser escaladas" cor={COR.livre} />
            <Numero rotulo="Livres só em parte" valor={disp.parciais.length} sub="voltam ou saem no meio" cor={COR.aberta} />
            <Numero rotulo="Fora da faixa" valor={disp.indisponiveis.length - disp.parciais.length} sub="férias, campanha, outro contrato" />
            <Numero rotulo="Período" valor={`${dias} dias`} sub={`${fmtDiaCurto(inicio)} a ${fmtDiaCurto(fim)}`} />
          </Faixa>
          <Secao titulo="Pessoas por situação, semana a semana" sub="Livres, em campanha e ausentes a cada segunda-feira do período.">
            <ColunasEmpilhadas colunas={disp.colunas} series={seriesDisp} altura={230} />
            <Legenda series={seriesDisp} className="mt-2" />
          </Secao>
          <Secao titulo="Livres na faixa toda" semPadding>
            <TabelaSimples t={tabelas[0]} vazio="Ninguém está livre na faixa inteira." />
          </Secao>
          <Secao titulo="Livres só em parte da faixa" sub="Trechos em que a pessoa pode ser escalada." semPadding>
            <TabelaSimples t={tabelas[1]} vazio="Ninguém livre só em parte." />
          </Secao>
        </>
      )}

      {/* ------------------------------------------------ ausências */}
      {qual === "ausencias" && (
        <>
          <Faixa>
            <Numero rotulo="Ausências no período" valor={aus.lista.length} />
            <Numero rotulo="Pessoas ausentes" valor={aus.pessoas} cor={COR.ausente} />
            <Numero rotulo="Dias de ausência" valor={aus.lista.reduce((s, x) => s + x.diasNoPeriodo, 0)} />
            <Numero rotulo="Período" valor={`${dias} dias`} sub={`${fmtDiaCurto(inicio)} a ${fmtDiaCurto(fim)}`} />
          </Faixa>
          <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
            <Secao titulo="Pessoas ausentes por semana" sub="Quantas pessoas estão fora a cada semana, por tipo.">
              <ColunasEmpilhadas colunas={aus.colunas} series={aus.tipos.map((t) => ({ nome: t, cor: COR_AUSENCIA[t] ?? "#6F7E77" }))} altura={220} />
              <Legenda className="mt-2" series={aus.tipos.map((t) => ({ nome: t, cor: COR_AUSENCIA[t] ?? "#6F7E77" }))} />
            </Secao>
            <Secao titulo="Dias por tipo" sub="Soma dos dias de ausência dentro do período.">
              <BarrasHorizontais itens={aus.porTipo.map((x) => ({ rotulo: x.tipo, partes: [x.dias], sub: `${x.n} lançamento${x.n === 1 ? "" : "s"}` }))} series={[{ nome: "dias", cor: "#2F6FDE" }]} formatoTotal={(n) => `${n} dias`} />
            </Secao>
          </div>
          <Secao titulo="Ausências lançadas" semPadding>
            <TabelaSimples t={tabelas[0]} vazio="Nenhuma ausência lançada neste período." />
          </Secao>
        </>
      )}

      {/* ------------------------------------------------ campanhas */}
      {qual === "campanhas" && (
        <>
          <Faixa>
            <Numero rotulo="Campanhas no período" valor={camp.length} />
            <Numero rotulo="Pessoas escaladas" valor={camp.reduce((s, x) => s + x.membros.length, 0)} cor={COR.alocada} />
            <Numero rotulo="Pedido informado" valor={camp.reduce((s, x) => s + x.pedido, 0)} sub="pessoas" />
            <Numero rotulo="Ainda faltam" valor={camp.reduce((s, x) => s + x.falta, 0)} sub="para fechar o pedido" cor={COR.aberta} />
          </Faixa>
          <Secao titulo="Linha do tempo" sub="Cada campanha com a sua equipe, no período.">
            {camp.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-400">Nenhuma campanha neste período.</p>
            ) : (
              <ul className="space-y-2.5">
                {camp.map(({ c, membros, pedido }) => {
                  const total = Math.max(1, diasDoPeriodo(inicio, fim));
                  const ini = Math.max(0, diasDoPeriodo(inicio, c.inicio < inicio ? inicio : c.inicio) - 1);
                  const larg = Math.max(1, diasDoPeriodo(c.inicio < inicio ? inicio : c.inicio, c.fim > fim ? fim : c.fim));
                  return (
                    <li key={c.id} className="grid items-center gap-3 sm:grid-cols-[220px_minmax(0,1fr)]">
                      <div className="min-w-0">
                        <div className="truncate text-[13px] font-medium text-ink">{nomeDaEquipeDaCampanha(c)}</div>
                        <div className="num text-[11px] text-gray-500">
                          {fmtDiaCurto(c.inicio)} a {fmtDiaCurto(c.fim)} · {membros.length}
                          {pedido ? ` de ${pedido}` : ""} pessoas
                        </div>
                      </div>
                      <div className="relative h-5 rounded-full bg-gray-100">
                        <div className="absolute top-0 h-5 rounded-full" style={{ left: `${(ini / total) * 100}%`, width: `${Math.max(1.5, (larg / total) * 100)}%`, background: COR_STATUS_CAMPANHA[c.status] ?? COR.livre }} title={`${c.codigo} · ${c.status}`} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Secao>
          <Secao titulo="Campanhas e equipes" semPadding>
            <TabelaSimples t={tabelas[0]} vazio="Nenhuma campanha neste período." />
          </Secao>
        </>
      )}

      {/* ------------------------------------------------ frota */}
      {qual === "frota" && (
        <>
          <Faixa>
            <Numero rotulo="Viaturas" valor={frota.linhas.length} />
            <Numero rotulo="Em operação" valor={frota.porStatus.find(([s]) => s === "Em operação")?.[1] ?? 0} cor={COR.livre} />
            <Numero rotulo="Em manutenção ou paradas" valor={frota.linhas.filter((l) => l.v.status === "Em manutenção" || l.v.status === "Parado").length} cor={COR.aberta} />
            <Numero rotulo="Pessoas nas viaturas" valor={frota.linhas.reduce((s, l) => s + l.ocupantes, 0)} />
          </Faixa>
          <div className="grid items-start gap-5 xl:grid-cols-2">
            <Secao titulo="Viaturas por equipe">
              <BarrasHorizontais itens={frota.porEquipe.map(([e, n]) => ({ rotulo: e, partes: [n] }))} series={[{ nome: "viaturas", cor: "#1D6FB8" }]} />
            </Secao>
            <Secao titulo="Viaturas por situação">
              <BarraPartes alto={14} partes={frota.porStatus.map(([s, n], k) => ({ n, cor: CORES_EMPRESA[k % CORES_EMPRESA.length], rotulo: s }))} />
              <Legenda className="mt-3" series={frota.porStatus.map(([s, n], k) => ({ nome: `${n} ${s.toLowerCase()}`, cor: CORES_EMPRESA[k % CORES_EMPRESA.length] }))} />
            </Secao>
          </div>
          <Secao titulo="Viaturas" semPadding>
            <TabelaSimples t={tabelas[0]} />
          </Secao>
        </>
      )}
    </div>
  );
}
