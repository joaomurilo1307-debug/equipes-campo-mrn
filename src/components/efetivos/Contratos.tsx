"use client";

import { useMemo, useState } from "react";
import { temNome } from "@/lib/efetivos/disponibilidade";
import { localizacaoNoDia } from "@/lib/efetivos/veiculos";
import { useDados } from "./DadosContext";
import { A_DEFINIR, CHIP_STATUS_CAMPANHA, SEM_CONTRATO, chamar, contratosConhecidos, corDoContrato, fmtDia, rotuloContrato, type Contrato } from "./comum";
import { IcLixo, IcMais } from "./icones";
import { CampoInline } from "./inline";
import { Aviso, CabecalhoPagina, Campo, Modal, PontoContrato, RodapeModal, Vazio } from "./ui";

export default function Contratos() {
  const { dados, hoje, recarregar, vagasPorEquipe, veiculosPorEquipe, equipesCampo } = useDados();
  const [sel, setSel] = useState<string>("");
  const [novo, setNovo] = useState(false);
  const [adicionar, setAdicionar] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  const codigos = useMemo(() => contratosConhecidos(dados), [dados]);
  const semContratoEquipes = equipesCampo.filter((e) => !e.projeto || e.projeto === A_DEFINIR);
  const itens = useMemo(() => {
    const lista = codigos.map((c) => ({ codigo: c, contrato: dados.contratos.find((x) => x.codigo === c) ?? null }));
    return semContratoEquipes.length > 0 || codigos.length === 0 ? [...lista, { codigo: A_DEFINIR, contrato: null as Contrato | null }] : lista;
  }, [codigos, dados.contratos, semContratoEquipes.length]);

  const atualCodigo = sel && itens.some((i) => i.codigo === sel) ? sel : itens[0]?.codigo ?? "";
  const atual = itens.find((i) => i.codigo === atualCodigo);
  const ehSem = atualCodigo === A_DEFINIR;

  const equipes = equipesCampo.filter((e) => (ehSem ? !e.projeto || e.projeto === A_DEFINIR : e.projeto === atualCodigo));
  const campanhas = dados.campanhas.filter((c) => c.projeto === atualCodigo);
  const viaturasHoje = dados.veiculos.filter((v) => {
    const loc = localizacaoNoDia(dados.movimentos.filter((m) => m.veiculoId === v.id), hoje);
    return ehSem ? !loc || loc.projeto === A_DEFINIR : loc?.projeto === atualCodigo;
  });
  const pessoas = equipes.reduce((s, e) => s + (vagasPorEquipe.get(e.id) ?? []).filter(temNome).length, 0);
  const vagasTotal = equipes.reduce((s, e) => s + (vagasPorEquipe.get(e.id) ?? []).length, 0);

  async function salvarCampo(campo: string, valor: string): Promise<string | null> {
    setErro(null);
    if (!atual) return null;
    const corpo = { [campo]: valor || null };
    const r = atual.contrato ? await chamar("PATCH", `/api/efetivos/contratos/${atual.contrato.id}`, campo === "codigo" ? { codigo: valor } : corpo) : await chamar("POST", "/api/efetivos/contratos", { codigo: atual.codigo, ...corpo });
    if (!r.ok) return r.dados.error ?? "Não foi possível salvar";
    await recarregar();
    if (campo === "codigo") setSel(valor);
    return null;
  }

  async function moverEquipe(equipeId: string, codigo: string) {
    setErro(null);
    const r = await chamar("PATCH", `/api/efetivos/equipes/${equipeId}`, { projeto: codigo || A_DEFINIR });
    if (!r.ok) return setErro(r.dados.error ?? "Não foi possível mover a equipe");
    await recarregar();
  }

  async function excluirCadastro() {
    if (!atual?.contrato || !window.confirm(`Excluir o cadastro do contrato ${atual.codigo}? As equipes continuam com o código dele.`)) return;
    const r = await chamar("DELETE", `/api/efetivos/contratos/${atual.contrato.id}`);
    if (!r.ok) return setErro(r.dados.error ?? "Não foi possível excluir");
    await recarregar();
  }

  const podeEditar = dados.podeEditar;
  const naoEstaAqui = equipesCampo.filter((e) => !equipes.some((x) => x.id === e.id));

  return (
    <div>
      <CabecalhoPagina
        titulo="Contratos"
        subtitulo="Os contratos e o que está em cada um: equipes, viaturas e campanhas. Cadastre os dados do contrato e distribua as equipes."
        acoes={
          podeEditar && (
            <button onClick={() => setNovo(true)} className="btn-primary">
              <IcMais tam={16} /> Novo contrato
            </button>
          )
        }
      />

      <div className="grid gap-5 lg:grid-cols-[250px_minmax(0,1fr)]">
        <aside className="card self-start p-3">
          <ul className="space-y-0.5">
            {itens.map((i) => {
              const ativo = i.codigo === atualCodigo;
              const nEq = equipesCampo.filter((e) => (i.codigo === A_DEFINIR ? !e.projeto || e.projeto === A_DEFINIR : e.projeto === i.codigo)).length;
              return (
                <li key={i.codigo}>
                  <button onClick={() => setSel(i.codigo)} className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left ${ativo ? "bg-brand-soft" : "hover:bg-gray-50"}`}>
                    <PontoContrato cor={corDoContrato(i.codigo)} tam={9} />
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate text-[13px] ${ativo ? "font-semibold text-brand-dark" : "font-medium"}`}>{rotuloContrato(i.codigo)}</span>
                      {i.contrato?.nome && <span className="block truncate text-[11px] text-gray-500">{i.contrato.nome}</span>}
                    </span>
                    <span className="num shrink-0 text-[11px] text-gray-500">{nEq}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {itens.length === 0 && <p className="px-2 py-4 text-center text-xs text-gray-400">Nenhum contrato ainda.</p>}
        </aside>

        <div className="min-w-0 space-y-4">
          {erro && <Aviso tipo="erro">{erro}</Aviso>}
          {atual ? (
            <>
              <section className="card p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h2 className="flex items-center gap-2.5 font-display text-[18px] font-semibold tracking-tight">
                    <PontoContrato cor={corDoContrato(atual.codigo)} tam={12} />
                    {ehSem ? SEM_CONTRATO : atual.codigo}
                  </h2>
                  {podeEditar && !ehSem && atual.contrato && (
                    <button onClick={excluirCadastro} className="btn-danger btn-sm">
                      <IcLixo tam={13} /> Excluir cadastro
                    </button>
                  )}
                </div>
                {ehSem ? (
                  <p className="text-[13px] text-gray-500">Equipes e viaturas que ainda não foram ligadas a um contrato. Escolha o contrato de cada uma abaixo.</p>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    <CampoInline rotulo="Código (como o time chama)" valor={atual.codigo} onSalvar={(v) => salvarCampo("codigo", v)} desabilitado={!podeEditar || !atual.contrato} />
                    <CampoInline rotulo="Nome / descrição" valor={atual.contrato?.nome ?? ""} onSalvar={(v) => salvarCampo("nome", v)} desabilitado={!podeEditar} />
                    <CampoInline rotulo="Cliente" valor={atual.contrato?.cliente ?? ""} onSalvar={(v) => salvarCampo("cliente", v)} desabilitado={!podeEditar} />
                    <CampoInline rotulo="Gestor MRN" valor={atual.contrato?.gestor ?? ""} onSalvar={(v) => salvarCampo("gestor", v)} desabilitado={!podeEditar} />
                    <CampoInline rotulo="Local" valor={atual.contrato?.local ?? ""} onSalvar={(v) => salvarCampo("local", v)} desabilitado={!podeEditar} />
                    <CampoInline rotulo="Observações" valor={atual.contrato?.observacao ?? ""} linhas={1} onSalvar={(v) => salvarCampo("observacao", v)} desabilitado={!podeEditar} />
                  </div>
                )}
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 border-t border-line pt-3 text-[12px] text-gray-600">
                  <span><strong className="num text-ink">{equipes.length}</strong> equipe{equipes.length === 1 ? "" : "s"}</span>
                  <span><strong className="num text-ink">{pessoas}</strong> de {vagasTotal} vagas preenchidas</span>
                  <span><strong className="num text-ink">{viaturasHoje.length}</strong> viatura{viaturasHoje.length === 1 ? "" : "s"} hoje</span>
                  <span><strong className="num text-ink">{campanhas.length}</strong> campanha{campanhas.length === 1 ? "" : "s"}</span>
                </div>
              </section>

              <section className="card overflow-hidden">
                <div className="card-h !py-2.5">
                  <h3 className="card-t">Equipes {ehSem ? "sem contrato" : "neste contrato"}</h3>
                  {podeEditar && !ehSem && naoEstaAqui.length > 0 && (
                    <div className="flex items-center gap-2">
                      <select value={adicionar} onChange={(e) => setAdicionar(e.target.value)} className="rounded-md border border-line bg-white px-2 py-1.5 text-[12.5px]" aria-label="Equipe para adicionar">
                        <option value="">Adicionar equipe…</option>
                        {naoEstaAqui.map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.nome} ({rotuloContrato(e.projeto)})
                          </option>
                        ))}
                      </select>
                      <button disabled={!adicionar} onClick={async () => { await moverEquipe(adicionar, atual.codigo); setAdicionar(""); }} className="btn-primary btn-sm">
                        Adicionar
                      </button>
                    </div>
                  )}
                </div>
                <table className="tbl text-[12.5px]">
                  <thead>
                    <tr>
                      <th>Equipe</th>
                      <th>Grupo</th>
                      <th className="text-right">Vagas</th>
                      <th className="text-right">Viaturas</th>
                      {podeEditar && <th>{ehSem ? "Definir contrato" : ""}</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {equipes.map((e) => {
                      const vs = vagasPorEquipe.get(e.id) ?? [];
                      return (
                        <tr key={e.id}>
                          <td>
                            <div className="font-medium">{e.nome}</div>
                            <div className="text-[11px] text-gray-500">{e.codigo}</div>
                          </td>
                          <td className="text-gray-600">{e.grupo}</td>
                          <td className="num text-right">
                            {vs.filter(temNome).length}/{vs.length}
                          </td>
                          <td className="num text-right">{(veiculosPorEquipe.get(e.id) ?? []).length}</td>
                          {podeEditar && (
                            <td>
                              {ehSem ? (
                                <select defaultValue="" onChange={(ev) => ev.target.value && moverEquipe(e.id, ev.target.value)} className="rounded-md border border-line bg-white px-2 py-1 text-[12px]" aria-label={`Contrato de ${e.nome}`}>
                                  <option value="">Escolher contrato…</option>
                                  {codigos.map((c) => (
                                    <option key={c} value={c}>
                                      {c}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <button onClick={() => moverEquipe(e.id, "")} className="btn-ghost btn-sm">
                                  Tirar do contrato
                                </button>
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                    {equipes.length === 0 && (
                      <tr>
                        <td colSpan={5}>
                          <Vazio titulo="Nenhuma equipe aqui" texto={podeEditar && !ehSem ? "Use “Adicionar equipe…” para colocar uma equipe neste contrato." : undefined} />
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </section>

              <div className="grid gap-4 xl:grid-cols-2">
                <section className="card overflow-hidden">
                  <div className="card-h !py-2.5">
                    <h3 className="card-t">Viaturas hoje</h3>
                  </div>
                  <ul className="divide-y divide-line text-[12.5px]">
                    {viaturasHoje.map((v) => {
                      const loc = localizacaoNoDia(dados.movimentos.filter((m) => m.veiculoId === v.id), hoje);
                      const eq = loc?.equipeId ? dados.equipes.find((e) => e.id === loc.equipeId) : null;
                      return (
                        <li key={v.id} className="flex items-center justify-between gap-3 px-4 py-2">
                          <span className="font-semibold">{v.identificacao}</span>
                          <span className="min-w-0 flex-1 truncate text-gray-500">{[v.placa, eq?.nome].filter(Boolean).join(" · ")}</span>
                          <span className="shrink-0 text-[11px] text-gray-400">{loc ? `desde ${fmtDia(loc.inicio)}` : ""}</span>
                        </li>
                      );
                    })}
                    {viaturasHoje.length === 0 && <li className="px-4 py-6 text-center text-gray-400">Nenhuma viatura.</li>}
                  </ul>
                </section>
                <section className="card overflow-hidden">
                  <div className="card-h !py-2.5">
                    <h3 className="card-t">Campanhas</h3>
                  </div>
                  <ul className="divide-y divide-line text-[12.5px]">
                    {campanhas.map((c) => (
                      <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-2">
                        <span className="font-mono font-semibold">{c.codigo}</span>
                        <span className="min-w-0 flex-1 truncate text-gray-500">
                          {c.atividade} · {fmtDia(c.inicio)} a {fmtDia(c.fim)}
                        </span>
                        <span className={CHIP_STATUS_CAMPANHA[c.status]}>{c.status}</span>
                      </li>
                    ))}
                    {campanhas.length === 0 && <li className="px-4 py-6 text-center text-gray-400">Nenhuma campanha.</li>}
                  </ul>
                </section>
              </div>
            </>
          ) : (
            <div className="card">
              <Vazio titulo="Nenhum contrato ainda" texto={podeEditar ? "Cadastre o primeiro contrato e depois coloque as equipes nele." : undefined} acao={podeEditar ? <button onClick={() => setNovo(true)} className="btn-primary">Novo contrato</button> : undefined} />
            </div>
          )}
        </div>
      </div>

      {novo && (
        <ModalNovoContrato
          onFechar={() => setNovo(false)}
          onCriado={(codigo) => {
            setNovo(false);
            setSel(codigo);
          }}
        />
      )}
    </div>
  );
}

function ModalNovoContrato({ onFechar, onCriado }: { onFechar: () => void; onCriado: (codigo: string) => void }) {
  const { recarregar } = useDados();
  const [f, setF] = useState({ codigo: "", nome: "", cliente: "", gestor: "", local: "", observacao: "" });
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  async function salvar() {
    setSalvando(true);
    setErro(null);
    const r = await chamar("POST", "/api/efetivos/contratos", { codigo: f.codigo, nome: f.nome || null, cliente: f.cliente || null, gestor: f.gestor || null, local: f.local || null, observacao: f.observacao || null });
    setSalvando(false);
    if (!r.ok) return setErro(r.dados.error ?? "Não foi possível criar");
    await recarregar();
    onCriado(f.codigo.trim());
  }
  return (
    <Modal titulo="Novo contrato" onFechar={onFechar}>
      <div className="grid gap-4 px-6 py-5 sm:grid-cols-2">
        <Campo rotulo="Código (como o time chama)" className="sm:col-span-2">
          <input value={f.codigo} onChange={(e) => set("codigo", e.target.value)} placeholder="ex.: 3636 PNM" className="field" autoFocus />
        </Campo>
        <Campo rotulo="Nome / descrição" className="sm:col-span-2">
          <input value={f.nome} onChange={(e) => set("nome", e.target.value)} className="field" />
        </Campo>
        <Campo rotulo="Cliente">
          <input value={f.cliente} onChange={(e) => set("cliente", e.target.value)} className="field" />
        </Campo>
        <Campo rotulo="Gestor MRN">
          <input value={f.gestor} onChange={(e) => set("gestor", e.target.value)} className="field" />
        </Campo>
        <Campo rotulo="Local" className="sm:col-span-2">
          <input value={f.local} onChange={(e) => set("local", e.target.value)} className="field" />
        </Campo>
        <Campo rotulo="Observações" className="sm:col-span-2">
          <textarea value={f.observacao} onChange={(e) => set("observacao", e.target.value)} rows={2} className="field" />
        </Campo>
      </div>
      {erro && (
        <div className="px-6 pb-4">
          <Aviso tipo="erro">{erro}</Aviso>
        </div>
      )}
      <RodapeModal>
        <button onClick={onFechar} className="btn-ghost">
          Cancelar
        </button>
        <button onClick={salvar} disabled={salvando || !f.codigo.trim()} className="btn-primary">
          {salvando ? "Criando…" : "Criar contrato"}
        </button>
      </RodapeModal>
    </Modal>
  );
}
