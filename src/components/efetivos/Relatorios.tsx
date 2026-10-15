"use client";

// Relatórios: o que a gestão precisa mostrar, por período, com gráfico, tabela, Excel e impressão.
// Todos os números vêm da mesma regra do Painel (lib/efetivos/situacao).
import { useMemo, useState } from "react";
import { somarDias, temNome } from "@/lib/efetivos/disponibilidade";
import { localizacaoNoDia } from "@/lib/efetivos/veiculos";
import { useDados } from "./DadosContext";
import { BarraPartes, BarrasHorizontais, ColunasEmpilhadas, Legenda, Rosca, type Coluna, type Serie } from "./graficos";
import { A_DEFINIR, COR_AUSENCIA, diasDoPeriodo, fmtDia, fmtDiaCurto, rotuloContrato, rotuloEquipe, segundaDaSemana } from "./comum";
import { IcImprimir } from "./icones";
import { CabecalhoPagina, Secao, Segmentado } from "./ui";

type Relatorio = "efetivo" | "pessoas" | "ausencias" | "movimentos" | "frota";
type Tabela = { nome: string; cabecalho: string[]; linhas: (string | number)[][] };

const COR = { emEquipe: "#0E8F63", ausente: "#E63329", disponivel: "#2F6FDE", outro: "#9DB7E8", aberta: "#E0A100", semNome: "#9CC9BB" };
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
  const { dados, hoje, equipePorId, vagaPorId, vagasPorEquipe, equipesCampo, resumoDoDia, contagemDe, situacaoDe, contratoNoDia } = useDados();
  const [qual, setQual] = useState<Relatorio>("efetivo");
  const [inicio, setInicio] = useState(hoje);
  const [fim, setFim] = useState(somarDias(hoje, 89));
  const periodoOk = inicio <= fim;
  const dias = periodoOk ? diasDoPeriodo(inicio, fim) : 0;

  // semanas (segundas-feiras) que cobrem o período, no máximo 40
  const semanas = useMemo(() => {
    if (!periodoOk) return [];
    const out: string[] = [];
    for (let d = segundaDaSemana(inicio); d <= fim && out.length < 40; d = somarDias(d, 7)) out.push(d);
    return out;
  }, [inicio, fim, periodoOk]);

  // ---------------------------------------------------------------- efetivo e vagas (na data inicial)
  const efetivo = useMemo(() => {
    const r = resumoDoDia(inicio);
    const porEquipe = equipesCampo.map((e) => {
      const c = contagemDe([e.id], inicio);
      return { e, contrato: contratoNoDia(e, inicio) || A_DEFINIR, c };
    });
    const porFuncao = new Map<string, { vagas: number; comNome: number; semNome: number; porEmpresa: Map<string, number> }>();
    const empresasPessoas = new Map<string, number>();
    const abertas: { contrato: string; equipe: string; cargo: string; empresa: string; atividade: string; situacao: string }[] = [];
    for (const { e, contrato } of porEquipe) {
      for (const v of vagasPorEquipe.get(e.id) ?? []) {
        const sit = situacaoDe(v, inicio).situacao;
        if (sit === "DESMOBILIZADO") continue;
        const x = porFuncao.get(v.cargo) ?? { vagas: 0, comNome: 0, semNome: 0, porEmpresa: new Map() };
        x.vagas++;
        if (temNome(v)) {
          x.comNome++;
          empresasPessoas.set(v.empresa, (empresasPessoas.get(v.empresa) ?? 0) + 1);
        } else if (v.semNome) x.semNome++;
        else {
          x.porEmpresa.set(v.empresa, (x.porEmpresa.get(v.empresa) ?? 0) + 1);
          abertas.push({ contrato: rotuloContrato(contrato), equipe: e.nome, cargo: v.cargo, empresa: v.empresa, atividade: v.atividade, situacao: v.status === "Em contratação" ? "Em contratação" : "Aberta" });
        }
        porFuncao.set(v.cargo, x);
      }
    }
    const empresasAbertas = Array.from(new Set([...porFuncao.values()].flatMap((x) => [...x.porEmpresa.keys()]))).sort();
    const funcoes = [...porFuncao.entries()].map(([cargo, x]) => ({ cargo, ...x, abertas: x.vagas - x.comNome - x.semNome })).sort((a, b) => b.abertas - a.abertas || b.vagas - a.vagas || a.cargo.localeCompare(b.cargo, "pt-BR"));
    return { r, porEquipe, funcoes, abertas, empresasAbertas, empresasPessoas: [...empresasPessoas.entries()].sort((a, b) => b[1] - a[1]) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dados, inicio]);

  // ---------------------------------------------------------------- pessoas semana a semana
  const pessoas = useMemo(() => {
    if (!periodoOk) return null;
    const colunas: Coluna[] = semanas.map((seg, k) => {
      const q = resumoDoDia(seg < inicio ? inicio : seg);
      return { rotulo: fmtDiaCurto(seg), dica: `Semana de ${fmtDia(seg)}`, destaque: k === 0, valores: [q.emEquipe, q.ausentes, q.disponiveis, q.outroContrato] };
    });
    // quem fica disponível durante o período e a partir de quando (equipe que termina, apoio liberado)
    const ficam: { v: (typeof dados.vagas)[number]; desde: string }[] = [];
    for (const v of dados.vagas) {
      if (!temNome(v) || v.status === "Desmobilizado") continue;
      if (situacaoDe(v, inicio).situacao === "DISPONIVEL") continue; // já disponível no início: não é "passa a ficar"
      for (const seg of semanas) {
        const d = seg < inicio ? inicio : seg;
        if (situacaoDe(v, d).situacao === "DISPONIVEL") {
          ficam.push({ v, desde: d });
          break;
        }
      }
    }
    const jaDisponiveis = dados.vagas.filter((v) => temNome(v) && v.status !== "Desmobilizado" && situacaoDe(v, inicio).situacao === "DISPONIVEL");
    return { colunas, ficam: ficam.sort((a, b) => a.desde.localeCompare(b.desde)), jaDisponiveis };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dados, inicio, periodoOk, semanas]);
  const seriesPessoas: Serie[] = [
    { nome: "Em equipe", cor: COR.emEquipe },
    { nome: "Ausentes", cor: COR.ausente },
    { nome: "Disponíveis (sem equipe)", cor: COR.disponivel },
    { nome: "Em outro contrato", cor: COR.outro, listrada: true },
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

  // ---------------------------------------------------------------- equipes e movimentações
  const mov = useMemo(() => {
    const passagens = (dados.movimentosEquipe ?? [])
      .filter((m) => periodoOk && (m.fim ?? "9999-12-31") >= inicio && m.inicio <= fim)
      .sort((a, b) => a.inicio.localeCompare(b.inicio))
      .map((m) => ({ m, equipe: equipePorId.get(m.equipeId) }));
    const terminam = dados.equipes.filter((e) => e.grupo !== "Apoio" && e.fim && e.fim >= inicio && e.fim <= fim).sort((a, b) => (a.fim ?? "").localeCompare(b.fim ?? ""));
    const comecam = dados.equipes.filter((e) => e.grupo !== "Apoio" && e.inicio && e.inicio >= inicio && e.inicio <= fim).sort((a, b) => (a.inicio ?? "").localeCompare(b.inicio ?? ""));
    return { passagens, terminam, comecam };
  }, [dados.movimentosEquipe, dados.equipes, equipePorId, inicio, fim, periodoOk]);

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
        {
          nome: "Por equipe",
          cabecalho: ["Contrato", "Equipe", "Código", "Posições", "Com nome", "Sem nome informado", "Vagas abertas", "Em equipe", "Ausentes", "% preenchido"],
          linhas: efetivo.porEquipe.map(({ e, contrato, c }) => [rotuloContrato(contrato), e.nome, e.codigo, c.posicoes, c.comNome, c.semNome, c.abertas, c.emEquipe, c.ausentes, c.posicoes ? Math.round(((c.comNome + c.semNome) / c.posicoes) * 100) : 0]),
        },
        { nome: "Por função", cabecalho: ["Função", "Posições", "Com nome", "Sem nome informado", "Vagas abertas"], linhas: efetivo.funcoes.map((f) => [f.cargo, f.vagas, f.comNome, f.semNome, f.abertas]) },
        { nome: "Vagas abertas", cabecalho: ["Contrato", "Equipe", "Função", "Empresa", "Atividade", "Situação"], linhas: efetivo.abertas.map((a) => [a.contrato, a.equipe, a.cargo, a.empresa, a.atividade, a.situacao]) },
      ];
    if (qual === "pessoas" && pessoas)
      return [
        { nome: "Passam a ficar disponíveis", cabecalho: ["Nome", "Função", "Empresa", "Equipe", "Disponível a partir de"], linhas: pessoas.ficam.map(({ v, desde }) => [v.nome ?? "", v.cargo, v.empresa, rotuloEquipe(equipePorId.get(v.equipeId) ?? { codigo: "", nome: "", grupo: "" }), fmtDia(desde)]) },
        { nome: "Já disponíveis", cabecalho: ["Nome", "Função", "Empresa", "Origem"], linhas: pessoas.jaDisponiveis.map((v) => [v.nome ?? "", v.cargo, v.empresa, v.contratoAtual ?? ""]) },
        { nome: "Por semana", cabecalho: ["Semana", "Em equipe", "Ausentes", "Disponíveis", "Em outro contrato"], linhas: pessoas.colunas.map((c) => [c.dica, ...c.valores]) },
      ];
    if (qual === "ausencias")
      return [{ nome: "Ausências", cabecalho: ["Pessoa", "Equipe", "Tipo", "Início", "Fim", "Dias no período"], linhas: aus.lista.map((x) => [x.v?.nome ?? "", x.equipe ? rotuloEquipe(x.equipe) : "", x.a.tipo, fmtDia(x.a.inicio), fmtDia(x.a.fim), x.diasNoPeriodo]) }];
    if (qual === "movimentos")
      return [
        { nome: "Passagens", cabecalho: ["Equipe", "Contrato", "Frente / local", "De", "Até", "Observação"], linhas: mov.passagens.map(({ m, equipe }) => [equipe?.nome ?? "", rotuloContrato(m.projeto), m.local ?? "", fmtDia(m.inicio), m.fim ? fmtDia(m.fim) : "em curso", m.observacao ?? ""]) },
        { nome: "Equipes que terminam", cabecalho: ["Equipe", "Contrato", "Fim", "Pessoas"], linhas: mov.terminam.map((e) => [e.nome, rotuloContrato(e.projeto), fmtDia(e.fim), (vagasPorEquipe.get(e.id) ?? []).filter(temNome).length]) },
        { nome: "Equipes que começam", cabecalho: ["Equipe", "Contrato", "Início", "Pessoas"], linhas: mov.comecam.map((e) => [e.nome, rotuloContrato(e.projeto), fmtDia(e.inicio), (vagasPorEquipe.get(e.id) ?? []).filter(temNome).length]) },
      ];
    return [{ nome: "Frota", cabecalho: ["Viatura", "Placa", "Modelo", "Situação", "Equipe", "Pessoas"], linhas: frota.linhas.map((l) => [l.v.identificacao, l.v.placa ?? "", l.v.modelo ?? "", l.v.status, l.eq?.nome ?? "", l.ocupantes]) }];
  }, [qual, efetivo, pessoas, aus, mov, frota, equipePorId, vagasPorEquipe]);

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

  const titulo: Record<Relatorio, string> = { efetivo: "Efetivo e vagas", pessoas: "Pessoas e disponibilidade", ausencias: "Férias e ausências", movimentos: "Equipes e movimentações", frota: "Frota" };
  const usaPeriodo = qual !== "frota";
  const r = efetivo.r;

  return (
    <div className="space-y-5">
      <CabecalhoPagina
        titulo="Relatórios"
        subtitulo="Para mostrar à gestão e ao cliente: escolha o relatório e o período; dá para baixar em Excel ou imprimir. Os números são os mesmos do Painel."
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
            { id: "efetivo", rotulo: "Efetivo e vagas" },
            { id: "pessoas", rotulo: "Pessoas" },
            { id: "ausencias", rotulo: "Férias e ausências" },
            { id: "movimentos", rotulo: "Equipes" },
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
            <Numero rotulo="Posições" valor={r.posicoes} sub={`${r.equipes} equipes · em ${fmtDia(inicio)}`} />
            <Numero rotulo="Com nome" valor={r.comNome} sub={`${Math.round(((r.comNome + r.semNome) / Math.max(1, r.posicoes)) * 100)}% preenchido`} cor={COR.emEquipe} />
            <Numero rotulo="Sem nome informado" valor={r.semNome} sub="preenchidas, nome não informado" />
            <Numero rotulo="Vagas abertas" valor={r.abertas} sub="para contratar ou puxar" cor={COR.aberta} />
          </Faixa>

          <div className="grid items-start gap-5 xl:grid-cols-2">
            <Secao titulo="Posições por equipe" sub="Com nome, sem nome informado e vagas abertas, em cada equipe.">
              <BarrasHorizontais
                itens={efetivo.porEquipe.map(({ e, c }) => ({ rotulo: e.nome, partes: [c.comNome, c.semNome, c.abertas], sub: `${c.posicoes} posições` }))}
                series={[
                  { nome: "Com nome", cor: COR.emEquipe },
                  { nome: "Sem nome informado", cor: COR.semNome },
                  { nome: "Vaga aberta", cor: "#F2D48B", listrada: true },
                ]}
              />
              <Legenda className="mt-3" series={[{ nome: "Com nome", cor: COR.emEquipe }, { nome: "Sem nome informado", cor: COR.semNome }, { nome: "Vaga aberta", cor: "#F2D48B", listrada: true }]} />
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
                  <Rosca partes={efetivo.empresasPessoas.map(([e, n], k) => ({ n, cor: CORES_EMPRESA[k % CORES_EMPRESA.length], rotulo: e }))} centro={{ valor: r.comNome, rotulo: "pessoas" }} />
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

          <Secao titulo="Por equipe" sub="Contrato, equipe e a situação de cada uma." semPadding>
            <TabelaSimples t={tabelas[0]} />
          </Secao>
          <Secao titulo="Vagas abertas" sub="Cada vaga a preencher, com contrato e equipe." semPadding>
            <TabelaSimples t={tabelas[2]} vazio="Nenhuma vaga aberta." />
          </Secao>
          <Secao titulo="Posições por função" semPadding>
            <TabelaSimples t={tabelas[1]} />
          </Secao>
        </>
      )}

      {/* ------------------------------------------------ pessoas */}
      {qual === "pessoas" && pessoas && (
        <>
          <Faixa>
            <Numero rotulo="Disponíveis no início" valor={pessoas.jaDisponiveis.length} sub="sem equipe, podem ser puxados" cor={COR.disponivel} />
            <Numero rotulo="Passam a ficar disponíveis" valor={pessoas.ficam.length} sub="equipe que termina, apoio liberado" cor={COR.emEquipe} />
            <Numero rotulo="Ausentes no início" valor={r.ausentes} sub="férias, INSS, em contratação" cor={COR.ausente} />
            <Numero rotulo="Período" valor={`${dias} dias`} sub={`${fmtDiaCurto(inicio)} a ${fmtDiaCurto(fim)}`} />
          </Faixa>
          <Secao titulo="Pessoas por situação, semana a semana" sub="Em equipe, ausentes e disponíveis a cada segunda-feira do período.">
            <ColunasEmpilhadas colunas={pessoas.colunas} series={seriesPessoas} altura={230} />
            <Legenda series={seriesPessoas} className="mt-2" />
          </Secao>
          <Secao titulo="Passam a ficar disponíveis no período" sub="A equipe termina ou a pessoa é liberada de outro contrato." semPadding>
            <TabelaSimples t={tabelas[0]} vazio="Ninguém passa a ficar disponível neste período." />
          </Secao>
          <Secao titulo="Já disponíveis" sub="Sem equipe na data inicial." semPadding>
            <TabelaSimples t={tabelas[1]} vazio="Ninguém disponível." />
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

      {/* ------------------------------------------------ equipes e movimentações */}
      {qual === "movimentos" && (
        <>
          <Faixa>
            <Numero rotulo="Equipes ativas" valor={r.equipes} sub={`em ${r.contratos} contratos`} />
            <Numero rotulo="Passagens no período" valor={mov.passagens.length} sub="equipes por contrato/frente" cor={COR.disponivel} />
            <Numero rotulo="Equipes que terminam" valor={mov.terminam.length} sub="as pessoas ficam disponíveis" cor={COR.aberta} />
            <Numero rotulo="Equipes que começam" valor={mov.comecam.length} />
          </Faixa>
          <Secao titulo="Passagens das equipes" sub="Cada vez que uma equipe foi (ou vai) para um contrato ou frente." semPadding>
            <TabelaSimples t={tabelas[0]} vazio="Nenhuma movimentação de equipe neste período." />
          </Secao>
          <Secao titulo="Equipes que terminam no período" semPadding>
            <TabelaSimples t={tabelas[1]} vazio="Nenhuma equipe termina neste período." />
          </Secao>
          <Secao titulo="Equipes que começam no período" semPadding>
            <TabelaSimples t={tabelas[2]} vazio="Nenhuma equipe começa neste período." />
          </Secao>
        </>
      )}

      {/* ------------------------------------------------ frota */}
      {qual === "frota" && (
        <>
          <Faixa>
            <Numero rotulo="Viaturas" valor={frota.linhas.length} />
            <Numero rotulo="Em operação" valor={frota.porStatus.find(([s]) => s === "Em operação")?.[1] ?? 0} cor={COR.emEquipe} />
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
