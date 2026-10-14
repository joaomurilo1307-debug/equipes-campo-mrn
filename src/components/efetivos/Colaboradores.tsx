"use client";

// Cadastro geral de colaboradores: todos que trabalham nos contratos, com contrato, equipe, empresa, função e situação.
// Hierarquia: contrato -> equipe -> pessoa. Tudo se integra: quem está sem equipe aparece como disponível e pode ser puxado para uma.
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { estadoDaVaga, temNome } from "@/lib/efetivos/disponibilidade";
import { useDados } from "./DadosContext";
import { BarraPartes, BarrasHorizontais, Legenda, Rosca } from "./graficos";
import { A_DEFINIR, contratosConhecidos, corDoContrato, ehReserva, fmtDiaCurto, rotuloContrato, type Equipe, type Vaga } from "./comum";
import { IcBaixo, IcMais } from "./icones";
import ModalVaga from "./modais/ModalVaga";
import { ModalColocarEmEquipe, ModalDesmobilizar } from "./modais/ModaisVagas";
import { CabecalhoPagina, PontoContrato, Secao, Segmentado } from "./ui";

type Linha = { v: Vaga; eq: Equipe | undefined; contrato: string; situacao: "equipe" | "disponivel" | "ocupado" | "ausente" | "fora"; rotuloSituacao: string };

const COR = { livre: "#0E8F63", ocupado: "#1D6FB8", ausente: "#E63329", fora: "#9AA8A1", equipe: "#0A9E7F" };
const CORES_EMPRESA = ["#0A9E7F", "#2F6FDE", "#B86E00", "#7C5CD6"];
const SEM = "—";

export default function Colaboradores() {
  const { dados, idx, hoje, equipePorId, nomeDe } = useDados();
  const podeEditar = dados.podeEditar;
  const params = useSearchParams();
  const [busca, setBusca] = useState("");
  const [contrato, setContrato] = useState(params.get("contrato") ?? "");
  const [equipe, setEquipe] = useState(params.get("equipe") ?? "");
  const [empresa, setEmpresa] = useState("");
  const [funcao, setFuncao] = useState("");
  const [situacao, setSituacao] = useState(params.get("situacao") ?? "");
  const [desmobilizados, setDesmobilizados] = useState(false);
  const [visao, setVisao] = useState<"contrato" | "lista">("contrato");
  const [fechados, setFechados] = useState<Set<string>>(new Set());
  const [modal, setModal] = useState<{ t: "novo" } | { t: "editar"; v: Vaga } | { t: "equipe"; v: Vaga } | { t: "desmob"; v: Vaga } | null>(null);

  const contratosCadastrados = useMemo(() => contratosConhecidos(dados), [dados]);

  // uma linha por colaborador (quem tem nome), com contrato, equipe e situação de hoje
  const linhas: Linha[] = useMemo(() => {
    return dados.vagas
      .filter((v) => temNome(v))
      .map((v) => {
        const eq = equipePorId.get(v.equipeId);
        const c = v.contrato || (eq && !ehReserva(eq) && eq.projeto !== A_DEFINIR ? eq.projeto : "");
        const est = estadoDaVaga(v, idx, hoje);
        const fora = !!eq && ehReserva(eq);
        let situ: Linha["situacao"] = "equipe";
        let rot = "Em equipe";
        if (v.status === "Desmobilizado") (situ = "fora"), (rot = "Desmobilizado");
        else if (est.situacao === "AUSENTE") (situ = "ausente"), (rot = est.motivo ?? "Ausente");
        else if (est.situacao === "ALOCADA") (situ = "ocupado"), (rot = est.motivo ?? "Em campanha");
        else if (fora) (situ = "disponivel"), (rot = "Disponível");
        return { v, eq, contrato: c, situacao: situ, rotuloSituacao: rot };
      });
  }, [dados.vagas, equipePorId, idx, hoje]);

  const empresas = useMemo(() => Array.from(new Set(linhas.map((l) => l.v.empresa))).sort(), [linhas]);
  const funcoes = useMemo(() => Array.from(new Set(linhas.map((l) => l.v.cargo))).sort((a, b) => a.localeCompare(b, "pt-BR")), [linhas]);

  const filtradas = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return linhas.filter((l) => {
      if (!desmobilizados && l.v.status === "Desmobilizado") return false;
      if (contrato && (contrato === "__sem" ? !!l.contrato : l.contrato !== contrato)) return false;
      if (equipe && l.v.equipeId !== equipe) return false;
      if (empresa && l.v.empresa !== empresa) return false;
      if (funcao && l.v.cargo !== funcao) return false;
      if (situacao && l.situacao !== situacao) return false;
      if (t && !`${l.v.nome} ${l.v.cargo} ${l.v.empresa} ${l.contrato} ${l.eq?.nome ?? ""} ${l.v.equipeContrato ?? ""}`.toLowerCase().includes(t)) return false;
      return true;
    });
  }, [linhas, busca, contrato, equipe, empresa, funcao, situacao, desmobilizados]);

  // ---- números e gráficos (sempre sobre quem está ativo no cadastro)
  const ativas = linhas.filter((l) => l.v.status !== "Desmobilizado");
  const n = {
    total: ativas.length,
    emEquipes: ativas.filter((l) => l.eq && !ehReserva(l.eq)).length,
    disponiveis: ativas.filter((l) => l.situacao === "disponivel").length,
    ocupados: ativas.filter((l) => l.situacao === "ocupado").length,
    afastados: ativas.filter((l) => l.situacao === "ausente").length,
    desmob: linhas.length - ativas.length,
  };
  const porContrato = useMemo(() => {
    const m = new Map<string, Map<string, number>>();
    for (const l of ativas) {
      const k = l.contrato || "__sem";
      if (!m.has(k)) m.set(k, new Map());
      m.get(k)!.set(l.v.empresa, (m.get(k)!.get(l.v.empresa) ?? 0) + 1);
    }
    return [...m.entries()].map(([k, e]) => ({ k, e, total: [...e.values()].reduce((s, x) => s + x, 0) })).sort((a, b) => b.total - a.total);
  }, [ativas]);
  const empresasSeries = useMemo(() => Array.from(new Set(ativas.map((l) => l.v.empresa))).sort(), [ativas]);
  const porFuncao = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of ativas) m.set(l.v.cargo, (m.get(l.v.cargo) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [ativas]);
  const porEmpresa = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of ativas) m.set(l.v.empresa, (m.get(l.v.empresa) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [ativas]);

  // ---- agrupamento contrato -> equipe
  const grupos = useMemo(() => {
    const m = new Map<string, Map<string, Linha[]>>();
    for (const l of filtradas) {
      const k = l.contrato || (l.eq && ehReserva(l.eq) ? "__livres" : "__sem");
      const eqNome = l.eq ? (ehReserva(l.eq) ? "Aguardando equipe" : l.eq.nome) : "Sem equipe";
      if (!m.has(k)) m.set(k, new Map());
      if (!m.get(k)!.has(eqNome)) m.get(k)!.set(eqNome, []);
      m.get(k)!.get(eqNome)!.push(l);
    }
    for (const eqs of m.values()) for (const lista of eqs.values()) lista.sort((a, b) => (a.v.nome ?? "").localeCompare(b.v.nome ?? "", "pt-BR"));
    const fim = (x: string) => (x === "__sem" ? 2 : x === "__livres" ? 1 : 0);
    return [...m.entries()].sort(([a], [b]) => fim(a) - fim(b) || a.localeCompare(b, "pt-BR", { numeric: true }));
  }, [filtradas]);

  const alternar = (k: string) =>
    setFechados((s) => {
      const x = new Set(s);
      if (x.has(k)) x.delete(k);
      else x.add(k);
      return x;
    });

  const celula = (l: Linha) => (
    <tr key={l.v.id} className="border-t border-gray-100 hover:bg-gray-50/60">
      <td className="py-1 pl-8 pr-3 text-[12.5px] font-medium text-ink">
        {nomeDe(l.v)}
        {l.eq && ehReserva(l.eq) && l.v.contratoAtual && <span className="ml-2 text-[10.5px] font-normal text-gray-400">vindo de {l.v.contratoAtual}</span>}
        {l.v.observacao && l.v.status !== "Vigente" && <span className="ml-2 text-[10.5px] font-normal text-gray-400">{l.v.status}</span>}
      </td>
      <td className="px-3 py-1 text-[12px] text-gray-700">{l.v.cargo}</td>
      <td className="px-3 py-1 text-[12px] text-gray-600">{l.v.empresa}</td>
      <td className="px-3 py-1 text-[12px] text-gray-500">{l.v.nivel ?? SEM}</td>
      <td className="px-3 py-1 text-center text-[11px] font-semibold text-gray-500">{l.v.direcao4x4 === true ? "4x4" : SEM}</td>
      <td className="px-3 py-1">
        <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-semibold ${l.situacao === "disponivel" ? "bg-ok-soft text-ok" : l.situacao === "equipe" ? "bg-gray-100 text-gray-600" : l.situacao === "ocupado" ? "bg-info-soft text-info" : l.situacao === "ausente" ? "bg-bad-soft text-bad" : "bg-gray-100 text-gray-400"}`}>
          {l.rotuloSituacao}
        </span>
        {l.v.disponivelAPartir && l.v.disponivelAPartir > hoje && <span className="ml-1.5 text-[10.5px] text-gray-400">livre {fmtDiaCurto(l.v.disponivelAPartir)}</span>}
      </td>
      <td className="whitespace-nowrap px-3 py-1 text-right">
        {podeEditar && (
          <>
            <button onClick={() => setModal({ t: "equipe", v: l.v })} className="rounded px-1.5 py-0.5 text-[11px] font-semibold text-brand-dark hover:bg-brand-soft">
              {l.eq && !ehReserva(l.eq) ? "mudar de equipe" : "colocar em equipe"}
            </button>
            {l.eq && !ehReserva(l.eq) && (
              <button onClick={() => setModal({ t: "desmob", v: l.v })} className="rounded px-1.5 py-0.5 text-[11px] font-semibold text-gray-500 hover:bg-bad-soft hover:text-bad">
                desmobilizar
              </button>
            )}
            <button onClick={() => setModal({ t: "editar", v: l.v })} className="rounded px-1.5 py-0.5 text-[11px] font-semibold text-gray-500 hover:bg-gray-100">
              editar
            </button>
          </>
        )}
      </td>
    </tr>
  );

  return (
    <div className="space-y-4">
      <CabecalhoPagina
        titulo="Colaboradores"
        subtitulo="Cadastro geral de todas as pessoas, por contrato e equipe. Quem sai de uma equipe fica aqui, disponível, para ser puxado para outra."
        acoes={
          podeEditar && (
            <button onClick={() => setModal({ t: "novo" })} className="btn-primary">
              <IcMais tam={16} /> Novo colaborador
            </button>
          )
        }
      />

      {/* números */}
      <section className="card grid grid-cols-2 divide-x divide-y divide-line overflow-hidden sm:grid-cols-3 lg:grid-cols-6 lg:divide-y-0">
        {[
          ["Colaboradores", n.total, "cadastrados e ativos", undefined],
          ["Em equipes", n.emEquipes, "alocados em equipe de campo", COR.livre],
          ["Disponíveis", n.disponiveis, "sem equipe, prontos para uma", COR.livre],
          ["Em campanha", n.ocupados, "ou ocupados em outro contrato", COR.ocupado],
          ["Afastados", n.afastados, "férias, INSS, restrição", COR.ausente],
          ["Desmobilizados", n.desmob, "saíram, ficam no histórico", COR.fora],
        ].map(([r, v, s, c]) => (
          <div key={String(r)} className="min-w-0 px-4 py-3">
            <div className="truncate text-[11px] font-semibold uppercase tracking-wider text-gray-500">{r}</div>
            <div className="num mt-0.5 font-display text-[22px] font-semibold leading-tight" style={{ color: (c as string) ?? "#101B17" }}>
              {v}
            </div>
            <div className="truncate text-[11.5px] text-gray-500">{s}</div>
          </div>
        ))}
      </section>

      {/* gráficos */}
      <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <Secao titulo="Colaboradores por contrato" sub="Por empresa, em cada contrato.">
          <BarrasHorizontais
            itens={porContrato.map((c) => ({ rotulo: c.k === "__sem" ? "Sem contrato" : c.k, partes: empresasSeries.map((e) => c.e.get(e) ?? 0) }))}
            series={empresasSeries.map((e, i) => ({ nome: e, cor: CORES_EMPRESA[i % CORES_EMPRESA.length] }))}
          />
          <Legenda className="mt-3" series={empresasSeries.map((e, i) => ({ nome: e, cor: CORES_EMPRESA[i % CORES_EMPRESA.length] }))} />
        </Secao>
        <Secao titulo="Por empresa" sub="Quem trabalha em cada empresa.">
          <div className="flex items-center gap-5">
            <Rosca partes={porEmpresa.map(([e, q], i) => ({ n: q, cor: CORES_EMPRESA[i % CORES_EMPRESA.length], rotulo: e }))} centro={{ valor: n.total, rotulo: "pessoas" }} />
            <ul className="space-y-1.5 text-[12.5px]">
              {porEmpresa.map(([e, q], i) => (
                <li key={e} className="flex items-center gap-2">
                  <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: CORES_EMPRESA[i % CORES_EMPRESA.length] }} />
                  <span className="text-gray-600">{e}</span>
                  <strong className="num text-ink">{q}</strong>
                </li>
              ))}
            </ul>
          </div>
          <div className="mt-4">
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Situação hoje</div>
            <BarraPartes
              alto={9}
              partes={[
                { n: n.emEquipes - n.ocupados - n.afastados, cor: COR.equipe, rotulo: "em equipe" },
                { n: n.disponiveis, cor: "#7CCDB4", rotulo: "disponíveis" },
                { n: n.ocupados, cor: COR.ocupado, rotulo: "em campanha ou outro contrato" },
                { n: n.afastados, cor: COR.ausente, rotulo: "afastados" },
              ]}
            />
          </div>
        </Secao>
        <Secao titulo="Por função" sub="As funções com mais gente.">
          <BarrasHorizontais itens={porFuncao.slice(0, 7).map(([f, q]) => ({ rotulo: f, partes: [q] }))} series={[{ nome: "pessoas", cor: "#0A9E7F" }]} />
          {porFuncao.length > 7 && <p className="mt-2 text-[11px] text-gray-400">+ {porFuncao.length - 7} outras funções</p>}
        </Secao>
      </div>

      {/* filtros */}
      <div className="card flex flex-wrap items-end gap-2.5 p-3">
        <label className="min-w-[220px] flex-1 text-xs">
          <span className="label">Buscar</span>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="nome, função, empresa, contrato ou equipe…" className="field !mt-0.5 !py-1.5" />
        </label>
        <label className="text-xs">
          <span className="label">Contrato</span>
          <select value={contrato} onChange={(e) => setContrato(e.target.value)} className="field !mt-0.5 !w-auto !py-1.5">
            <option value="">Todos</option>
            {contratosCadastrados.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
            {linhas.some((l) => !l.contrato && !(l.eq && ehReserva(l.eq))) && <option value="__sem">Sem contrato</option>}
          </select>
        </label>
        <label className="text-xs">
          <span className="label">Equipe</span>
          <select value={equipe} onChange={(e) => setEquipe(e.target.value)} className="field !mt-0.5 !w-auto !py-1.5">
            <option value="">Todas</option>
            {dados.equipes.map((e) => (
              <option key={e.id} value={e.id}>
                {ehReserva(e) ? "Sem equipe de campo" : e.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          <span className="label">Empresa</span>
          <select value={empresa} onChange={(e) => setEmpresa(e.target.value)} className="field !mt-0.5 !w-auto !py-1.5">
            <option value="">Todas</option>
            {empresas.map((e) => (
              <option key={e}>{e}</option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          <span className="label">Função</span>
          <select value={funcao} onChange={(e) => setFuncao(e.target.value)} className="field !mt-0.5 !w-auto !py-1.5">
            <option value="">Todas</option>
            {funcoes.map((e) => (
              <option key={e}>{e}</option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          <span className="label">Situação</span>
          <select value={situacao} onChange={(e) => setSituacao(e.target.value)} className="field !mt-0.5 !w-auto !py-1.5">
            <option value="">Todas</option>
            <option value="equipe">Em equipe</option>
            <option value="disponivel">Disponíveis (sem equipe)</option>
            <option value="ocupado">Em campanha / outro contrato</option>
            <option value="ausente">Afastados</option>
          </select>
        </label>
        <label className="flex items-center gap-1.5 pb-2 text-xs text-gray-600">
          <input type="checkbox" checked={desmobilizados} onChange={(e) => setDesmobilizados(e.target.checked)} className="accent-[#0A9E7F]" /> desmobilizados
        </label>
        <div className="ml-auto pb-0.5">
          <Segmentado valor={visao} onChange={setVisao} opcoes={[{ id: "contrato", rotulo: "Por contrato" }, { id: "lista", rotulo: "Lista" }]} />
        </div>
      </div>

      {/* lista */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 text-[10.5px] font-semibold uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-3 py-2 pl-8 text-left">Nome</th>
                <th className="px-3 py-2 text-left">Função</th>
                <th className="px-3 py-2 text-left">Empresa</th>
                <th className="px-3 py-2 text-left">Nível</th>
                <th className="px-3 py-2 text-center">4x4</th>
                <th className="px-3 py-2 text-left">Hoje</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            {visao === "contrato" ? (
              grupos.map(([k, eqs]) => {
                const total = [...eqs.values()].reduce((s, l) => s + l.length, 0);
                const aberto = !fechados.has(k);
                return (
                  <tbody key={k}>
                    <tr className="border-t border-line bg-gray-50/80">
                      <td colSpan={7} className="px-3 py-1.5">
                        <button onClick={() => alternar(k)} className="flex items-center gap-2 text-left" aria-expanded={aberto}>
                          <span className={`text-gray-400 transition-transform ${aberto ? "" : "-rotate-90"}`}>
                            <IcBaixo tam={14} />
                          </span>
                          <PontoContrato cor={k === "__sem" || k === "__livres" ? "#9AA8A1" : corDoContrato(k)} />
                          <span className="font-display text-[14px] font-semibold tracking-tight text-ink">{k === "__livres" ? "Disponíveis para uma equipe" : k === "__sem" ? "Sem contrato" : rotuloContrato(k)}</span>
                          <span className="num rounded bg-white px-1.5 text-[11px] font-semibold text-gray-600 ring-1 ring-line">{total}</span>
                          {k !== "__livres" && <span className="text-[11px] text-gray-500">{eqs.size} equipe{eqs.size === 1 ? "" : "s"}</span>}
                        </button>
                      </td>
                    </tr>
                    {aberto &&
                      [...eqs.entries()]
                        .sort(([a], [b]) => (a.startsWith("Sem equipe") ? 1 : b.startsWith("Sem equipe") ? -1 : a.localeCompare(b, "pt-BR", { numeric: true })))
                        .map(([eqNome, lista]) => (
                          <FragmentoEquipe key={eqNome} titulo={eqNome} n={lista.length}>
                            {lista.map(celula)}
                          </FragmentoEquipe>
                        ))}
                  </tbody>
                );
              })
            ) : (
              <tbody>{[...filtradas].sort((a, b) => (a.v.nome ?? "").localeCompare(b.v.nome ?? "", "pt-BR")).map(celula)}</tbody>
            )}
            {filtradas.length === 0 && (
              <tbody>
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-sm text-gray-400">
                    Nenhum colaborador com esses filtros.
                  </td>
                </tr>
              </tbody>
            )}
          </table>
        </div>
      </div>

      {modal?.t === "novo" && <ModalVaga onFechar={() => setModal(null)} onSalvo={() => setModal(null)} />}
      {modal?.t === "editar" && <ModalVaga vaga={modal.v} onFechar={() => setModal(null)} onSalvo={() => setModal(null)} />}
      {modal?.t === "equipe" && <ModalColocarEmEquipe vaga={modal.v} onFechar={() => setModal(null)} />}
      {modal?.t === "desmob" && <ModalDesmobilizar vaga={modal.v} onFechar={() => setModal(null)} />}
    </div>
  );
}

function FragmentoEquipe({ titulo, n, children }: { titulo: string; n: number; children: React.ReactNode }) {
  return (
    <>
      <tr className="border-t border-gray-100">
        <td colSpan={7} className="px-3 py-1 pl-6">
          <span className="text-[12px] font-semibold text-gray-700">{titulo}</span>
          <span className="num ml-2 text-[11px] text-gray-400">{n}</span>
        </td>
      </tr>
      {children}
    </>
  );
}
