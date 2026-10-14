"use client";

// Nova campanha = nova equipe. Uma página só: o pedido, a faixa de datas, quem está livre nela
// e a equipe sendo montada ao lado. Salvar cria (ou atualiza) a campanha junto com a equipe.
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import {
  ATIVIDADES,
  GRUPO_RESERVA,
  PRIORIDADES,
  STATUS_CAMPANHA,
  STATUS_CAMPANHA_QUE_LIBERAM,
  bloqueiosNoPeriodo,
  conferirNecessidade,
  dataValida,
  estadoDaVaga,
  indexar,
  livresNoPeriodo,
  ordenarGrupos,
  trechosLivres,
  type Dia,
} from "@/lib/efetivos/disponibilidade";
import { useDados } from "./DadosContext";
import { A_DEFINIR, campanhaDeApi, chamar, contratosConhecidos, corDaAusencia, descreverConflitos, diasDoPeriodo, fmtDia, fmtDiaCurto, nomeDaEquipeDaCampanha, rotuloContrato, rotuloEquipe, somarDias, type Vaga } from "./comum";
import { IcCheck, IcFechar, IcMais } from "./icones";
import { Aviso, CabecalhoPagina, Secao, Segmentado } from "./ui";

type Trecho = { inicio: Dia; fim: Dia };

const valido = (d: string | null): d is Dia => !!d && dataValida(d);

function fimDoMes(d: Dia): Dia {
  const [a, m] = d.split("-").map(Number);
  return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------- peças

function Rotulo({ t, children, className = "" }: { t: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="label">{t}</span>
      {children}
    </label>
  );
}

/** Livres dia a dia na faixa escolhida: mostra de relance onde a faixa aperta. */
function GraficoLivres({ pontos, total }: { pontos: { dia: Dia; n: number }[]; total: number }) {
  if (pontos.length === 0 || total === 0) return <p className="text-xs text-gray-400">Sem pessoas para mostrar com estes filtros.</p>;
  const W = 300;
  const H = 84;
  const e = 22; // margem esquerda (eixo)
  const b = 14; // margem inferior (datas)
  const iw = W - e - 4;
  const ih = H - b - 6;
  const x = (i: number) => e + (pontos.length === 1 ? iw / 2 : (i / (pontos.length - 1)) * iw);
  const y = (n: number) => 4 + ih - (n / total) * ih;
  const linha = pontos.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.n).toFixed(1)}`).join(" ");
  const area = `${linha} L${x(pontos.length - 1).toFixed(1)},${(4 + ih).toFixed(1)} L${x(0).toFixed(1)},${(4 + ih).toFixed(1)} Z`;
  const min = pontos.reduce((m, p) => (p.n < m.n ? p : m), pontos[0]);
  const imin = pontos.indexOf(min);
  const passo = Math.max(1, Math.floor(pontos.length / 60));
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Pessoas livres por dia, de ${fmtDiaCurto(pontos[0].dia)} a ${fmtDiaCurto(pontos[pontos.length - 1].dia)}; mínimo de ${min.n}`}>
        {[0, total].map((v) => (
          <g key={v}>
            <line x1={e} x2={W - 4} y1={y(v)} y2={y(v)} stroke="#E1E7E3" strokeWidth={1} strokeDasharray={v === 0 ? undefined : "3 3"} />
            <text x={e - 4} y={y(v) + 3} textAnchor="end" fontSize={8.5} fill="#6F7E77">
              {v}
            </text>
          </g>
        ))}
        <path d={area} fill="#0E8F63" fillOpacity={0.14} />
        <path d={linha} fill="none" stroke="#0E8F63" strokeWidth={1.75} strokeLinejoin="round" />
        <circle cx={x(imin)} cy={y(min.n)} r={3} fill="#fff" stroke="#0E8F63" strokeWidth={1.75} />
        <text x={e} y={H - 2} fontSize={8.5} fill="#6F7E77">
          {fmtDiaCurto(pontos[0].dia)}
        </text>
        <text x={W - 4} y={H - 2} textAnchor="end" fontSize={8.5} fill="#6F7E77">
          {fmtDiaCurto(pontos[pontos.length - 1].dia)}
        </text>
        {pontos.map((p, i) =>
          i % passo === 0 ? (
            <rect key={p.dia} x={x(i) - iw / pontos.length / 2} y={0} width={Math.max(2, iw / pontos.length)} height={H - b} fill="transparent">
              <title>{`${fmtDia(p.dia)}: ${p.n} livre${p.n === 1 ? "" : "s"} de ${total}`}</title>
            </rect>
          ) : null
        )}
      </svg>
      <p className="mt-1 text-[11px] text-gray-500">
        {min.n === total ? (
          <>Todos os {total} ficam livres a faixa inteira.</>
        ) : (
          <>
            Menos gente livre em <strong className="text-ink">{fmtDiaCurto(min.dia)}</strong>: {min.n} de {total}.
          </>
        )}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------- tela

export default function MontarCampanha() {
  const params = useSearchParams();
  const { dados, regra, hoje, recarregar, vagaPorId, equipesCampo, campanhaPorId, nomeDe } = useDados();
  const editando = params.get("campanha") ? campanhaPorId.get(params.get("campanha")!) : undefined;
  const podeEditar = dados.podeEditar;

  const projetos = useMemo(() => contratosConhecidos(dados), [dados]);
  const gruposCampanha = useMemo(() => ordenarGrupos([...equipesCampo.map((e) => e.grupo), "Fauna", "Flora"]), [equipesCampo]);
  const gruposOrigem = useMemo(() => ordenarGrupos(dados.equipes.map((e) => e.grupo)), [dados.equipes]);
  const cargosConhecidos = useMemo(() => Array.from(new Set(dados.vagas.map((v) => v.cargo))).sort((a, b) => a.localeCompare(b, "pt-BR")), [dados.vagas]);
  const empresas = useMemo(() => Array.from(new Set(dados.vagas.map((v) => v.empresa))).sort(), [dados.vagas]);

  const pIni = params.get("inicio");
  const pFim = params.get("fim");
  const [f, setF] = useState(() => ({
    projeto: editando ? (editando.projeto === A_DEFINIR ? "" : editando.projeto) : params.get("projeto") ?? "",
    grupo: editando?.grupo ?? params.get("grupo") ?? gruposCampanha[0] ?? "Fauna",
    atividade: editando?.atividade ?? "Resgate",
    local: editando?.local ?? "",
    solicitante: editando?.solicitante ?? "",
    prioridade: editando?.prioridade ?? "Média",
    equipeNome: editando?.equipeNome ?? "",
    status: editando?.status ?? "Nova",
    observacao: editando?.observacao ?? "",
    inicio: (editando?.inicio ?? (valido(pIni) ? pIni : hoje)) as Dia,
    fim: (editando?.fim ?? (valido(pFim) ? pFim : somarDias(hoje, 27))) as Dia,
  }));
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const [nec, setNec] = useState<{ cargo: string; qtd: number }[]>(() => editando?.necessidade ?? []);

  const ini = f.inicio;
  const fim = f.fim;
  const periodoOk = valido(ini) && valido(fim) && ini <= fim;
  const dias = periodoOk ? diasDoPeriodo(ini, fim) : 0;

  // ---- quem está livre na faixa (sem contar a própria campanha, quando se está editando)
  const idxSem = useMemo(() => indexar(regra, editando?.id), [regra, editando?.id]);
  const { livres, indisponiveis } = useMemo(
    () => (periodoOk ? livresNoPeriodo(regra, ini, fim, { ignorarCampanhaId: editando?.id }) : { livres: [], indisponiveis: [] }),
    [regra, ini, fim, periodoOk, editando?.id]
  );

  const [sel, setSel] = useState<Set<string>>(() => {
    if (editando) return new Set(dados.alocacoes.filter((a) => a.campanhaId === editando.id).map((a) => a.vagaId));
    const eqId = params.get("equipe");
    if (!eqId || !valido(pIni) || !valido(pFim)) return new Set();
    return new Set(livresNoPeriodo(regra, pIni, pFim).livres.filter((p) => p.equipeId === eqId).map((p) => p.id));
  });
  const [periodos, setPeriodos] = useState<Record<string, Trecho>>(() => {
    const m: Record<string, Trecho> = {};
    if (editando) for (const a of dados.alocacoes) if (a.campanhaId === editando.id && (a.inicio !== editando.inicio || a.fim !== editando.fim)) m[a.vagaId] = { inicio: a.inicio, fim: a.fim };
    return m;
  });

  // ---- filtros da lista
  const [grupoOrigem, setGrupoOrigem] = useState("");
  const [equipeBase, setEquipeBase] = useState("");
  const [empresa, setEmpresa] = useState("");
  const [cargo, setCargo] = useState("");
  const [busca, setBusca] = useState("");
  const [agrupar, setAgrupar] = useState<"funcao" | "equipe">("funcao");
  const [verFora, setVerFora] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [conflitos, setConflitos] = useState<string | null>(null);
  const [feito, setFeito] = useState<{ id: string; codigo: string; nome: string; n: number; editado: boolean } | null>(null);

  const filtra = (p: { nome: string | null; equipeId: string; empresa: string; cargo: string; grupo: string }) =>
    (!grupoOrigem || p.grupo === grupoOrigem) &&
    (!equipeBase || p.equipeId === equipeBase) &&
    (!empresa || p.empresa === empresa) &&
    (!cargo || p.cargo === cargo) &&
    (!busca.trim() || (p.nome ?? "").toLowerCase().includes(busca.trim().toLowerCase()));
  const livresFiltrados = livres.filter(filtra);

  // quem não está livre na faixa inteira: motivos com datas, e os trechos em que dá para escalar
  const foraDaFaixa = useMemo(() => {
    if (!periodoOk) return [];
    return indisponiveis
      .filter(filtra)
      .map((p) => {
        const v = vagaPorId.get(p.id)!;
        return { p, bloqueios: bloqueiosNoPeriodo(v, idxSem, ini, fim), trechos: trechosLivres(v, idxSem, ini, fim) };
      })
      .sort((a, b) => Math.max(0, ...b.trechos.map((t) => diasDoPeriodo(t.inicio, t.fim))) - Math.max(0, ...a.trechos.map((t) => diasDoPeriodo(t.inicio, t.fim))) || (a.p.nome ?? "").localeCompare(b.p.nome ?? "", "pt-BR"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indisponiveis, idxSem, ini, fim, periodoOk, grupoOrigem, equipeBase, empresa, cargo, busca, vagaPorId]);
  const parciais = foraDaFaixa.filter((x) => x.trechos.length > 0);
  const semCondicao = foraDaFaixa.filter((x) => x.trechos.length === 0);

  // livres dia a dia (com os mesmos filtros)
  const pontos = useMemo(() => {
    if (!periodoOk || dias > 400) return [];
    const candidatos = [...livres, ...indisponiveis].filter(filtra).map((p) => vagaPorId.get(p.id)!);
    const passo = Math.max(1, Math.ceil(dias / 90));
    const out: { dia: Dia; n: number }[] = [];
    for (let d = ini; d <= fim; d = somarDias(d, passo)) out.push({ dia: d, n: candidatos.filter((v) => estadoDaVaga(v, idxSem, d).situacao === "LIVRE").length });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [livres, indisponiveis, idxSem, ini, fim, periodoOk, dias, grupoOrigem, equipeBase, empresa, cargo, busca, vagaPorId]);
  const totalCandidatos = livres.filter(filtra).length + indisponiveis.filter(filtra).length;

  // ---- equipe escolhida
  const escolhidos = useMemo(() => [...sel].map((id) => vagaPorId.get(id)).filter((v): v is Vaga => !!v), [sel, vagaPorId]);
  const idsLivres = new Set(livres.map((p) => p.id));
  const foraDeCondicao = escolhidos.filter((v) => !idsLivres.has(v.id) && !periodos[v.id]);
  const composicao = useMemo(() => {
    const c = new Map<string, number>();
    for (const v of escolhidos) c.set(v.cargo, (c.get(v.cargo) ?? 0) + 1);
    return [...c.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR"));
  }, [escolhidos]);
  const conf = useMemo(() => conferirNecessidade(nec.filter((n) => n.cargo.trim()), escolhidos, livres.filter((p) => !sel.has(p.id))), [nec, escolhidos, livres, sel]);

  const alternar = (id: string) => {
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
    setPeriodos((m) => {
      if (!m[id]) return m;
      const { [id]: _, ...resto } = m;
      return resto;
    });
  };
  const marcar = (ids: string[], marcado: boolean) => {
    setSel((s) => {
      const n = new Set(s);
      ids.forEach((id) => (marcado ? n.add(id) : n.delete(id)));
      return n;
    });
    setPeriodos((m) => {
      const c = { ...m };
      ids.forEach((id) => delete c[id]);
      return c;
    });
  };
  const escalarTrecho = (id: string, t: Trecho) => {
    setSel((s) => new Set(s).add(id));
    setPeriodos((m) => ({ ...m, [id]: t }));
  };

  /** Mudou a faixa: trechos que ficaram fora dela deixam de valer (a pessoa volta a ser avaliada na faixa inteira). */
  function mudarFaixa(nova: { inicio: Dia; fim: Dia }) {
    setF((x) => ({ ...x, ...nova }));
    setPeriodos((m) => Object.fromEntries(Object.entries(m).filter(([, t]) => t.inicio >= nova.inicio && t.fim <= nova.fim)));
  }
  const duracao = (semanas: number) => mudarFaixa({ inicio: ini, fim: somarDias(ini, semanas * 7 - 1) });

  const nomeDaEquipe = f.equipeNome.trim() || (editando ? nomeDaEquipeDaCampanha(editando) : "Equipe da nova campanha");
  const liberada = editando ? STATUS_CAMPANHA_QUE_LIBERAM.includes(f.status) : false;
  const podeSalvar = podeEditar && periodoOk && !salvando && !(liberada && sel.size > 0);

  async function salvar() {
    setSalvando(true);
    setErro(null);
    setConflitos(null);
    const usados = Object.fromEntries(Object.entries(periodos).filter(([id]) => sel.has(id)));
    const corpo = {
      recebidaEm: editando?.recebidaEm ?? hoje,
      solicitante: f.solicitante || null,
      projeto: f.projeto.trim() || A_DEFINIR,
      grupo: f.grupo,
      atividade: f.atividade,
      local: f.local || null,
      equipeNome: f.equipeNome.trim() || null,
      necessidade: nec.filter((n) => n.cargo.trim() && n.qtd > 0),
      inicio: ini,
      fim,
      prioridade: f.prioridade,
      status: f.status,
      observacao: f.observacao || null,
    };
    let campanha;
    if (!editando) {
      const r = await chamar("POST", "/api/efetivos/campanhas", { ...corpo, vagaIds: [...sel], periodos: usados });
      if (!r.ok) {
        setSalvando(false);
        setErro(r.dados.error ?? "Não foi possível criar a campanha");
        setConflitos(r.dados.conflitos?.length ? descreverConflitos({ conflitos: r.dados.conflitos }).replace(/^Não foi possível salvar /, "") : null);
        return;
      }
      campanha = campanhaDeApi((r.dados as any).campanha);
    } else {
      const r1 = await chamar("PATCH", `/api/efetivos/campanhas/${editando.id}`, corpo);
      if (!r1.ok) {
        setSalvando(false);
        setErro(descreverConflitos(r1.dados));
        return;
      }
      const r2 = await chamar("PUT", `/api/efetivos/campanhas/${editando.id}/alocacoes`, { vagaIds: [...sel], periodos: usados });
      if (!r2.ok) {
        setSalvando(false);
        setErro(`Os dados da campanha foram salvos, mas a equipe não: ${descreverConflitos(r2.dados)}`);
        await recarregar();
        return;
      }
      campanha = campanhaDeApi((r1.dados as any).campanha);
    }
    await recarregar();
    setSalvando(false);
    setFeito({ id: campanha.id, codigo: campanha.codigo, nome: nomeDaEquipeDaCampanha(campanha), n: sel.size, editado: !!editando });
  }

  // ---------------------------------------------------------------- pronto
  if (feito) {
    return (
      <div className="mx-auto max-w-xl pt-10">
        <div className="card p-8 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-ok-soft text-ok">
            <IcCheck tam={24} />
          </span>
          <h1 className="mt-4 font-display text-xl font-semibold tracking-tight">{feito.editado ? "Alterações salvas" : "Campanha criada"}</h1>
          <p className="mt-1 text-sm text-gray-600">
            <strong className="font-mono">{feito.codigo}</strong> · {feito.nome}
            <br />
            {feito.n > 0 ? `${feito.n} pessoa${feito.n === 1 ? "" : "s"} na equipe` : "equipe ainda sem pessoas"} · {fmtDia(ini)} a {fmtDia(fim)}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Link href="/quadro" className="btn-primary">
              Ver no quadro
            </Link>
            <Link href="/campanhas" className="btn-ghost">
              Todas as campanhas
            </Link>
            <Link href={`/montar?campanha=${feito.id}`} className="btn-ghost">
              Editar equipe
            </Link>
            <Link href={`/montar?n=${Date.now()}`} className="btn-ghost">
              Nova campanha
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const cabecalhoLivres = (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-gray-600">
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-2.5 w-2.5 rounded-full bg-ok" />
        <strong className="num text-ink">{livresFiltrados.length}</strong> livres na faixa toda
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-2.5 w-2.5 rounded-full bg-warn" />
        <strong className="num text-ink">{parciais.length}</strong> livres só em parte
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-2.5 w-2.5 rounded-full bg-gray-300" />
        <strong className="num text-ink">{semCondicao.length}</strong> fora (férias, outra campanha…)
      </span>
    </div>
  );

  // lista agrupada (por função ou por equipe-base)
  const grupos = new Map<string, typeof livresFiltrados>();
  for (const p of livresFiltrados) {
    const k = agrupar === "funcao" ? p.cargo : rotuloEquipe({ codigo: p.equipeCodigo, nome: p.equipeNome, grupo: p.grupo });
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k)!.push(p);
  }
  const listaGrupos = [...grupos.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], "pt-BR"));

  return (
    <div>
      <CabecalhoPagina
        titulo={editando ? `${editando.codigo} · editar campanha e equipe` : "Nova campanha"}
        subtitulo="Escolha o período, veja quem está livre nele e monte a equipe. A equipe nasce junto com a campanha."
        acoes={
          <Link href={editando ? "/campanhas" : "/quadro"} className="btn-ghost">
            Cancelar
          </Link>
        }
      />
      {!podeEditar && (
        <div className="mb-4">
          <Aviso tipo="info">Seu acesso é só de consulta: dá para ver quem está livre em qualquer período, mas não criar campanha.</Aviso>
        </div>
      )}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_350px]">
        <div className="min-w-0 space-y-5">
          {/* período + pedido */}
          <Secao titulo="Período e pedido" sub="O que o cliente pediu e em que dias a equipe fica em campo.">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Rotulo t="Início">
                <input type="date" value={ini} onChange={(e) => e.target.value && mudarFaixa({ inicio: e.target.value, fim: e.target.value > fim ? e.target.value : fim })} className="field" />
              </Rotulo>
              <Rotulo t="Fim">
                <input type="date" value={fim} min={ini} onChange={(e) => e.target.value && mudarFaixa({ inicio: ini, fim: e.target.value })} className="field" />
              </Rotulo>
              <div className="sm:col-span-2">
                <span className="label">Duração</span>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  {[2, 4, 6, 8, 12].map((s) => (
                    <button key={s} type="button" onClick={() => duracao(s)} className={`rounded-lg border px-2.5 py-2 text-xs font-semibold ${dias === s * 7 ? "border-brand bg-brand-soft text-brand-dark" : "border-line bg-white text-gray-600 hover:bg-gray-50"}`}>
                      {s} sem
                    </button>
                  ))}
                  <button type="button" onClick={() => mudarFaixa({ inicio: ini, fim: fimDoMes(ini) })} className="rounded-lg border border-line bg-white px-2.5 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50">
                    até o fim do mês
                  </button>
                  <span className="num ml-1 text-xs text-gray-500">{periodoOk ? `${dias} dias` : "período inválido"}</span>
                </div>
              </div>

              <Rotulo t="Contrato / projeto" className="lg:col-span-1">
                <input list="lista-contratos" value={f.projeto} onChange={(e) => set("projeto", e.target.value)} className="field" placeholder="ex.: 3636 PNM" />
                <datalist id="lista-contratos">
                  {projetos.map((p) => (
                    <option key={p} value={p} />
                  ))}
                </datalist>
              </Rotulo>
              <Rotulo t="Grupo">
                <select value={f.grupo} onChange={(e) => set("grupo", e.target.value)} className="field">
                  {gruposCampanha.map((g) => (
                    <option key={g}>{g}</option>
                  ))}
                </select>
              </Rotulo>
              <Rotulo t="Atividade">
                <select value={f.atividade} onChange={(e) => set("atividade", e.target.value)} className="field">
                  {ATIVIDADES.map((a) => (
                    <option key={a}>{a}</option>
                  ))}
                </select>
              </Rotulo>
              <Rotulo t="Local / frente">
                <input value={f.local} onChange={(e) => set("local", e.target.value)} className="field" />
              </Rotulo>

              <Rotulo t="Nome da equipe" className="sm:col-span-2">
                <input value={f.equipeNome} onChange={(e) => set("equipeNome", e.target.value)} className="field" placeholder={editando ? `Equipe ${editando.codigo}` : "ex.: Equipe Resgate Flanco Norte"} />
              </Rotulo>
              <Rotulo t="Solicitante">
                <input value={f.solicitante} onChange={(e) => set("solicitante", e.target.value)} className="field" />
              </Rotulo>
              <div className="grid grid-cols-2 gap-3">
                <Rotulo t="Prioridade">
                  <select value={f.prioridade} onChange={(e) => set("prioridade", e.target.value)} className="field">
                    {PRIORIDADES.map((p) => (
                      <option key={p}>{p}</option>
                    ))}
                  </select>
                </Rotulo>
                <Rotulo t="Situação">
                  <select value={f.status} onChange={(e) => set("status", e.target.value)} className="field">
                    {STATUS_CAMPANHA.filter((s) => editando || !STATUS_CAMPANHA_QUE_LIBERAM.includes(s)).map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </Rotulo>
              </div>
              <Rotulo t="Observação" className="sm:col-span-2 lg:col-span-4">
                <input value={f.observacao} onChange={(e) => set("observacao", e.target.value)} className="field" />
              </Rotulo>
            </div>
            {liberada && sel.size > 0 && (
              <div className="mt-3">
                <Aviso tipo="atencao">Campanha {f.status.toLowerCase()} não segura equipe: tire as pessoas ou volte a situação para uma campanha em andamento.</Aviso>
              </div>
            )}
          </Secao>

          {/* necessidade */}
          <Secao
            titulo="O que a campanha pede (opcional)"
            sub="Quantos de cada função. Com isso a tela mostra o que falta e onde não há ninguém livre."
            direita={
              <button type="button" onClick={() => setNec((n) => [...n, { cargo: "", qtd: 1 }])} className="btn-ghost btn-sm">
                <IcMais tam={13} /> função
              </button>
            }
          >
            {nec.length === 0 ? (
              <p className="text-xs text-gray-400">Nada informado. Se quiser conferir a equipe contra o pedido, adicione as funções (ex.: 2 Biólogos de Fauna, 6 Auxiliares).</p>
            ) : (
              <ul className="space-y-2">
                {nec.map((n, i) => {
                  const l = conf.linhas.find((x) => x.cargo === n.cargo.trim());
                  return (
                    <li key={i} className="flex flex-wrap items-center gap-2">
                      <input
                        list="lista-cargos"
                        value={n.cargo}
                        onChange={(e) => setNec((x) => x.map((y, j) => (j === i ? { ...y, cargo: e.target.value } : y)))}
                        placeholder="função"
                        className="field !mt-0 min-w-[200px] flex-1"
                        aria-label="Função"
                      />
                      <input
                        type="number"
                        min={1}
                        max={500}
                        value={n.qtd}
                        onChange={(e) => setNec((x) => x.map((y, j) => (j === i ? { ...y, qtd: Math.max(1, Number(e.target.value) || 1) } : y)))}
                        className="field !mt-0 !w-20"
                        aria-label="Quantidade"
                      />
                      <span className="min-w-[170px] text-[11.5px] text-gray-500">
                        {l ? (
                          <>
                            na equipe <strong className="num text-ink">{l.escalados}</strong> · livres <strong className="num text-ink">{l.livresRestantes}</strong>
                            {l.semGente > 0 && <strong className="text-warn"> · faltam {l.semGente} sem ninguém livre</strong>}
                          </>
                        ) : null}
                      </span>
                      <button type="button" onClick={() => setNec((x) => x.filter((_, j) => j !== i))} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-bad" aria-label="Remover função">
                        <IcFechar tam={15} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <datalist id="lista-cargos">
              {cargosConhecidos.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Secao>

          {/* quem está livre */}
          <Secao
            titulo={`Quem está livre em ${periodoOk ? `${fmtDia(ini)} a ${fmtDia(fim)}` : "—"}`}
            sub="Marque para escalar, ou parta de uma das 11 equipes e ajuste. Quem volta no meio da faixa fica em “livres só em parte”."
            direita={
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value=""
                  onChange={(e) => e.target.value && marcar(livres.filter((p) => p.equipeId === e.target.value).map((p) => p.id), true)}
                  className="field !mt-0 !w-auto !py-1.5 text-xs"
                  aria-label="Partir de uma equipe"
                >
                  <option value="">Partir de uma equipe…</option>
                  {equipesCampo.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.nome}
                    </option>
                  ))}
                </select>
                <Segmentado valor={agrupar} onChange={setAgrupar} opcoes={[{ id: "funcao", rotulo: "Por função" }, { id: "equipe", rotulo: "Por equipe-base" }]} />
              </div>
            }
          >
            <div className="mb-3 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-[110px_minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1fr)]">
              <label className="text-xs">
                <span className="label">Grupo</span>
                <select value={grupoOrigem} onChange={(e) => setGrupoOrigem(e.target.value)} className="field !mt-0.5 !py-1.5">
                  <option value="">Todos</option>
                  {gruposOrigem.map((g) => (
                    <option key={g}>{g}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs">
                <span className="label">Equipe-base</span>
                <select value={equipeBase} onChange={(e) => setEquipeBase(e.target.value)} className="field !mt-0.5 !py-1.5">
                  <option value="">Todas</option>
                  {dados.equipes
                    .filter((e) => !grupoOrigem || e.grupo === grupoOrigem)
                    .map((e) => (
                      <option key={e.id} value={e.id}>
                        {rotuloEquipe(e)}
                      </option>
                    ))}
                </select>
              </label>
              <label className="text-xs">
                <span className="label">Empresa</span>
                <select value={empresa} onChange={(e) => setEmpresa(e.target.value)} className="field !mt-0.5 !py-1.5">
                  <option value="">Todas</option>
                  {empresas.map((e) => (
                    <option key={e}>{e}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs">
                <span className="label">Função</span>
                <select value={cargo} onChange={(e) => setCargo(e.target.value)} className="field !mt-0.5 !py-1.5">
                  <option value="">Todas</option>
                  {cargosConhecidos.map((e) => (
                    <option key={e}>{e}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs">
                <span className="label">Nome</span>
                <input value={busca} onChange={(e) => setBusca(e.target.value)} className="field !mt-0.5 !py-1.5" placeholder="buscar…" />
              </label>
            </div>
            <div className="mb-3 border-y border-line bg-gray-50 px-3 py-2">{cabecalhoLivres}</div>

            {!periodoOk ? (
              <p className="py-6 text-center text-sm text-gray-400">Escolha as datas de início e fim para ver quem está livre.</p>
            ) : (
              <div className="space-y-4">
                {listaGrupos.map(([titulo, pessoas]) => {
                  const ids = pessoas.map((p) => p.id);
                  const todos = ids.every((id) => sel.has(id) && !periodos[id]);
                  const linhaNec = agrupar === "funcao" ? conf.linhas.find((l) => l.cargo === titulo) : undefined;
                  return (
                    <div key={titulo}>
                      <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
                        <span className="flex min-w-0 items-center gap-2 font-semibold text-ink">
                          <span className="truncate">{titulo}</span>
                          <span className="num rounded bg-gray-100 px-1.5 text-[11px] font-semibold text-gray-600">{pessoas.length}</span>
                          {linhaNec && (
                            <span className={`rounded px-1.5 text-[11px] font-semibold ${linhaNec.falta === 0 ? "bg-ok-soft text-ok" : "bg-info-soft text-info"}`}>
                              pede {linhaNec.pedido} · na equipe {linhaNec.escalados}
                            </span>
                          )}
                        </span>
                        <button type="button" onClick={() => marcar(ids, !todos)} className="shrink-0 font-semibold text-brand-dark hover:underline">
                          {todos ? "desmarcar" : "marcar"} {pessoas.length > 1 ? `os ${pessoas.length}` : "este"}
                        </button>
                      </div>
                      <div className="grid gap-1.5 sm:grid-cols-2 2xl:grid-cols-3">
                        {pessoas.map((p) => {
                          const marcado = sel.has(p.id);
                          return (
                            <label key={p.id} className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-2.5 py-1.5 transition-colors ${marcado ? "border-brand bg-brand-soft" : "border-line hover:bg-gray-50"}`}>
                              <input type="checkbox" checked={marcado} onChange={() => alternar(p.id)} className="accent-[#0A9E7F]" />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-[13px] font-medium text-ink">{nomeDe(p)}</span>
                                <span className="block truncate text-[11px] text-gray-500">
                                  {agrupar === "funcao" ? `${p.empresa} · ${p.grupo === GRUPO_RESERVA ? "reserva de apoio" : p.equipeCodigo}` : `${p.cargo} · ${p.empresa}`}
                                  {vagaPorId.get(p.id)?.direcao4x4 ? " · 4x4" : ""}
                                </span>
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
                {listaGrupos.length === 0 && <p className="py-4 text-center text-sm text-gray-400">Ninguém está livre na faixa inteira com estes filtros.</p>}

                {parciais.length > 0 && (
                  <div>
                    <div className="mb-1.5 text-xs font-semibold text-ink">Livres só em parte da faixa ({parciais.length})</div>
                    <div className="grid gap-1.5 md:grid-cols-2">
                      {parciais.map(({ p, bloqueios, trechos }) => {
                        const atual = periodos[p.id];
                        return (
                          <div key={p.id} className={`rounded-lg border px-2.5 py-2 ${atual ? "border-brand bg-brand-soft" : "border-line bg-gray-50"}`}>
                            <div className="flex items-baseline justify-between gap-2">
                              <span className="truncate text-[13px] font-medium text-ink">{nomeDe(p)}</span>
                              <span className="shrink-0 text-[11px] text-gray-500">{p.cargo}</span>
                            </div>
                            <ul className="mt-0.5 space-y-0.5 text-[11.5px] text-gray-600">
                              {bloqueios.slice(0, 2).map((b, i) => (
                                <li key={i} className="flex items-center gap-1.5">
                                  <span className="inline-block h-2 w-2 shrink-0 rounded-sm" style={{ background: b.origem === "ausencia" ? corDaAusencia(b.tipo) : b.origem === "outro_contrato" ? "#1D6FB8" : b.origem === "campanha" ? "#0A9E7F" : "#C9342B" }} />
                                  {b.origem === "campanha" ? `Em ${(b.campanhaId && campanhaPorId.get(b.campanhaId)?.codigo) || "outra campanha"}` : b.tipo}{" "}
                                  {b.origem === "status" ? "" : `${fmtDiaCurto(b.inicio)}–${fmtDiaCurto(b.fim)}`}
                                </li>
                              ))}
                            </ul>
                            <div className="mt-1.5 flex flex-wrap gap-1.5">
                              {trechos.slice(0, 3).map((t) => {
                                const ativo = !!atual && atual.inicio === t.inicio && atual.fim === t.fim;
                                return (
                                  <button
                                    key={t.inicio}
                                    type="button"
                                    onClick={() => (ativo ? alternar(p.id) : escalarTrecho(p.id, t))}
                                    className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${ativo ? "border-brand bg-brand text-white" : "border-line bg-white text-brand-dark hover:bg-brand-soft"}`}
                                  >
                                    {ativo ? "✓ " : "+ "}só {fmtDiaCurto(t.inicio)} a {fmtDiaCurto(t.fim)}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {semCondicao.length > 0 && (
                  <div>
                    <button type="button" onClick={() => setVerFora((v) => !v)} className="text-xs font-semibold text-gray-600 hover:text-ink" aria-expanded={verFora}>
                      {verFora ? "Esconder" : "Ver"} quem está fora da faixa ({semCondicao.length})
                    </button>
                    {verFora && (
                      <div className="mt-2 overflow-x-auto rounded-lg border border-line">
                        <table className="tbl">
                          <tbody>
                            {semCondicao.map(({ p, bloqueios }) => (
                              <tr key={p.id}>
                                <td className="py-1.5 text-[13px] font-medium">{nomeDe(p)}</td>
                                <td className="py-1.5 text-[11.5px] text-gray-500">{p.cargo}</td>
                                <td className="py-1.5 text-[11.5px] text-gray-600">
                                  {bloqueios
                                    .slice(0, 2)
                                    .map((b) => `${b.origem === "campanha" ? `Em ${(b.campanhaId && campanhaPorId.get(b.campanhaId)?.codigo) || "outra campanha"}` : b.tipo}${b.origem === "status" ? "" : ` ${fmtDiaCurto(b.inicio)}–${fmtDiaCurto(b.fim)}`}`)
                                    .join(" · ")}
                                  {bloqueios[0] && bloqueios[0].origem !== "status" && bloqueios[0].fim < fim ? ` · volta ${fmtDiaCurto(somarDias(bloqueios[0].fim, 1))}` : ""}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </Secao>
        </div>

        {/* equipe sendo montada */}
        <aside className="space-y-4 xl:sticky xl:top-5">
          <section className="card overflow-hidden">
            <div className="border-b border-line bg-brand-deep px-4 py-3 text-white">
              <div className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-white/60">Equipe da campanha</div>
              <div className="mt-0.5 truncate font-display text-[16px] font-semibold tracking-tight">{nomeDaEquipe}</div>
              <div className="mt-0.5 text-[11.5px] text-white/70">
                {rotuloContrato(f.projeto.trim() || A_DEFINIR)} · {f.grupo} · {f.atividade}
              </div>
              <div className="num mt-0.5 text-[11.5px] text-white/70">{periodoOk ? `${fmtDia(ini)} a ${fmtDia(fim)} · ${dias} dias` : "defina o período"}</div>
            </div>

            <div className="px-4 py-3">
              <div className="flex items-baseline gap-2">
                <span className="num font-display text-2xl font-semibold leading-none text-ink">{sel.size}</span>
                <span className="text-xs text-gray-500">pessoa{sel.size === 1 ? "" : "s"} na equipe</span>
              </div>

              {conf.linhas.length > 0 ? (
                <ul className="mt-3 space-y-2">
                  {conf.linhas.map((l) => (
                    <li key={l.cargo}>
                      <div className="flex items-baseline justify-between gap-2 text-xs">
                        <span className="truncate font-medium text-ink">{l.cargo}</span>
                        <span className="num shrink-0 text-gray-600">
                          {l.escalados}/{l.pedido}
                        </span>
                      </div>
                      <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-gray-100">
                        <div className="h-full rounded-full" style={{ width: `${Math.min(100, (l.escalados / l.pedido) * 100)}%`, background: l.falta === 0 ? "#0E8F63" : "#1D6FB8" }} />
                      </div>
                      {l.semGente > 0 && <div className="mt-0.5 text-[11px] font-medium text-warn">faltam {l.semGente} — sem ninguém livre no período</div>}
                    </li>
                  ))}
                  {conf.extras.map((x) => (
                    <li key={x.cargo} className="flex justify-between gap-2 text-xs text-gray-500">
                      <span className="truncate">{x.cargo} (fora do pedido)</span>
                      <span className="num">{x.n}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                composicao.length > 0 && (
                  <ul className="mt-3 space-y-1 text-xs text-gray-600">
                    {composicao.map(([c, n]) => (
                      <li key={c} className="flex justify-between gap-2">
                        <span className="truncate">{c}</span>
                        <span className="num font-semibold text-ink">{n}</span>
                      </li>
                    ))}
                  </ul>
                )
              )}

              {escolhidos.length > 0 && (
                <ul className="mt-3 max-h-56 divide-y divide-line overflow-y-auto rounded-lg border border-line text-xs">
                  {escolhidos.map((v) => {
                    const t = periodos[v.id];
                    const fora = !idsLivres.has(v.id) && !t;
                    return (
                      <li key={v.id} className="flex items-center justify-between gap-2 px-2.5 py-1.5">
                        <span className="min-w-0">
                          <span className={`block truncate font-medium ${fora ? "text-bad" : "text-ink"}`}>{nomeDe(v)}</span>
                          <span className="block truncate text-[10.5px] text-gray-500">
                            {v.cargo}
                            {t ? ` · só ${fmtDiaCurto(t.inicio)}–${fmtDiaCurto(t.fim)}` : fora ? " · não está livre na faixa" : ""}
                          </span>
                        </span>
                        <button type="button" onClick={() => alternar(v.id)} className="shrink-0 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-bad" aria-label={`Tirar ${nomeDe(v)} da equipe`}>
                          <IcFechar tam={13} />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              {escolhidos.length === 0 && <p className="mt-3 text-xs text-gray-400">Marque, na lista, quem vai nesta equipe. Dá para criar a campanha agora e completar depois.</p>}

              {foraDeCondicao.length > 0 && <p className="mt-2 text-[11px] text-bad">{foraDeCondicao.length} escalado(s) não está(ão) livre(s) neste período — tire da equipe ou ajuste as datas.</p>}

              {erro && (
                <div className="mt-3">
                  <Aviso tipo="erro">
                    {erro}
                    {conflitos && <div className="mt-1 text-xs">{conflitos}</div>}
                  </Aviso>
                </div>
              )}

              <button type="button" onClick={salvar} disabled={!podeSalvar} className="btn-primary mt-4 w-full">
                {salvando ? "Salvando…" : editando ? "Salvar campanha e equipe" : sel.size > 0 ? `Criar campanha com ${sel.size} pessoa${sel.size === 1 ? "" : "s"}` : "Criar campanha (equipe depois)"}
              </button>
              <p className="mt-1.5 text-center text-[11px] text-gray-400">Tudo fica no histórico.</p>
            </div>
          </section>

          <section className="card p-4">
            <h3 className="font-display text-[13px] font-semibold tracking-tight text-ink">Livres dia a dia nesta faixa</h3>
            <p className="mb-2 text-[11.5px] text-gray-500">Considera férias, atestados, outras campanhas e quem ainda está em outro contrato.</p>
            <GraficoLivres pontos={pontos} total={totalCandidatos} />
          </section>
        </aside>
      </div>
    </div>
  );
}
