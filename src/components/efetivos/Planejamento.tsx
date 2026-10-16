"use client";

// Planejamento: escolha um dia e veja quem está livre, quem fica livre nas próximas semanas (equipe que termina libera
// as pessoas no dia seguinte), quais equipes começam e o planejamento de início/fim de cada equipe — que se preenche aqui mesmo.
// Sem fim previsto, o sistema não tem como saber quando alguém fica livre: por isso a tabela de planejamento fica no topo do trabalho.
import Link from "next/link";
import { useMemo, useState } from "react";
import { diferencaDias, somarDias, temNome, type Dia } from "@/lib/efetivos/disponibilidade";
import { useDados } from "./DadosContext";
import { ColunasEmpilhadas, Legenda, type Coluna, type Serie } from "./graficos";
import { A_DEFINIR, chamar, corDoContrato, fmtDia, fmtDiaCurto, rotuloContrato, segundaDaSemana, type Equipe, type Vaga } from "./comum";
import { Aviso, CabecalhoPagina, PontoContrato, Secao, Segmentado, Vazio } from "./ui";

const AZUL = "#2F6FDE";
const SEMANAS = 26;
const HORIZONTES = [
  { id: "30", rotulo: "30 dias" },
  { id: "60", rotulo: "60 dias" },
  { id: "90", rotulo: "90 dias" },
  { id: "180", rotulo: "6 meses" },
];

type Linha = { v: Vaga; e: Equipe | undefined; desde: Dia | null; motivo: string };

export default function Planejamento() {
  const { dados, hoje, equipesCampo, vagasPorEquipe, equipePorId, situacaoDe, nomeDe, recarregar, contratoNoDia } = useDados();
  const podeEditar = dados.podeEditar;
  const [dia, setDia] = useState<Dia>(hoje);
  const [horizonte, setHorizonte] = useState("60");
  const [contrato, setContrato] = useState("");
  const [busca, setBusca] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const h = Number(horizonte);
  const limite = somarDias(dia, h);

  const contratosLista = useMemo(() => [...new Set(equipesCampo.map((e) => contratoNoDia(e, hoje) || A_DEFINIR))].sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true })), [equipesCampo, contratoNoDia, hoje]);
  const noContrato = (e: Equipe | undefined) => !contrato || (!!e && (contratoNoDia(e, dia) || A_DEFINIR) === contrato);
  const t = busca.trim().toLowerCase();

  // quem está livre no dia escolhido (a mesma regra do resto do sistema: equipe encerrada ou fora de equipe)
  const livres: Linha[] = useMemo(() => {
    const out: Linha[] = [];
    for (const v of dados.vagas) {
      if (!temNome(v) || v.status === "Desmobilizado") continue;
      const s = situacaoDe(v, dia);
      if (s.situacao !== "DISPONIVEL") continue;
      const e = equipePorId.get(v.equipeId);
      const reserva = !e || e.grupo === "Apoio";
      const desde = reserva ? v.disponivelAPartir : e?.fim ? somarDias(e.fim, 1) : null;
      out.push({ v, e: reserva ? undefined : e, desde, motivo: s.motivo ?? "" });
    }
    return out.sort((a, b) => (a.desde ?? "").localeCompare(b.desde ?? "") || (a.v.nome ?? "").localeCompare(b.v.nome ?? "", "pt-BR"));
  }, [dados, dia, situacaoDe, equipePorId]);
  const livresFiltrados = livres.filter((l) => noContrato(l.e) && (!t || `${l.v.nome} ${l.v.cargo} ${l.e?.nome ?? ""}`.toLowerCase().includes(t)));

  // equipes que terminam nos próximos dias (liberam gente) e as que começam
  const vagasDe = (e: Equipe) => (vagasPorEquipe.get(e.id) ?? []).filter((v) => temNome(v) && v.status !== "Desmobilizado");
  const terminam = useMemo(
    () =>
      equipesCampo
        .filter((e) => e.fim && e.fim >= dia && e.fim <= limite && noContrato(e) && (!t || e.nome.toLowerCase().includes(t)))
        .sort((a, b) => a.fim!.localeCompare(b.fim!)),
    [equipesCampo, dia, limite, contrato, t] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const comecam = useMemo(
    () =>
      equipesCampo
        .filter((e) => e.inicio && e.inicio > dia && e.inicio <= limite && noContrato(e) && (!t || e.nome.toLowerCase().includes(t)))
        .sort((a, b) => a.inicio!.localeCompare(b.inicio!)),
    [equipesCampo, dia, limite, contrato, t] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const aEntrar = useMemo(
    () =>
      dados.vagas
        .filter((v) => v.previsaoInicio && v.previsaoInicio >= dia && v.previsaoInicio <= limite)
        .map((v) => ({ v, e: equipePorId.get(v.equipeId) }))
        .filter((x) => noContrato(x.e))
        .sort((a, b) => a.v.previsaoInicio!.localeCompare(b.v.previsaoInicio!)),
    [dados.vagas, dia, limite, contrato, equipePorId] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // planejamento: todas as equipes de campo, com início e fim editáveis
  const planejamento = useMemo(
    () => equipesCampo.filter((e) => noContrato(e) && (!t || `${e.nome} ${e.codigo}`.toLowerCase().includes(t))),
    [equipesCampo, contrato, t, dia] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const semFim = equipesCampo.filter((e) => !e.fim).length;
  const semPeriodo = equipesCampo.filter((e) => !e.inicio && !e.fim).length;

  // livres a cada semana (a partir da semana do dia escolhido)
  const colunas: Coluna[] = useMemo(() => {
    const ini = segundaDaSemana(dia);
    return Array.from({ length: SEMANAS }, (_, k) => {
      const seg = somarDias(ini, k * 7);
      let n = 0;
      let amb = 0;
      for (const v of dados.vagas) {
        if (!temNome(v) || v.status === "Desmobilizado") continue;
        const s = situacaoDe(v, seg).situacao;
        if (s === "DISPONIVEL") n++;
        else if (s === "AUSENTE") amb++;
      }
      return { rotulo: fmtDiaCurto(seg), dica: `Semana de ${fmtDia(seg)}: ${n} livre${n === 1 ? "" : "s"}${amb ? ` · ${amb} ausente${amb === 1 ? "" : "s"}` : ""}`, valores: [n, amb], destaque: k === 0 };
    });
  }, [dados, dia, situacaoDe]);
  const series: Serie[] = [
    { nome: "Livres", cor: AZUL },
    { nome: "Ausentes (férias, INSS...)", cor: "#E63329" },
  ];
  const haLivreNoPeriodo = colunas.some((c) => c.valores[0] > 0);

  async function salvar(e: Equipe, campo: "inicio" | "fim", valor: string) {
    setErro(null);
    const novo = valor || null;
    const inicio = campo === "inicio" ? novo : e.inicio;
    const fim = campo === "fim" ? novo : e.fim;
    if (inicio && fim && fim < inicio) return setErro(`${e.nome}: o fim (${fmtDia(fim)}) não pode ser antes do início (${fmtDia(inicio)}).`);
    const r = await chamar("PATCH", `/api/efetivos/equipes/${e.id}`, { [campo]: novo });
    if (!r.ok) return setErro(r.dados.error ?? "Não foi possível salvar");
    await recarregar();
  }

  const situacaoPeriodo = (e: Equipe): { rotulo: string; chip: string } => {
    if (!e.inicio && !e.fim) return { rotulo: "sem período", chip: "chip-mute" };
    if (e.inicio && dia < e.inicio) return { rotulo: `começa em ${fmtDiaCurto(e.inicio)}`, chip: "chip-info" };
    if (e.fim && dia > e.fim) return { rotulo: `encerrada em ${fmtDiaCurto(e.fim)}`, chip: "chip-warn" };
    if (!e.fim) return { rotulo: "em curso · sem fim", chip: "chip-warn" };
    const resta = diferencaDias(dia, e.fim);
    return { rotulo: resta === 0 ? "termina hoje" : `termina em ${resta} dia${resta === 1 ? "" : "s"}`, chip: "chip-ok" };
  };

  return (
    <div>
      <CabecalhoPagina
        titulo="Planejamento"
        subtitulo="Início e fim de cada equipe e quem fica livre quando. As datas se preenchem aqui, ou na base em Excel (aba EQUIPES). Para ver quem está livre numa data, use a Consulta."
      />

      <div className="card mb-4 flex flex-wrap items-end gap-3 p-3.5">
        <label>
          <span className="label">Data</span>
          <input type="date" value={dia} onChange={(e) => e.target.value && setDia(e.target.value)} className="field" />
        </label>
        <div className="flex gap-1 pb-0.5">
          {[
            ["Hoje", 0],
            ["+7 dias", 7],
            ["+30 dias", 30],
            ["+60 dias", 60],
            ["+90 dias", 90],
          ].map(([r, n]) => (
            <button key={r as string} onClick={() => setDia(somarDias(hoje, n as number))} className="btn-ghost btn-sm">
              {r}
            </button>
          ))}
        </div>
        <label>
          <span className="label">Contrato</span>
          <select value={contrato} onChange={(e) => setContrato(e.target.value)} className="field">
            <option value="">Todos</option>
            {contratosLista.map((c) => (
              <option key={c} value={c}>
                {rotuloContrato(c)}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-[180px] flex-1">
          <span className="label">Buscar</span>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="pessoa, função ou equipe" className="field" />
        </label>
        <div>
          <span className="label">Olhar para frente</span>
          <Segmentado valor={horizonte} onChange={setHorizonte} opcoes={HORIZONTES} />
        </div>
      </div>

      {erro && (
        <div className="mb-3">
          <Aviso tipo="erro">{erro}</Aviso>
        </div>
      )}

      {semFim > 0 && (
        <div className="mb-4">
          <Aviso tipo="atencao">
            <strong>{semFim} de {equipesCampo.length} equipes não têm data de fim</strong>
            {semPeriodo > 0 ? ` (${semPeriodo} não têm nem início)` : ""}. Sem o fim, o sistema não sabe quando as pessoas da equipe ficam livres: elas aparecem como "em equipe" para sempre.{" "}
            {podeEditar ? <>Preencha o início e o fim na tabela abaixo, ou baixe a base em <Link href="/base" className="font-semibold underline">Base</Link>, preencha as colunas amarelas e envie de volta.</> : "Peça a quem edita para preencher as datas."}
          </Aviso>
        </div>
      )}

      <section className="card mb-4 overflow-hidden" aria-label="Resumo da data">
        <div className="grid grid-cols-2 divide-x divide-line sm:grid-cols-4">
          <Link href={`/consulta?situacao=livres&data=${dia}`} className="block hover:bg-gray-50"><Numero rotulo={`Livres em ${fmtDia(dia)}`} valor={livres.length} sub="ver quem está livre na Consulta" cor={AZUL} /></Link>
          <Numero rotulo={`Ficam livres até ${fmtDiaCurto(limite)}`} valor={terminam.reduce((s, e) => s + vagasDe(e).length, 0)} sub={`${terminam.length} equipe${terminam.length === 1 ? "" : "s"} terminam`} cor="#B86E00" />
          <Numero rotulo="Equipes que começam" valor={comecam.length} sub={`até ${fmtDiaCurto(limite)}`} cor="#0E8F63" />
          <Numero rotulo="Sem fim previsto" valor={semFim} sub="equipes sem data de fim" cor={semFim ? "#B86E00" : "#0E8F63"} />
        </div>
      </section>

      <div className="mb-4 grid items-stretch gap-4">
        <Secao titulo={`Livres por semana, a partir de ${fmtDiaCurto(segundaDaSemana(dia))}`} sub="Pessoas livres e ausentes a cada segunda-feira, nas próximas 26 semanas.">
          {haLivreNoPeriodo ? (
            <>
              <ColunasEmpilhadas colunas={colunas} series={series} altura={250} rotuloEixo="Pessoas livres por semana" />
              <Legenda series={series} className="mt-2" />
            </>
          ) : (
            <Vazio titulo="Ninguém fica livre nas próximas 26 semanas" texto={semFim > 0 ? "Nenhuma equipe tem fim previsto dentro desse período." : "Todas as equipes seguem além desse período."} />
          )}
        </Secao>
      </div>

      <div className="mb-4 grid items-stretch gap-4 lg:grid-cols-2">
        <Secao titulo={`Equipes que terminam até ${fmtDiaCurto(limite)}`} sub="No dia seguinte ao fim as pessoas ficam livres." semPadding>
          {terminam.length === 0 ? (
            <Vazio titulo="Nenhuma equipe termina nesse período" />
          ) : (
            <ul className="divide-y divide-line text-[12.5px]">
              {terminam.map((e) => {
                const ps = vagasDe(e);
                return (
                  <li key={e.id} className="flex items-center justify-between gap-3 px-4 py-2">
                    <span className="flex min-w-0 items-center gap-2">
                      <PontoContrato cor={corDoContrato(e.projeto)} tam={8} />
                      <span className="min-w-0">
                        <Link href={`/equipes?equipe=${e.id}`} className="block truncate font-medium hover:underline">{e.nome}</Link>
                        <span className="block text-[10.5px] text-gray-400">{rotuloContrato(e.projeto)} · {ps.length} pessoa{ps.length === 1 ? "" : "s"}</span>
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="num block font-semibold">termina {fmtDia(e.fim)}</span>
                      <span className="block text-[10.5px] text-info">livres a partir de {fmtDia(somarDias(e.fim!, 1))}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Secao>
        <Secao titulo={`Entradas previstas até ${fmtDiaCurto(limite)}`} sub="Equipes que começam e profissionais com data de entrada." semPadding>
          {comecam.length === 0 && aEntrar.length === 0 ? (
            <Vazio titulo="Nada previsto nesse período" texto="A data de entrada de quem está em contratação se preenche na Base (coluna Previsão de entrada) ou em editar vaga." />
          ) : (
            <ul className="divide-y divide-line text-[12.5px]">
              {comecam.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 px-4 py-2">
                  <span className="min-w-0">
                    <Link href={`/equipes?equipe=${e.id}`} className="block truncate font-medium hover:underline">{e.nome}</Link>
                    <span className="block text-[10.5px] text-gray-400">equipe · {rotuloContrato(e.projeto)}</span>
                  </span>
                  <span className="num shrink-0 font-semibold text-ok">começa {fmtDia(e.inicio)}</span>
                </li>
              ))}
              {aEntrar.map(({ v, e }) => (
                <li key={v.id} className="flex items-center justify-between gap-3 px-4 py-2">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{v.nome ? nomeDe(v) : `vaga de ${v.cargo}`}</span>
                    <span className="block truncate text-[10.5px] text-gray-400">{v.cargo} · {e?.nome ?? ""}</span>
                  </span>
                  <span className="num shrink-0 font-semibold text-ok">entra {fmtDia(v.previsaoInicio)}</span>
                </li>
              ))}
            </ul>
          )}
        </Secao>
      </div>

      <Secao titulo="Planejamento das equipes: início e fim" sub={podeEditar ? "Preencha as datas direto aqui; salva ao escolher." : "Datas de início e fim de cada equipe."} semPadding>
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead className="bg-gray-50 text-[10.5px] font-semibold uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-3 py-2 text-left">Contrato</th>
                <th className="px-3 py-2 text-left">Equipe</th>
                <th className="px-3 py-2 text-right">Pessoas</th>
                <th className="px-3 py-2 text-left">Início</th>
                <th className="px-3 py-2 text-left">Fim</th>
                <th className="px-3 py-2 text-left">Em {fmtDia(dia)}</th>
                <th className="px-3 py-2 text-left">Libera</th>
              </tr>
            </thead>
            <tbody>
              {planejamento.map((e) => {
                const sp = situacaoPeriodo(e);
                const ps = vagasDe(e).length;
                const c = contratoNoDia(e, hoje) || A_DEFINIR;
                return (
                  <tr key={e.id} className="border-t border-gray-100 align-middle hover:bg-gray-50/60">
                    <td className="px-3 py-1.5">
                      <span className="inline-flex items-center gap-1.5 text-gray-600">
                        <PontoContrato cor={corDoContrato(c)} tam={8} />
                        {rotuloContrato(c)}
                      </span>
                    </td>
                    <td className="px-3 py-1.5">
                      <Link href={`/equipes?equipe=${e.id}`} className="font-medium hover:text-brand-dark hover:underline">{e.nome}</Link>
                      <span className="ml-1.5 font-mono text-[10px] text-gray-400">{e.codigo}</span>
                    </td>
                    <td className="num px-3 py-1.5 text-right">{ps}</td>
                    <td className="px-3 py-1.5">
                      <input type="date" disabled={!podeEditar} value={e.inicio ?? ""} max={e.fim ?? undefined} onChange={(ev) => salvar(e, "inicio", ev.target.value)} className="rounded-md border border-line bg-white px-2 py-1 text-[12px] focus:border-brand focus:outline-none disabled:bg-gray-50" aria-label={`Início de ${e.nome}`} />
                    </td>
                    <td className="px-3 py-1.5">
                      <input type="date" disabled={!podeEditar} value={e.fim ?? ""} min={e.inicio ?? undefined} onChange={(ev) => salvar(e, "fim", ev.target.value)} className={`rounded-md border bg-white px-2 py-1 text-[12px] focus:border-brand focus:outline-none disabled:bg-gray-50 ${e.fim ? "border-line" : "border-warn/50"}`} aria-label={`Fim de ${e.nome}`} />
                    </td>
                    <td className="px-3 py-1.5">
                      <span className={sp.chip}>{sp.rotulo}</span>
                    </td>
                    <td className="px-3 py-1.5 text-gray-600">{e.fim ? `${ps} pessoa${ps === 1 ? "" : "s"} a partir de ${fmtDia(somarDias(e.fim, 1))}` : <span className="text-gray-300">sem fim previsto</span>}</td>
                  </tr>
                );
              })}
              {planejamento.length === 0 && (
                <tr>
                  <td colSpan={7}>
                    <Vazio titulo="Nenhuma equipe neste filtro" />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Secao>
    </div>
  );
}

function Numero({ rotulo, valor, sub, cor }: { rotulo: string; valor: number; sub: string; cor: string }) {
  return (
    <div className="px-4 py-3">
      <div className="text-[10.5px] font-semibold uppercase tracking-wider text-gray-500">{rotulo}</div>
      <div className="num mt-1 font-display text-[26px] font-semibold leading-none" style={{ color: cor }}>
        {valor}
      </div>
      <div className="mt-1 text-[11px] text-gray-500">{sub}</div>
    </div>
  );
}
