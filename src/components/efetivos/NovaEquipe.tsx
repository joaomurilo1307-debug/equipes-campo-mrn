"use client";

// Nova equipe, no estilo de montar uma campanha: contrato, período (opcional), colaboradores cadastrados para puxar,
// pessoas novas cadastradas na hora e vagas a abrir. Salvar cria a equipe com tudo isso numa operação só.
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { dataValida, estadoDaVaga, ordenarGrupos, somarDias, temNome, type Dia } from "@/lib/efetivos/disponibilidade";
import { useDados } from "./DadosContext";
import { A_DEFINIR, chamar, contratosConhecidos, descreverConflitos, diasDoPeriodo, ehReserva, fmtDia, rotuloContrato, valoresUsados } from "./comum";
import { IcFechar, IcMais } from "./icones";
import { Aviso, CabecalhoPagina, Secao } from "./ui";

type Novo = { nome: string; cargo: string; empresa: string; atividade: string; nivel: string; direcao4x4: string };
type VagaAberta = { cargo: string; empresa: string; atividade: string; quantidade: number };

const valido = (d: string | null): d is Dia => !!d && dataValida(d);
const ATIVIDADES = ["Resgate", "Afugentamento", "Apoio"];

function Rotulo({ t, children, className = "" }: { t: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="label">{t}</span>
      {children}
    </label>
  );
}

export default function NovaEquipe() {
  const params = useSearchParams();
  const router = useRouter();
  const { dados, idx, hoje, recarregar, equipePorId, nomeDe, situacaoDe } = useDados();
  const podeEditar = dados.podeEditar;

  const contratos = useMemo(() => contratosConhecidos(dados), [dados]);
  const cargos = useMemo(() => valoresUsados(dados.vagas, "cargo"), [dados.vagas]);
  const empresas = useMemo(() => valoresUsados(dados.vagas, "empresa"), [dados.vagas]);
  const grupos = useMemo(() => ordenarGrupos([...dados.equipes.filter((e) => !ehReserva(e)).map((e) => e.grupo), "Fauna", "Flora"]), [dados.equipes]);

  const [f, setF] = useState({
    projeto: params.get("contrato") ?? "",
    nome: "",
    grupo: grupos[0] ?? "Fauna",
    gestor: "",
    local: "",
    comPeriodo: false,
    inicio: (valido(params.get("inicio")) ? params.get("inicio") : hoje) as Dia,
    fim: (valido(params.get("fim")) ? params.get("fim") : somarDias(hoje, 29)) as Dia,
    observacao: "",
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const contratoDe = (c: string) => dados.contratos.find((x) => x.codigo === c);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [novos, setNovos] = useState<Novo[]>([]);
  const [abertas, setAbertas] = useState<VagaAberta[]>([]);
  const [abrirNasOrigens, setAbrirNasOrigens] = useState(true);
  const [rascunho, setRascunho] = useState<Novo>({ nome: "", cargo: "", empresa: "Consominas", atividade: "Resgate", nivel: "", direcao4x4: "" });
  const [busca, setBusca] = useState("");
  const [filtroContrato, setFiltroContrato] = useState("");
  const [onde, setOnde] = useState<"todos" | "disponiveis" | "equipes">("todos");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const periodoOk = f.comPeriodo && f.inicio <= f.fim;

  // ---- colaboradores cadastrados, com a situação no período (quando há período)
  const candidatos = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return dados.vagas
      .filter((v) => temNome(v) && v.status !== "Desmobilizado")
      .map((v) => {
        const eq = equipePorId.get(v.equipeId);
        // disponível = na reserva ou com a equipe já encerrada (a regra única de situação)
        const naReserva = (!!eq && ehReserva(eq)) || situacaoDe(v, periodoOk ? f.inicio : hoje).situacao === "DISPONIVEL";
        const est = periodoOk ? estadoDaVaga(v, idx, f.inicio, f.fim) : estadoDaVaga(v, idx, hoje);
        const indisponivel = est.situacao === "AUSENTE" || est.situacao === "ALOCADA";
        return { v, eq, naReserva, contrato: v.contrato || (eq && !naReserva && eq.projeto !== A_DEFINIR ? eq.projeto : ""), indisponivel, motivo: est.motivo };
      })
      .filter((x) => (onde === "todos" ? true : onde === "disponiveis" ? x.naReserva : !x.naReserva))
      .filter((x) => !filtroContrato || (filtroContrato === "__sem" ? !x.contrato : x.contrato === filtroContrato))
      .filter((x) => !t || `${x.v.nome} ${x.v.cargo} ${x.v.empresa} ${x.contrato} ${x.eq?.nome ?? ""}`.toLowerCase().includes(t))
      .sort((a, b) => Number(b.naReserva) - Number(a.naReserva) || (a.v.nome ?? "").localeCompare(b.v.nome ?? "", "pt-BR"))
      .slice(0, 200);
  }, [dados.vagas, equipePorId, idx, hoje, f.inicio, f.fim, periodoOk, busca, filtroContrato, onde]);

  const escolhidos = useMemo(() => [...sel].map((id) => dados.vagas.find((v) => v.id === id)).filter((v): v is NonNullable<typeof v> => !!v), [sel, dados.vagas]);
  const conflitos = escolhidos.filter((v) => {
    if (!periodoOk) return false;
    const e = estadoDaVaga(v, idx, f.inicio, f.fim).situacao;
    return e === "AUSENTE" || e === "ALOCADA";
  });

  const total = sel.size + novos.length;
  const totalVagas = abertas.reduce((s, v) => s + v.quantidade, 0);
  const podeSalvar = podeEditar && !salvando && !!f.nome.trim() && !!f.projeto.trim() && (!f.comPeriodo || f.inicio <= f.fim) && conflitos.length === 0;

  const alternar = (id: string) =>
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  function adicionarNovo() {
    if (!rascunho.nome.trim() || !rascunho.cargo.trim() || !rascunho.empresa.trim()) return;
    setNovos((x) => [...x, { ...rascunho, nome: rascunho.nome.trim() }]);
    setRascunho({ ...rascunho, nome: "", nivel: "", direcao4x4: "" });
  }

  async function salvar() {
    setSalvando(true);
    setErro(null);
    const contrato = f.projeto.trim() || A_DEFINIR;
    const r = await chamar("POST", "/api/efetivos/equipes/montar", {
      nome: f.nome.trim(),
      projeto: contrato,
      grupo: f.grupo,
      gestor: f.gestor.trim() || contratoDe(contrato)?.gestor || null,
      local: f.local.trim() || null,
      observacao: f.observacao.trim() || null,
      inicio: f.comPeriodo ? f.inicio : null,
      fim: f.comPeriodo ? f.fim : null,
      colaboradorIds: [...sel],
      abrirVagasNasOrigens: abrirNasOrigens,
      novos: novos.map((n) => ({ nome: n.nome, cargo: n.cargo, empresa: n.empresa, atividade: n.atividade, nivel: n.nivel || null, direcao4x4: n.direcao4x4 === "" ? null : n.direcao4x4 === "sim" })),
      vagasAbertas: abertas.filter((v) => v.cargo.trim() && v.empresa.trim() && v.quantidade > 0),
    });
    setSalvando(false);
    if (!r.ok) {
      setErro(descreverConflitos(r.dados));
      return;
    }
    await recarregar();
    router.push(`/equipes?equipe=${(r.dados as any).equipe.id}`);
  }

  return (
    <div>
      <CabecalhoPagina
        titulo="Nova equipe"
        subtitulo="Escolha o contrato e, se quiser, o período da equipe; puxe colaboradores já cadastrados (ou cadastre alguém na hora) e abra as vagas que faltam."
        acoes={
          <Link href="/equipes" className="btn-ghost">
            Cancelar
          </Link>
        }
      />
      {!podeEditar && (
        <div className="mb-4">
          <Aviso tipo="info">Seu acesso é só de consulta.</Aviso>
        </div>
      )}

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-4">
          <Secao titulo="Equipe, contrato e período" sub="O contrato vem antes da equipe: é nele que ela trabalha.">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Rotulo t="Contrato">
                <input list="ne-contratos" value={f.projeto} onChange={(e) => set("projeto", e.target.value)} className="field" placeholder="ex.: 3636 PNM" />
                <datalist id="ne-contratos">
                  {contratos.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </Rotulo>
              <Rotulo t="Nome da equipe" className="lg:col-span-2">
                <input value={f.nome} onChange={(e) => set("nome", e.target.value)} className="field" placeholder="ex.: Flanco Norte — Equipe 03" autoFocus />
              </Rotulo>
              <Rotulo t="Grupo">
                <select value={f.grupo} onChange={(e) => set("grupo", e.target.value)} className="field">
                  {grupos.map((g) => (
                    <option key={g}>{g}</option>
                  ))}
                </select>
              </Rotulo>
              <Rotulo t="Gestor MRN">
                <input value={f.gestor} onChange={(e) => set("gestor", e.target.value)} className="field" placeholder={contratoDe(f.projeto)?.gestor ?? ""} />
              </Rotulo>
              <Rotulo t="Local / frente" className="lg:col-span-2">
                <input value={f.local} onChange={(e) => set("local", e.target.value)} className="field" />
              </Rotulo>
            </div>
            <div className="mt-3 flex flex-wrap items-end gap-3 border-t border-line pt-3">
              <label className="flex items-center gap-2 pb-2 text-sm text-gray-700">
                <input type="checkbox" checked={f.comPeriodo} onChange={(e) => set("comPeriodo", e.target.checked)} className="accent-[#0A9E7F]" /> A equipe tem período
              </label>
              {f.comPeriodo && (
                <>
                  <Rotulo t="Início">
                    <input type="date" value={f.inicio} onChange={(e) => e.target.value && set("inicio", e.target.value)} className="field !py-1.5" />
                  </Rotulo>
                  <Rotulo t="Fim">
                    <input type="date" value={f.fim} min={f.inicio} onChange={(e) => e.target.value && set("fim", e.target.value)} className="field !py-1.5" />
                  </Rotulo>
                  <span className="num pb-2 text-xs text-gray-500">{f.inicio <= f.fim ? `${diasDoPeriodo(f.inicio, f.fim)} dias` : "período inválido"}</span>
                  <span className="pb-2 text-xs text-gray-500">A lista abaixo mostra quem está livre nesse período. No dia seguinte ao fim, as pessoas da equipe ficam disponíveis.</span>
                </>
              )}
            </div>
          </Secao>

          <Secao titulo="Colaboradores cadastrados" sub="Escolha quem entra. Quem sai de outra equipe deixa uma vaga aberta lá.">
            <div className="mb-3 flex flex-wrap items-end gap-2.5">
              <label className="min-w-[200px] flex-1 text-xs">
                <span className="label">Buscar</span>
                <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="nome, função, empresa, contrato…" className="field !mt-0.5 !py-1.5" />
              </label>
              <label className="text-xs">
                <span className="label">Contrato</span>
                <select value={filtroContrato} onChange={(e) => setFiltroContrato(e.target.value)} className="field !mt-0.5 !w-auto !py-1.5">
                  <option value="">Todos</option>
                  {contratos.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                  <option value="__sem">Sem contrato</option>
                </select>
              </label>
              <label className="text-xs">
                <span className="label">Quem</span>
                <select value={onde} onChange={(e) => setOnde(e.target.value as typeof onde)} className="field !mt-0.5 !w-auto !py-1.5">
                  <option value="todos">Todos</option>
                  <option value="disponiveis">Disponíveis (sem equipe)</option>
                  <option value="equipes">Em outras equipes</option>
                </select>
              </label>
            </div>
            <ul className="max-h-[420px] divide-y divide-line overflow-y-auto rounded-xl border border-line">
              {candidatos.map(({ v, eq, naReserva, contrato, indisponivel, motivo }) => {
                const marcado = sel.has(v.id);
                return (
                  <li key={v.id}>
                    <label className={`flex items-center gap-3 px-3 py-1.5 text-[13px] ${indisponivel ? "cursor-not-allowed bg-gray-50 opacity-70" : "cursor-pointer hover:bg-gray-50"} ${marcado ? "bg-brand-soft" : ""}`}>
                      <input type="checkbox" checked={marcado} disabled={indisponivel} onChange={() => alternar(v.id)} className="accent-[#0A9E7F]" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-ink">{nomeDe(v)}</span>
                        <span className="block truncate text-[11px] text-gray-500">
                          {v.cargo} · {v.empresa}
                        </span>
                      </span>
                      <span className="shrink-0 text-right text-[11px] text-gray-500">
                        {indisponivel ? <span className="font-semibold text-bad">{motivo ?? "indisponível"}</span> : naReserva ? <span className="chip-ok">disponível</span> : eq?.nome}
                        {contrato && <span className="block">{rotuloContrato(contrato)}</span>}
                      </span>
                    </label>
                  </li>
                );
              })}
              {candidatos.length === 0 && <li className="px-4 py-8 text-center text-sm text-gray-400">Ninguém encontrado.</li>}
            </ul>

            <div className="mt-4 rounded-xl border border-dashed border-line bg-gray-50 p-3">
              <div className="mb-2 text-[13px] font-semibold text-gray-700">Cadastrar alguém agora (entra direto nesta equipe)</div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[1.4fr_1.4fr_1fr_1fr_auto]">
                <input value={rascunho.nome} onChange={(e) => setRascunho({ ...rascunho, nome: e.target.value })} placeholder="Nome" className="field !mt-0 !py-1.5" />
                <input list="ne-cargos" value={rascunho.cargo} onChange={(e) => setRascunho({ ...rascunho, cargo: e.target.value })} placeholder="Função" className="field !mt-0 !py-1.5" />
                <input list="ne-empresas" value={rascunho.empresa} onChange={(e) => setRascunho({ ...rascunho, empresa: e.target.value })} placeholder="Empresa" className="field !mt-0 !py-1.5" />
                <select value={rascunho.atividade} onChange={(e) => setRascunho({ ...rascunho, atividade: e.target.value })} className="field !mt-0 !py-1.5">
                  {ATIVIDADES.map((a) => (
                    <option key={a}>{a}</option>
                  ))}
                </select>
                <button type="button" onClick={adicionarNovo} disabled={!rascunho.nome.trim() || !rascunho.cargo.trim()} className="btn-ghost btn-sm">
                  <IcMais tam={13} /> Adicionar
                </button>
              </div>
              <datalist id="ne-cargos">
                {cargos.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
              <datalist id="ne-empresas">
                {empresas.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
              {novos.length > 0 && (
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {novos.map((n, i) => (
                    <li key={i} className="inline-flex items-center gap-1.5 rounded-md bg-white px-2 py-1 text-xs ring-1 ring-line">
                      <strong className="text-ink">{n.nome}</strong>
                      <span className="text-gray-500">{n.cargo}</span>
                      <button type="button" onClick={() => setNovos((x) => x.filter((_, j) => j !== i))} className="text-gray-400 hover:text-bad" aria-label="Remover">
                        <IcFechar tam={12} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Secao>

          <Secao
            titulo="Vagas a abrir (opcional)"
            sub="Posições que ainda não têm ninguém: ficam abertas na equipe para preencher depois."
            direita={
              <button type="button" onClick={() => setAbertas((x) => [...x, { cargo: "", empresa: empresas[0] ?? "Consominas", atividade: "Resgate", quantidade: 1 }])} className="btn-ghost btn-sm">
                <IcMais tam={13} /> vaga
              </button>
            }
          >
            {abertas.length === 0 ? (
              <p className="text-xs text-gray-400">Nenhuma. Se a equipe precisa de mais gente do que a escolhida, abra as vagas aqui (ex.: 2 Biólogos de Fauna, 6 Auxiliares).</p>
            ) : (
              <ul className="space-y-2">
                {abertas.map((v, i) => (
                  <li key={i} className="flex flex-wrap items-center gap-2">
                    <input list="ne-cargos" value={v.cargo} onChange={(e) => setAbertas((x) => x.map((y, j) => (j === i ? { ...y, cargo: e.target.value } : y)))} placeholder="função" className="field !mt-0 min-w-[200px] flex-1 !py-1.5" />
                    <input list="ne-empresas" value={v.empresa} onChange={(e) => setAbertas((x) => x.map((y, j) => (j === i ? { ...y, empresa: e.target.value } : y)))} className="field !mt-0 !w-40 !py-1.5" />
                    <select value={v.atividade} onChange={(e) => setAbertas((x) => x.map((y, j) => (j === i ? { ...y, atividade: e.target.value } : y)))} className="field !mt-0 !w-36 !py-1.5">
                      {ATIVIDADES.map((a) => (
                        <option key={a}>{a}</option>
                      ))}
                    </select>
                    <input type="number" min={1} max={50} value={v.quantidade} onChange={(e) => setAbertas((x) => x.map((y, j) => (j === i ? { ...y, quantidade: Math.max(1, Number(e.target.value) || 1) } : y)))} className="field !mt-0 !w-20 !py-1.5" aria-label="Quantidade" />
                    <button type="button" onClick={() => setAbertas((x) => x.filter((_, j) => j !== i))} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-bad" aria-label="Remover">
                      <IcFechar tam={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Secao>
        </div>

        <aside className="space-y-3 xl:sticky xl:top-5">
          <section className="card overflow-hidden">
            <div className="border-b border-line bg-brand-deep px-4 py-3 text-white">
              <div className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-white/60">Nova equipe</div>
              <div className="mt-0.5 truncate font-display text-[16px] font-semibold tracking-tight">{f.nome.trim() || "Dê um nome à equipe"}</div>
              <div className="mt-0.5 text-[11.5px] text-white/70">{rotuloContrato(f.projeto.trim() || A_DEFINIR)} · {f.grupo}</div>
              {f.comPeriodo && <div className="num mt-0.5 text-[11.5px] text-white/70">{fmtDia(f.inicio)} a {fmtDia(f.fim)}</div>}
            </div>
            <div className="space-y-3 px-4 py-3">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="num font-display text-xl font-semibold text-ink">{sel.size}</div>
                  <div className="text-[10.5px] text-gray-500">puxados</div>
                </div>
                <div>
                  <div className="num font-display text-xl font-semibold text-ink">{novos.length}</div>
                  <div className="text-[10.5px] text-gray-500">cadastrados</div>
                </div>
                <div>
                  <div className="num font-display text-xl font-semibold" style={{ color: "#E0A100" }}>{totalVagas}</div>
                  <div className="text-[10.5px] text-gray-500">vagas abertas</div>
                </div>
              </div>
              {escolhidos.length > 0 && (
                <ul className="max-h-44 divide-y divide-line overflow-y-auto rounded-lg border border-line text-xs">
                  {escolhidos.map((v) => (
                    <li key={v.id} className="flex items-center justify-between gap-2 px-2.5 py-1.5">
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-ink">{nomeDe(v)}</span>
                        <span className="block truncate text-[10.5px] text-gray-500">{v.cargo}</span>
                      </span>
                      <button type="button" onClick={() => alternar(v.id)} className="text-gray-400 hover:text-bad" aria-label="Tirar">
                        <IcFechar tam={13} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <label className="flex cursor-pointer items-start gap-2 text-xs text-gray-600">
                <input type="checkbox" checked={abrirNasOrigens} onChange={(e) => setAbrirNasOrigens(e.target.checked)} className="mt-0.5 accent-[#0A9E7F]" />
                <span>Abrir vaga nas equipes de onde as pessoas saem</span>
              </label>
              {conflitos.length > 0 && <p className="text-[11px] text-bad">{conflitos.length} escolhido(s) não está(ão) livre(s) no período: tire da equipe ou mude as datas.</p>}
              {erro && <Aviso tipo="erro">{erro}</Aviso>}
              <button type="button" onClick={salvar} disabled={!podeSalvar} className="btn-primary w-full">
                {salvando ? "Criando…" : `Criar equipe${total > 0 ? ` com ${total} pessoa${total === 1 ? "" : "s"}` : ""}`}
              </button>
              <p className="text-center text-[11px] text-gray-400">Tudo fica no histórico.</p>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
