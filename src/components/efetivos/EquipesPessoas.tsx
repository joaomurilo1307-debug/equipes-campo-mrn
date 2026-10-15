"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { STATUS_EQUIPE, STATUS_VAGA, gruposParaMostrar, temNome } from "@/lib/efetivos/disponibilidade";
import { ROTULO_ESTADO_EQUIPE, ROTULO_SITUACAO, estadoDaEquipe } from "@/lib/efetivos/situacao";
import { localizacaoNoDia } from "@/lib/efetivos/veiculos";
import { useDados } from "./DadosContext";
import { A_DEFINIR, CHIP_VEICULO, SEM_CONTRATO, chamar, ehReserva, contratosConhecidos, corDoContrato, fmtDia, rotuloContrato, type Equipe, type Vaga, type Veiculo } from "./comum";
import { IcBusca, IcCalendario, IcLapis, IcMais, IcMover } from "./icones";
import { CampoInline } from "./inline";
import ImportarPlanilha from "./ImportarPlanilha";
import ModalAusencias from "./modais/ModalAusencias";
import ModalEquipe from "./modais/ModalEquipe";
import ModalOcupantes from "./modais/ModalOcupantes";
import ModalVaga from "./modais/ModalVaga";
import { ModalAbrirVaga, ModalDesmobilizar, ModalPuxar } from "./modais/ModaisVagas";
import { ModalHistoricoVeiculo, ModalMover, ModalVeiculo } from "./modais/ModaisVeiculo";
import { Aviso, CabecalhoPagina, Modal, PontoContrato, Vazio } from "./ui";

const CHIP_SITUACAO: Record<string, string> = { EM_EQUIPE: "chip-ok", DISPONIVEL: "chip-info", OUTRO_CONTRATO: "chip-info", AUSENTE: "chip-bad", VAGA_ABERTA: "chip-warn", SEM_NOME: "chip-mute", DESMOBILIZADO: "chip-mute" };

export default function EquipesPessoas() {
  const { dados, vagasPorEquipe, equipesCampo } = useDados();
  const grupos = gruposParaMostrar(equipesCampo.map((e) => e.grupo));
  const [sel, setSel] = useState<string | null>(null);
  const [filtroGrupo, setFiltroGrupo] = useState("");
  const [busca, setBusca] = useState("");
  const [importar, setImportar] = useState(false);

  // abre na equipe pedida (?equipe=ID) ou na primeira
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("equipe");
    setSel(id && dados.equipes.some((e) => e.id === id) ? id : equipesCampo[0]?.id ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const equipeSel = dados.equipes.find((e) => e.id === sel) ?? null;

  const t = busca.trim().toLowerCase();
  const visiveis = dados.equipes.filter((e) => {
    if (filtroGrupo && e.grupo !== filtroGrupo) return false;
    if (!t) return true;
    return `${e.codigo} ${e.nome} ${e.projeto}`.toLowerCase().includes(t) || (vagasPorEquipe.get(e.id) ?? []).some((v) => (v.nome ?? "").toLowerCase().includes(t) || v.cargo.toLowerCase().includes(t));
  });
  const reservaVisivel = visiveis.filter(ehReserva);
  const porContrato = useMemo(() => {
    const m = new Map<string, Equipe[]>();
    for (const e of visiveis.filter((x) => !ehReserva(x))) {
      const k = !e.projeto || e.projeto === A_DEFINIR ? A_DEFINIR : e.projeto;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(e);
    }
    return [...m.entries()].sort(([a], [b]) => (a === A_DEFINIR ? 1 : b === A_DEFINIR ? -1 : a.localeCompare(b, "pt-BR", { numeric: true })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dados.equipes, filtroGrupo, busca, dados.vagas]);

  return (
    <div>
      <CabecalhoPagina
        titulo="Equipes"
        subtitulo="A composição de cada equipe: atividade, empresa, nível, função, profissional, 4x4, carro e status. Tudo editável; quem sai abre vaga, e a vaga se preenche puxando um colaborador."
        acoes={
          dados.podeEditar && (
            <>
              <Link href="/vagas/abrir" className="btn-ghost">
                <IcMais tam={16} /> Abrir vaga / novo cargo
              </Link>
              <Link href={sel ? `/equipes/movimentar?equipe=${sel}` : "/equipes/movimentar"} className="btn-ghost">
                <IcMover tam={16} /> Movimentar equipe
              </Link>
              <Link href="/equipes/nova" className="btn-primary">
                <IcMais tam={16} /> Nova equipe
              </Link>
            </>
          )
        }
      />

      <div className="grid gap-5 lg:grid-cols-[272px_minmax(0,1fr)]">
        {/* lista de equipes */}
        <aside className="lg:sticky lg:top-4 lg:self-start">
          <div className="card p-3">
            <div className="mb-2.5 flex gap-2">
              <span className="relative block flex-1">
                <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400">
                  <IcBusca tam={14} />
                </span>
                <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar" className="w-full rounded-md border border-line bg-white py-1.5 pl-8 pr-2 text-[13px] focus:border-brand focus:outline-none" />
              </span>
              {grupos.length > 0 && (
                <select value={filtroGrupo} onChange={(e) => setFiltroGrupo(e.target.value)} className="rounded-md border border-line bg-white px-2 py-1.5 text-[13px]" aria-label="Grupo">
                  <option value="">Grupos</option>
                  {grupos.map((g) => (
                    <option key={g}>{g}</option>
                  ))}
                </select>
              )}
            </div>
            <div className="max-h-[calc(133.333vh-300px)] space-y-3 overflow-y-auto pr-0.5">
              {porContrato.map(([projeto, equipes]) => (
                <div key={projeto}>
                  <div className="mb-1 flex items-center gap-1.5 px-1 text-[10.5px] font-semibold uppercase tracking-wider text-gray-500">
                    <PontoContrato cor={corDoContrato(projeto)} tam={8} />
                    {rotuloContrato(projeto)}
                    <span className="num font-normal text-gray-400">{equipes.length}</span>
                  </div>
                  <ul className="space-y-0.5">
                    {equipes.map((e) => {
                      const vs = vagasPorEquipe.get(e.id) ?? [];
                      const ativa = e.id === sel;
                      return (
                        <li key={e.id}>
                          <button onClick={() => setSel(e.id)} className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors ${ativa ? "bg-brand-soft" : "hover:bg-gray-50"}`} aria-current={ativa ? "true" : undefined}>
                            <span className="min-w-0 flex-1">
                              <span className={`block truncate text-[12.5px] leading-tight ${ativa ? "font-semibold text-brand-dark" : "font-medium text-ink"}`}>{e.nome}</span>
                              <span className="block text-[10.5px] text-gray-500">
                                {e.codigo}{e.grupo ? ` · ${e.grupo}` : ""}
                              </span>
                            </span>
                            <span className="flex shrink-0 items-center gap-1">
                              {vs.some((v) => !temNome(v) && !v.semNome) && <span className="num rounded bg-warn-soft px-1.5 py-0.5 text-[10.5px] font-semibold text-warn" title="vagas abertas">{vs.filter((v) => !temNome(v) && !v.semNome).length}</span>}
                              <span className="num rounded bg-white px-1.5 py-0.5 text-[10.5px] font-semibold text-gray-600 ring-1 ring-line" title="posições preenchidas / total">
                                {vs.filter((v) => temNome(v) || v.semNome).length}/{vs.length}
                              </span>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
              {reservaVisivel.map((e) => {
                const vs = vagasPorEquipe.get(e.id) ?? [];
                const ativa = e.id === sel;
                return (
                  <div key={e.id} className="border-t border-line pt-2.5">
                    <div className="mb-1 px-1 text-[10.5px] font-semibold uppercase tracking-wider text-gray-500">Reserva (não é equipe)</div>
                    <button onClick={() => setSel(e.id)} className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors ${ativa ? "bg-brand-soft" : "hover:bg-gray-50"}`} aria-current={ativa ? "true" : undefined}>
                      <span className="min-w-0 flex-1">
                        <span className={`block truncate text-[12.5px] leading-tight ${ativa ? "font-semibold text-brand-dark" : "font-medium text-ink"}`}>Apoio a mobilizar</span>
                        <span className="block text-[10.5px] text-gray-500">pessoas vindas de outro contrato</span>
                      </span>
                      <span className="num shrink-0 rounded bg-white px-1.5 py-0.5 text-[10.5px] font-semibold text-gray-600 ring-1 ring-line">{vs.length}</span>
                    </button>
                  </div>
                );
              })}
              {visiveis.length === 0 && <p className="px-1 py-4 text-center text-xs text-gray-400">{dados.equipes.length === 0 ? "Nenhuma equipe ainda." : "Nenhuma equipe neste filtro."}</p>}
            </div>
          </div>
        </aside>

        {/* ficha da equipe */}
        <div className="min-w-0">
          {equipeSel ? (
            <FichaEquipe key={equipeSel.id} equipe={equipeSel} aoExcluir={() => setSel(equipesCampo.find((e) => e.id !== equipeSel.id)?.id ?? null)} />
          ) : (
            <div className="card">
              <Vazio titulo="Nenhuma equipe selecionada" texto={dados.podeEditar ? "Crie a primeira equipe ou importe a planilha do Samuel." : undefined} acao={dados.podeEditar ? <button onClick={() => setImportar(true)} className="btn-primary">Importar planilha</button> : undefined} />
            </div>
          )}
        </div>
      </div>

      {importar && (
        <Modal titulo="Importar planilha" onFechar={() => setImportar(false)}>
          <ImportarPlanilha onConcluido={() => setImportar(false)} />
        </Modal>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- ficha de uma equipe

function FichaEquipe({ equipe, aoExcluir }: { equipe: Equipe; aoExcluir: () => void }) {
  const { dados, hoje, vagasPorEquipe, veiculosPorEquipe, equipesPorVeiculo, equipePorId, ocupantesPorVeiculo, veiculoPorId, recarregar, nomeDe, ocultarNomes, situacaoDe, contagemDe, movimentosPorEquipe } = useDados();
  const grupos = gruposParaMostrar([...dados.equipes.map((e) => e.grupo), "Fauna", "Flora"]);
  const contratos = useMemo(() => contratosConhecidos(dados), [dados]);
  const podeEditar = dados.podeEditar;
  const [editar, setEditar] = useState(false);
  const [novaVaga, setNovaVaga] = useState(false);
  const [abrirVaga, setAbrirVaga] = useState(false);
  const [puxar, setPuxar] = useState<{ vaga: Vaga | null } | null>(null);
  const [desmobilizar, setDesmobilizar] = useState<Vaga | null>(null);
  const [detalhes, setDetalhes] = useState<Vaga | null>(null);
  const [ausenciasDe, setAusenciasDe] = useState<Vaga | null>(null);
  const [ocupantes, setOcupantes] = useState<Veiculo | null>(null);
  const [viatura, setViatura] = useState<{ t: "mover" | "historico" | "editar" | "nova"; v?: Veiculo } | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const vagas = [...(vagasPorEquipe.get(equipe.id) ?? [])].sort((a, b) => (a.numero ?? 0) - (b.numero ?? 0));
  const viaturas = veiculosPorEquipe.get(equipe.id) ?? [];

  const contagem = contagemDe([equipe.id]);
  const estado = ROTULO_ESTADO_EQUIPE[estadoDaEquipe(equipe, contagem, hoje)];
  const passagens = [...(movimentosPorEquipe.get(equipe.id) ?? [])].sort((a, b) => b.inicio.localeCompare(a.inicio));

  const salvarEquipe = (campo: string) => async (novo: string) => {
    const valor = campo === "projeto" ? novo || A_DEFINIR : novo || null;
    const r = await chamar("PATCH", `/api/efetivos/equipes/${equipe.id}`, { [campo]: valor });
    if (!r.ok) return r.dados.error ?? "Não foi possível salvar";
    await recarregar();
    return null;
  };
  async function alterarVaga(v: Vaga, corpo: Record<string, unknown>) {
    const r = await chamar("PATCH", `/api/efetivos/vagas/${v.id}`, corpo);
    if (!r.ok) return setAviso(r.dados.error ?? "Não foi possível salvar");
    await recarregar();
  }

  // viaturas: celula do carro mesclada para as linhas seguidas que vao no mesmo carro (como na planilha)
  const spans = useMemo(() => {
    const m = new Map<string, number>(); // vagaId -> rowSpan (so na 1a linha do grupo); 0 = pula
    let i = 0;
    while (i < vagas.length) {
      const id = vagas[i].veiculoId;
      let j = i + 1;
      if (id) while (j < vagas.length && vagas[j].veiculoId === id) j++;
      m.set(vagas[i].id, j - i);
      for (let k = i + 1; k < j; k++) m.set(vagas[k].id, 0);
      i = j;
    }
    return m;
  }, [vagas]);

  const campoEquipe = podeEditar ? undefined : true;
  return (
    <div className="space-y-4">
      {aviso && (
        <div className="cursor-pointer" onClick={() => setAviso(null)}>
          <Aviso tipo="atencao">{aviso}</Aviso>
        </div>
      )}

      {/* cabeçalho / dados da equipe */}
      <section className="card p-4">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[11px] text-gray-500">{equipe.codigo}</span>
              {equipe.grupo && <span className="chip-mute">{equipe.grupo}</span>}
              <span className={estado.chip} title={estado.dica}>
                {estado.rotulo}
              </span>
              {equipe.status !== "Ativa" && <span className="chip-mute">{equipe.status}</span>}
            </div>
            <h2 className="mt-1 font-display text-[18px] font-semibold leading-snug tracking-tight">{equipe.nome}</h2>
          </div>
          {podeEditar && (
            <button onClick={() => setEditar(true)} className="btn-ghost btn-sm">
              <IcLapis tam={13} /> Editar tudo / excluir
            </button>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <CampoInline rotulo="Contrato" valor={equipe.projeto === A_DEFINIR ? "" : equipe.projeto} lista={contratos} placeholder={SEM_CONTRATO} onSalvar={salvarEquipe("projeto")} desabilitado={campoEquipe} />
          <CampoInline rotulo="Gestor MRN" valor={equipe.gestor ?? ""} onSalvar={salvarEquipe("gestor")} desabilitado={campoEquipe} />
          <CampoInline rotulo="Local / frente" valor={equipe.local ?? ""} onSalvar={salvarEquipe("local")} desabilitado={campoEquipe} />
          <label className="block">
            <span className="text-[11px] font-medium text-gray-500">Situação</span>
            <select
              value={equipe.status}
              disabled={!podeEditar}
              onChange={(e) => salvarEquipe("status")(e.target.value)}
              className="mt-1 block w-full rounded-md border border-line bg-white px-2.5 py-1.5 text-[13px] focus:border-brand focus:outline-none disabled:bg-gray-50"
            >
              {STATUS_EQUIPE.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <CampoInline rotulo="Grupo (opcional)" valor={equipe.grupo} lista={grupos} onSalvar={salvarEquipe("grupo")} desabilitado={campoEquipe} />
          <label className="block">
            <span className="text-[11px] font-medium text-gray-500">Período da equipe — início</span>
            <input type="date" disabled={!podeEditar} value={equipe.inicio ?? ""} onChange={(e) => salvarEquipe("inicio")(e.target.value)} className="mt-1 block w-full rounded-md border border-line bg-white px-2.5 py-1.5 text-[13px] focus:border-brand focus:outline-none disabled:bg-gray-50" />
          </label>
          <label className="block">
            <span className="text-[11px] font-medium text-gray-500" title="No dia seguinte ao fim, as pessoas da equipe ficam disponíveis">Período da equipe — fim</span>
            <input type="date" disabled={!podeEditar} value={equipe.fim ?? ""} min={equipe.inicio ?? undefined} onChange={(e) => salvarEquipe("fim")(e.target.value)} className="mt-1 block w-full rounded-md border border-line bg-white px-2.5 py-1.5 text-[13px] focus:border-brand focus:outline-none disabled:bg-gray-50" />
          </label>
          <CampoInline rotulo="Observações" valor={equipe.observacao ?? ""} linhas={1} onSalvar={salvarEquipe("observacao")} desabilitado={campoEquipe} className="sm:col-span-2 xl:col-span-4" />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-line pt-3 text-[12px] text-gray-600">
          <span>
            <strong className="num text-ink">{vagas.filter((v) => temNome(v) || v.semNome).length}</strong>/{vagas.length} vagas preenchidas
          </span>
          {contagem.semNome > 0 && (
            <span className="text-gray-500">
              <strong className="num text-ink">{contagem.semNome}</strong> sem nome informado
            </span>
          )}
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-ok" /> <strong className="num">{contagem.emEquipe}</strong> em equipe</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-bad" /> <strong className="num">{contagem.ausentes}</strong> ausentes</span>
          {contagem.disponiveis > 0 && <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-info" /> <strong className="num">{contagem.disponiveis}</strong> disponíveis (equipe encerrada)</span>}
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-[#E0A100]" /> <strong className="num">{contagem.abertas}</strong> vagas abertas</span>
          <span>
            <strong className="num text-ink">{vagas.filter((v) => v.direcao4x4 === true).length}</strong> dirigem 4x4
          </span>
        </div>
      </section>

      {/* composição, como na planilha */}
      <section className="card overflow-hidden">
        <div className="card-h !py-2.5">
          <h3 className="card-t">Composição da equipe</h3>
          {podeEditar && (
            <div className="flex flex-wrap gap-1.5">
              <button onClick={() => setPuxar({ vaga: null })} className="btn-ghost btn-sm" title="Puxar alguém já cadastrado para esta equipe">
                Puxar colaborador
              </button>
              <button onClick={() => setAbrirVaga(true)} className="btn-ghost btn-sm" title="Aumentar a equipe: abrir vaga(s), inclusive de um cargo que ainda não existe">
                <IcMais tam={13} /> Abrir vaga / novo cargo
              </button>
              <button onClick={() => setNovaVaga(true)} className="btn-ghost btn-sm" title="Cadastrar uma pessoa nova direto nesta equipe">
                <IcMais tam={13} /> Cadastrar pessoa
              </button>
            </div>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead className="bg-gray-50 text-[10.5px] font-semibold uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-3 py-2 text-left">Atividade</th>
                <th className="px-3 py-2 text-left">Empresa</th>
                <th className="px-3 py-2 text-left">Nível</th>
                <th className="px-3 py-2 text-left">Cargo / função</th>
                <th className="px-3 py-2 text-left">Profissional</th>
                <th className="px-3 py-2 text-center" title="Habilitado a dirigir 4x4">4x4</th>
                <th className="px-3 py-2 text-center">Carro</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">Hoje</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {vagas.map((v, i) => {
                const est = situacaoDe(v);
                const nAus = dados.ausencias.filter((a) => a.vagaId === v.id).length;
                const span = spans.get(v.id) ?? 1;
                const carro = v.veiculoId ? veiculoPorId.get(v.veiculoId) : null;
                const trocouAtividade = i > 0 && vagas[i - 1].atividade !== v.atividade;
                return (
                  <tr key={v.id} className={`border-t align-middle ${trocouAtividade ? "border-t-2 border-gray-300" : "border-gray-100"} hover:bg-gray-50/60`}>
                    <td className="whitespace-nowrap px-3 py-1.5 text-gray-600">{v.atividade}</td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-gray-600">{v.empresa}</td>
                    <td className="px-3 py-1.5 text-gray-500">{v.nivel ?? "—"}</td>
                    <td className="min-w-[210px] px-3 py-1.5 text-ink">{v.cargo}</td>
                    <td className="px-3 py-1">
                      {podeEditar && !ocultarNomes ? (
                        <input
                          key={`${v.id}-${v.nome ?? ""}`}
                          defaultValue={v.nome ?? ""}
                          placeholder={v.semNome ? "nome não informado" : "vaga aberta"}
                          onBlur={(ev) => {
                            const novo = ev.target.value.trim();
                            if (novo !== (v.nome ?? "")) alterarVaga(v, { nome: novo || null });
                          }}
                          onKeyDown={(ev) => ev.key === "Enter" && (ev.target as HTMLInputElement).blur()}
                          className="w-full min-w-[170px] rounded-md border border-transparent bg-transparent px-2 py-1 text-[12.5px] font-medium text-ink placeholder:font-normal placeholder:italic placeholder:text-gray-300 hover:border-line focus:border-brand focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand/20"
                        />
                      ) : (
                        <span className={temNome(v) ? "font-medium text-ink" : "italic text-gray-300"}>{temNome(v) ? nomeDe(v) : v.semNome ? "nome não informado" : "vaga aberta"}</span>
                      )}
                      {v.contratoAtual && v.disponivelAPartir && v.disponivelAPartir > hoje && <div className="px-2 text-[10.5px] text-info">em {v.contratoAtual} até {fmtDia(v.disponivelAPartir)}</div>}
                      {v.destino && <div className="px-2 text-[10.5px] text-gray-400">vai para: {v.destino}</div>}
                    </td>
                    <td className="px-3 py-1 text-center">
                      {podeEditar ? (
                        <button
                          onClick={() => alterarVaga(v, { direcao4x4: v.direcao4x4 === true ? false : v.direcao4x4 === false ? null : true })}
                          className={`min-w-[38px] rounded-md px-2 py-0.5 text-[11px] font-semibold ${v.direcao4x4 === true ? "bg-info-soft text-info" : v.direcao4x4 === false ? "bg-gray-100 text-gray-500" : "text-gray-300 hover:bg-gray-100"}`}
                          title="Clique para alternar: Sim / Não / em branco"
                        >
                          {v.direcao4x4 === true ? "Sim" : v.direcao4x4 === false ? "Não" : "—"}
                        </button>
                      ) : (
                        <span className="text-[11px] text-gray-500">{v.direcao4x4 === true ? "Sim" : v.direcao4x4 === false ? "Não" : "—"}</span>
                      )}
                    </td>
                    {span > 0 && (
                      <td rowSpan={span} className={`border-l border-gray-100 px-2 text-center align-middle ${carro ? "bg-gray-50/70" : ""}`}>
                        {carro ? (
                          <button onClick={() => podeEditar && setOcupantes(carro)} className={`rounded-md bg-white px-2 py-1 text-[12px] font-bold text-ink ring-1 ring-line ${podeEditar ? "hover:bg-brand-soft" : ""}`} title={podeEditar ? "Quem vai neste carro" : undefined}>
                            {carro.identificacao}
                          </button>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                    )}
                    <td className="px-3 py-1">
                      {podeEditar ? (
                        <select value={v.status} onChange={(ev) => alterarVaga(v, { status: ev.target.value })} className="w-[104px] rounded-md border border-line bg-white px-1 py-0.5 text-[11.5px] text-gray-700">
                          {(STATUS_VAGA as readonly string[]).includes(v.status) ? null : <option>{v.status}</option>}
                          {STATUS_VAGA.map((s) => (
                            <option key={s}>{s}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-gray-600">{v.status}</span>
                      )}
                    </td>
                    <td className="px-3 py-1.5">
                      <span className={CHIP_SITUACAO[est.situacao]}>{ROTULO_SITUACAO[est.situacao]}</span>
                      {est.situacao !== "VAGA_ABERTA" && est.motivo && <div className="text-[10.5px] text-gray-400">{est.motivo}</div>}
                      {v.conferir && (
                        <div className="mt-0.5 inline-flex items-center gap-1 rounded bg-warn-soft px-1.5 text-[10px] font-semibold text-warn" title={v.conferir}>
                          conferir
                        </div>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1 text-right">
                      <button onClick={() => setAusenciasDe(v)} className={`relative rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-brand-dark ${nAus > 0 ? "text-info" : ""}`} title={`Ausências e férias${nAus ? ` (${nAus})` : ""}`} aria-label="Ausências e férias">
                        <IcCalendario tam={15} />
                        {nAus > 0 && <span className="num absolute -right-0.5 -top-0.5 rounded-full bg-info px-1 text-[9px] font-bold leading-3 text-white">{nAus}</span>}
                      </button>
                      {podeEditar && !temNome(v) && (
                        <button onClick={() => setPuxar({ vaga: v })} className="rounded-md px-1.5 py-1 text-[11px] font-semibold text-brand-dark hover:bg-brand-soft" title="Colocar um colaborador cadastrado nesta vaga">
                          preencher
                        </button>
                      )}
                      {podeEditar && temNome(v) && (
                        <button onClick={() => setDesmobilizar(v)} className="rounded-md px-1.5 py-1 text-[11px] font-semibold text-gray-500 hover:bg-bad-soft hover:text-bad" title="Tirar da equipe e abrir a vaga">
                          desmobilizar
                        </button>
                      )}
                      {podeEditar && (
                        <button onClick={() => setDetalhes(v)} className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-brand-dark" title="Todos os detalhes" aria-label="Detalhes">
                          <IcLapis tam={15} />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {vagas.length === 0 && (
                <tr>
                  <td colSpan={10}>
                    <Vazio titulo="Esta equipe ainda não tem pessoas" texto={podeEditar ? "Use “+ Pessoa” para criar as vagas e preencher quem trabalha nela." : undefined} />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* viaturas da equipe */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="card-t">Viaturas da equipe</h3>
          {podeEditar && (
            <button onClick={() => setViatura({ t: "nova" })} className="btn-ghost btn-sm">
              <IcMais tam={13} /> Viatura
            </button>
          )}
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {viaturas.map((ve) => {
            const pessoas = (ocupantesPorVeiculo.get(ve.id) ?? []).filter((p) => p.equipeId === equipe.id);
            const nomes = pessoas.filter(temNome);
            const outrasEquipes = (equipesPorVeiculo.get(ve.id) ?? []).filter((id) => id !== equipe.id).map((id) => equipePorId.get(id)?.codigo).filter(Boolean);
            const dirigem = nomes.filter((p) => p.direcao4x4);
            const loc = localizacaoNoDia(dados.movimentos.filter((m) => m.veiculoId === ve.id), hoje);
            return (
              <article key={ve.id} className="card flex flex-col p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-display text-[16px] font-semibold">{ve.identificacao}</span>
                      <span className={CHIP_VEICULO[ve.status]}>{ve.status}</span>
                    </div>
                    <div className="text-[11.5px] text-gray-500">
                      {[ve.placa, ve.modelo, ve.tracao4x4 ? "4x4" : null].filter(Boolean).join(" · ") || ve.codigo}
                    </div>
                  </div>
                  {loc && (
                    <span className="shrink-0 text-right text-[10.5px] text-gray-400">
                      desde
                      <br />
                      {fmtDia(loc.inicio)}
                    </span>
                  )}
                </div>
                <div className="mt-2.5 flex-1 border-t border-line pt-2">
                  <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-wide text-gray-500">Vai neste carro ({pessoas.length})</div>
                  {pessoas.length === 0 ? (
                    <p className="text-[12px] text-gray-400">Ninguém marcado.</p>
                  ) : (
                    <ul className="space-y-0.5 text-[12px]">
                      {pessoas.map((p) => (
                        <li key={p.id} className="flex items-center justify-between gap-2">
                          <span className={`truncate ${temNome(p) ? "text-ink" : "italic text-gray-400"}`}>{temNome(p) ? nomeDe(p) : `vaga aberta · ${p.cargo}`}</span>
                          {p.direcao4x4 && <span className="shrink-0 text-[10px] font-semibold text-info">4x4</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                  {outrasEquipes.length > 0 && <p className="mt-1.5 text-[11px] text-info">Mesma viatura também em: {outrasEquipes.join(", ")}</p>}
                  {nomes.length > 0 && <p className="mt-1.5 text-[11px] text-gray-500">Dirigem 4x4: {dirigem.length ? dirigem.map(nomeDe).join(", ") : "ninguém marcado"}</p>}
                </div>
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {podeEditar && (
                    <button onClick={() => setOcupantes(ve)} className="btn-ghost btn-sm">
                      Quem vai
                    </button>
                  )}
                  {podeEditar && (
                    <button onClick={() => setViatura({ t: "mover", v: ve })} className="btn-ghost btn-sm">
                      Mover
                    </button>
                  )}
                  <button onClick={() => setViatura({ t: "historico", v: ve })} className="btn-ghost btn-sm">
                    Histórico
                  </button>
                  {podeEditar && (
                    <button onClick={() => setViatura({ t: "editar", v: ve })} className="btn-ghost btn-sm">
                      Editar
                    </button>
                  )}
                </div>
              </article>
            );
          })}
          {viaturas.length === 0 && <div className="card md:col-span-2 xl:col-span-3"><Vazio titulo="Sem viaturas nesta equipe" texto={podeEditar ? "Use “+ Viatura” para cadastrar o carro da equipe." : undefined} /></div>}
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="card-t">Passagens da equipe</h3>
          {podeEditar && (
            <Link href={`/equipes/movimentar?equipe=${equipe.id}`} className="btn-ghost btn-sm">
              <IcMover tam={13} /> Movimentar
            </Link>
          )}
        </div>
        <div className="card overflow-hidden">
          {passagens.length === 0 ? (
            <Vazio titulo="Sem passagens registradas" texto={podeEditar ? `A equipe está em ${rotuloContrato(equipe.projeto)}. Ao movimentar a equipe para outro contrato ou frente, cada passagem fica registrada aqui.` : undefined} />
          ) : (
            <table className="tbl">
              <thead>
                <tr>
                  <th>Contrato</th>
                  <th>Frente / local</th>
                  <th>De</th>
                  <th>Até</th>
                  <th>Observação</th>
                </tr>
              </thead>
              <tbody>
                {passagens.map((m) => (
                  <tr key={m.id}>
                    <td className="font-medium text-ink">
                      <span className="inline-flex items-center gap-2">
                        <PontoContrato cor={corDoContrato(m.projeto)} tam={8} />
                        {rotuloContrato(m.projeto)}
                      </span>
                    </td>
                    <td className="text-gray-600">{m.local ?? "—"}</td>
                    <td className="num">{fmtDia(m.inicio)}</td>
                    <td className="num">{m.fim ? fmtDia(m.fim) : <span className="chip-ok">em curso</span>}</td>
                    <td className="text-gray-500">{m.observacao ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {editar && (
        <ModalEquipe
          equipe={equipe}
          onFechar={() => setEditar(false)}
          onSalvo={() => {
            setEditar(false);
            if (!dados.equipes.some((e) => e.id === equipe.id)) aoExcluir();
          }}
        />
      )}
      {novaVaga && <ModalVaga equipe={equipe} onFechar={() => setNovaVaga(false)} onSalvo={() => setNovaVaga(false)} />}
      {abrirVaga && <ModalAbrirVaga equipe={equipe} onFechar={() => setAbrirVaga(false)} />}
      {puxar && <ModalPuxar equipe={equipe} vagaPreSelecionada={puxar.vaga} onFechar={() => setPuxar(null)} />}
      {desmobilizar && <ModalDesmobilizar vaga={desmobilizar} onFechar={() => setDesmobilizar(null)} />}
      {detalhes && (
        <ModalVaga
          vaga={detalhes}
          onFechar={() => setDetalhes(null)}
          onSalvo={(av) => {
            setDetalhes(null);
            if (av) setAviso(av);
          }}
        />
      )}
      {ausenciasDe && <ModalAusencias vaga={ausenciasDe} onFechar={() => setAusenciasDe(null)} />}
      {ocupantes && <ModalOcupantes veiculo={ocupantes} equipeId={equipe.id} onFechar={() => setOcupantes(null)} />}
      {viatura?.t === "mover" && viatura.v && <ModalMover veiculo={viatura.v} onFechar={() => setViatura(null)} />}
      {viatura?.t === "historico" && viatura.v && <ModalHistoricoVeiculo veiculo={viatura.v} onFechar={() => setViatura(null)} />}
      {viatura?.t === "editar" && viatura.v && <ModalVeiculo veiculo={viatura.v} onFechar={() => setViatura(null)} />}
      {viatura?.t === "nova" && <ModalVeiculo equipeIdPadrao={equipe.id} onFechar={() => setViatura(null)} />}
    </div>
  );
}
