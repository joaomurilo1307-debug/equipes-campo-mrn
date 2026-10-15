"use client";

// Vagas: tudo o que está aberto nas equipes, por contrato e equipe, com quem está disponível para ocupar cada uma.
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { temNome } from "@/lib/efetivos/disponibilidade";
import { familiaDoCargo } from "@/lib/efetivos/cruzarAbas";
import { useDados } from "./DadosContext";
import { A_DEFINIR, chamar, corDoContrato, fmtDia, rotuloContrato, type Equipe, type Vaga } from "./comum";
import { IcMais } from "./icones";
import { ModalPuxar } from "./modais/ModaisVagas";
import { Aviso, CabecalhoPagina, PontoContrato, Vazio } from "./ui";

export default function Vagas() {
  const params = useSearchParams();
  const { dados, hoje, equipesCampo, vagasPorEquipe, situacaoDe, contratoNoDia, nomeDe, recarregar } = useDados();
  const podeEditar = dados.podeEditar;
  const [busca, setBusca] = useState("");
  const [contrato, setContrato] = useState("");
  const [equipeFiltro, setEquipeFiltro] = useState(params.get("equipe") ?? "");
  const [empresa, setEmpresa] = useState("");
  const [funcao, setFuncao] = useState("");
  const [estado, setEstado] = useState<"" | "aberta" | "contratando">("");
  const [puxar, setPuxar] = useState<{ equipe: Equipe; vaga: Vaga } | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  // pessoas disponíveis agora (sem equipe, ou cuja equipe terminou): quem pode ocupar uma vaga
  const disponiveis = useMemo(() => dados.vagas.filter((v) => temNome(v) && situacaoDe(v).situacao === "DISPONIVEL"), [dados.vagas]); // eslint-disable-line react-hooks/exhaustive-deps

  const abertas = useMemo(() => {
    const t = busca.trim().toLowerCase();
    const out: { v: Vaga; e: Equipe; contrato: string; compativeis: Vaga[] }[] = [];
    for (const e of equipesCampo) {
      for (const v of vagasPorEquipe.get(e.id) ?? []) {
        if (situacaoDe(v).situacao !== "VAGA_ABERTA") continue;
        out.push({ v, e, contrato: contratoNoDia(e) || A_DEFINIR, compativeis: disponiveis.filter((p) => familiaDoCargo(p.cargo) === familiaDoCargo(v.cargo)) });
      }
    }
    return out
      .filter((x) => !contrato || x.contrato === contrato)
      .filter((x) => !equipeFiltro || x.e.id === equipeFiltro)
      .filter((x) => !empresa || x.v.empresa === empresa)
      .filter((x) => !funcao || x.v.cargo === funcao)
      .filter((x) => !estado || (estado === "contratando" ? x.v.status === "Em contratação" : x.v.status !== "Em contratação"))
      .filter((x) => !t || `${x.v.cargo} ${x.v.empresa} ${x.e.nome} ${x.contrato}`.toLowerCase().includes(t));
  }, [equipesCampo, vagasPorEquipe, disponiveis, busca, contrato, equipeFiltro, empresa, funcao, estado, dados]); // eslint-disable-line react-hooks/exhaustive-deps

  const todas = useMemo(() => equipesCampo.flatMap((e) => (vagasPorEquipe.get(e.id) ?? []).filter((v) => situacaoDe(v).situacao === "VAGA_ABERTA")), [equipesCampo, vagasPorEquipe, dados]); // eslint-disable-line react-hooks/exhaustive-deps
  const contratosLista = [...new Set(equipesCampo.map((e) => contratoNoDia(e) || A_DEFINIR))].sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }));
  const empresas = [...new Set(todas.map((v) => v.empresa))].sort();
  const funcoes = [...new Set(todas.map((v) => v.cargo))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const contratando = todas.filter((v) => v.status === "Em contratação").length;
  const porEmpresa = empresas.map((e) => [e, todas.filter((v) => v.empresa === e).length] as const);

  // contrato -> equipe -> vagas
  const grupos = useMemo(() => {
    const m = new Map<string, Map<string, typeof abertas>>();
    for (const x of abertas) {
      if (!m.has(x.contrato)) m.set(x.contrato, new Map());
      const eq = m.get(x.contrato)!;
      if (!eq.has(x.e.id)) eq.set(x.e.id, []);
      eq.get(x.e.id)!.push(x);
    }
    return [...m.entries()].sort(([a], [b]) => (a === A_DEFINIR ? 1 : b === A_DEFINIR ? -1 : a.localeCompare(b, "pt-BR", { numeric: true })));
  }, [abertas]);

  async function alternarContratacao(v: Vaga) {
    const r = await chamar("PATCH", `/api/efetivos/vagas/${v.id}`, { status: v.status === "Em contratação" ? "Vigente" : "Em contratação" });
    if (!r.ok) return setAviso(r.dados.error ?? "Não foi possível alterar");
    await recarregar();
  }
  async function excluir(v: Vaga) {
    if (!window.confirm(`Excluir esta vaga de ${v.cargo}? Ela some da equipe (use só para vaga aberta por engano).`)) return;
    const r = await chamar("DELETE", `/api/efetivos/vagas/${v.id}`);
    if (!r.ok) return setAviso(r.dados.error ?? "Não foi possível excluir");
    await recarregar();
  }

  return (
    <div>
      <CabecalhoPagina
        titulo="Vagas"
        subtitulo="O que está aberto nas equipes. Preencha puxando quem está disponível, marque o que está em contratação ou abra mais vagas e cargos novos."
        acoes={
          podeEditar && (
            <Link href="/vagas/abrir" className="btn-primary">
              <IcMais tam={16} /> Abrir vaga / novo cargo
            </Link>
          )
        }
      />
      {aviso && (
        <div className="mb-4 cursor-pointer" onClick={() => setAviso(null)}>
          <Aviso tipo="atencao">{aviso}</Aviso>
        </div>
      )}

      <section className="card mb-4 overflow-hidden">
        <div className="grid grid-cols-2 divide-x divide-line sm:grid-cols-4">
          <div className="px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Vagas abertas</div>
            <div className="num font-display text-[22px] font-semibold" style={{ color: "#B86E00" }}>
              {todas.length}
            </div>
            <div className="text-[11.5px] text-gray-500">em {new Set(todas.map((v) => v.equipeId)).size} equipes</div>
          </div>
          <div className="px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Em contratação</div>
            <div className="num font-display text-[22px] font-semibold text-info">{contratando}</div>
            <div className="text-[11.5px] text-gray-500">{todas.length - contratando} só abertas</div>
          </div>
          <div className="px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Disponíveis</div>
            <div className="num font-display text-[22px] font-semibold text-ok">{disponiveis.length}</div>
            <div className="text-[11.5px] text-gray-500">sem equipe, podem ocupar uma vaga</div>
          </div>
          <div className="px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Por empresa</div>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[12.5px]">
              {porEmpresa.map(([e, n]) => (
                <span key={e}>
                  {e} <strong className="num text-ink">{n}</strong>
                </span>
              ))}
              {porEmpresa.length === 0 && <span className="text-gray-400">—</span>}
            </div>
          </div>
        </div>
      </section>

      <div className="no-print mb-3 flex flex-wrap items-end gap-2.5">
        <label className="min-w-[200px] flex-1 text-xs">
          <span className="label">Buscar</span>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="função, empresa, equipe…" className="field !mt-0.5 !py-1.5" />
        </label>
        <label className="text-xs">
          <span className="label">Contrato</span>
          <select value={contrato} onChange={(e) => setContrato(e.target.value)} className="field !mt-0.5 !w-auto !py-1.5">
            <option value="">Todos</option>
            {contratosLista.map((c) => (
              <option key={c} value={c}>
                {rotuloContrato(c)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          <span className="label">Equipe</span>
          <select value={equipeFiltro} onChange={(e) => setEquipeFiltro(e.target.value)} className="field !mt-0.5 !w-auto !py-1.5">
            <option value="">Todas</option>
            {equipesCampo.map((e) => (
              <option key={e.id} value={e.id}>
                {e.codigo} · {e.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          <span className="label">Função</span>
          <select value={funcao} onChange={(e) => setFuncao(e.target.value)} className="field !mt-0.5 !w-auto !py-1.5">
            <option value="">Todas</option>
            {funcoes.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          <span className="label">Empresa</span>
          <select value={empresa} onChange={(e) => setEmpresa(e.target.value)} className="field !mt-0.5 !w-auto !py-1.5">
            <option value="">Todas</option>
            {empresas.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          <span className="label">Situação</span>
          <select value={estado} onChange={(e) => setEstado(e.target.value as typeof estado)} className="field !mt-0.5 !w-auto !py-1.5">
            <option value="">Todas</option>
            <option value="aberta">Abertas</option>
            <option value="contratando">Em contratação</option>
          </select>
        </label>
      </div>

      <div className="card overflow-hidden">
        {grupos.length === 0 ? (
          <Vazio titulo="Nenhuma vaga aberta neste filtro" texto={podeEditar ? "Use “Abrir vaga / novo cargo” para aumentar uma equipe." : undefined} />
        ) : (
          <table className="w-full text-[12.5px]">
            <thead className="bg-gray-50 text-[10.5px] font-semibold uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-2 text-left">Função</th>
                <th className="px-3 py-2 text-left">Empresa</th>
                <th className="px-3 py-2 text-left">Atividade</th>
                <th className="px-3 py-2 text-left">Nível</th>
                <th className="px-3 py-2 text-left">Situação</th>
                <th className="px-3 py-2 text-right" title="Pessoas disponíveis com função da mesma família">
                  Disponíveis p/ esta função
                </th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            {grupos.map(([codigo, equipes]) => (
              <tbody key={codigo}>
                <tr className="border-t border-line bg-gray-50/80">
                  <td colSpan={7} className="px-4 py-2">
                    <span className="inline-flex items-center gap-2 font-display text-[13.5px] font-semibold text-ink">
                      <PontoContrato cor={corDoContrato(codigo)} />
                      {rotuloContrato(codigo)}
                      <span className="num text-[11px] font-normal text-gray-500">{[...equipes.values()].reduce((s, l) => s + l.length, 0)} vagas</span>
                    </span>
                  </td>
                </tr>
                {[...equipes.entries()].map(([equipeId, lista]) => {
                  const e = lista[0].e;
                  return [
                    <tr key={`${equipeId}-t`} className="border-t border-gray-100">
                      <td colSpan={7} className="px-4 py-1.5 pl-8">
                        <span className="inline-flex items-center gap-3 text-[12.5px] font-semibold text-gray-700">
                          {e.nome}
                          <span className="font-mono text-[10.5px] font-normal text-gray-400">{e.codigo}</span>
                          <Link href={`/equipes?equipe=${e.id}`} className="text-[11px] font-semibold text-brand-dark hover:underline">
                            abrir equipe
                          </Link>
                          {podeEditar && (
                            <Link href={`/vagas/abrir?equipe=${e.id}`} className="text-[11px] font-semibold text-brand-dark hover:underline">
                              + vaga
                            </Link>
                          )}
                        </span>
                      </td>
                    </tr>,
                    ...lista.map(({ v, compativeis }) => (
                      <tr key={v.id} className="border-t border-gray-100 hover:bg-gray-50/60">
                        <td className="px-4 py-1.5 pl-10 text-ink">{v.cargo}</td>
                        <td className="px-3 py-1.5 text-gray-600">{v.empresa}</td>
                        <td className="px-3 py-1.5 text-gray-600">{v.atividade}</td>
                        <td className="px-3 py-1.5 text-gray-500">{v.nivel ?? "—"}</td>
                        <td className="px-3 py-1.5">
                          {v.status === "Em contratação" ? <span className="chip-info">em contratação{v.previsaoInicio ? ` · ${fmtDia(v.previsaoInicio)}` : ""}</span> : <span className="chip-warn">aberta</span>}
                        </td>
                        <td className="num px-3 py-1.5 text-right" title={compativeis.slice(0, 6).map(nomeDe).join(", ")}>
                          {compativeis.length > 0 ? <strong className="text-ok">{compativeis.length}</strong> : <span className="text-gray-300">0</span>}
                        </td>
                        <td className="whitespace-nowrap px-3 py-1.5 text-right">
                          {podeEditar && (
                            <>
                              <button onClick={() => setPuxar({ equipe: e, vaga: v })} className="rounded-md px-1.5 py-1 text-[11px] font-semibold text-brand-dark hover:bg-brand-soft">
                                preencher
                              </button>
                              <button onClick={() => alternarContratacao(v)} className="rounded-md px-1.5 py-1 text-[11px] font-semibold text-gray-500 hover:bg-gray-100">
                                {v.status === "Em contratação" ? "só aberta" : "em contratação"}
                              </button>
                              <button onClick={() => excluir(v)} className="rounded-md px-1.5 py-1 text-[11px] font-semibold text-gray-400 hover:bg-bad-soft hover:text-bad">
                                excluir
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    )),
                  ];
                })}
              </tbody>
            ))}
          </table>
        )}
      </div>
      {puxar && <ModalPuxar equipe={puxar.equipe} vagaPreSelecionada={puxar.vaga} onFechar={() => setPuxar(null)} />}
      <p className="mt-3 text-[11.5px] text-gray-400">Posição preenchida sem nome informado não é vaga: ela já tem alguém. Só entram aqui as marcadas como “Vago” ou “Em contratação”. Hoje: {fmtDia(hoje)}.</p>
    </div>
  );
}
