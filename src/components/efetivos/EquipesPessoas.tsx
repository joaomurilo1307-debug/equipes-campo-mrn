"use client";

import { useMemo, useRef, useState } from "react";
import { STATUS_VAGA, estadoDaVaga, ordenarGrupos, temNome } from "@/lib/efetivos/disponibilidade";
import { localizacaoNoDia } from "@/lib/efetivos/veiculos";
import { useDados } from "./DadosContext";
import { A_DEFINIR, chamar, corDoContrato, hojeBr, rotuloContrato, fmtDia, type Equipe, type Vaga } from "./comum";
import { IcBusca, IcCarro, IcMais } from "./icones";
import ModalAusencias from "./modais/ModalAusencias";
import ModalEquipe from "./modais/ModalEquipe";
import ModalVaga from "./modais/ModalVaga";
import { Aviso, CabecalhoPagina, PontoContrato, Vazio } from "./ui";

const CHIP_SITUACAO: Record<string, string> = { LIVRE: "chip-ok", ALOCADA: "chip-info", AUSENTE: "chip-bad", VAGA_ABERTA: "chip-warn" };
const ROTULO_SITUACAO: Record<string, string> = { LIVRE: "Livre", ALOCADA: "Escalada", AUSENTE: "Ausente", VAGA_ABERTA: "Vaga aberta" };

function dataDoNomeDoArquivo(nome: string): string | null {
  const m = /(\d{2})_(\d{2})_(\d{4})/.exec(nome);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

export default function EquipesPessoas() {
  const { dados, idx, hoje, vagasPorEquipe, recarregar, nomeDe, ocultarNomes } = useDados();
  const grupos = ordenarGrupos(dados.equipes.map((e) => e.grupo));
  const [filtroGrupo, setFiltroGrupo] = useState("");
  const [busca, setBusca] = useState("");
  const [abertas, setAbertas] = useState<Set<string>>(() => new Set(dados.equipes.length <= 3 ? dados.equipes.map((e) => e.id) : []));
  const [mensagem, setMensagem] = useState<{ tipo: "erro" | "ok" | "atencao"; texto: string } | null>(null);
  const [equipeModal, setEquipeModal] = useState<Equipe | "nova" | null>(null);
  const [novaVagaEm, setNovaVagaEm] = useState<Equipe | null>(null);
  const [detalhes, setDetalhes] = useState<Vaga | null>(null);
  const [ausenciasDe, setAusenciasDe] = useState<Vaga | null>(null);

  const t = busca.trim().toLowerCase();
  const visiveis = dados.equipes.filter((e) => {
    if (filtroGrupo && e.grupo !== filtroGrupo) return false;
    if (!t) return true;
    return `${e.codigo} ${e.nome} ${e.projeto}`.toLowerCase().includes(t) || (vagasPorEquipe.get(e.id) ?? []).some((v) => (v.nome ?? "").toLowerCase().includes(t) || v.cargo.toLowerCase().includes(t));
  });
  const porContrato = useMemo(() => {
    const m = new Map<string, Equipe[]>();
    for (const e of visiveis) {
      if (!m.has(e.projeto)) m.set(e.projeto, []);
      m.get(e.projeto)!.push(e);
    }
    return [...m.entries()].sort(([a], [b]) => (a === A_DEFINIR ? 1 : b === A_DEFINIR ? -1 : a.localeCompare(b)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dados.equipes, filtroGrupo, busca, dados.vagas]);
  const aConfirmar = dados.equipes.filter((e) => !e.contratoConfirmado).length;
  const viaturasPorEquipe = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const v of dados.veiculos) {
      const loc = localizacaoNoDia(dados.movimentos.filter((x) => x.veiculoId === v.id), hoje);
      if (loc?.equipeId) m.set(loc.equipeId, [...(m.get(loc.equipeId) ?? []), v.identificacao]);
    }
    return m;
  }, [dados.veiculos, dados.movimentos, hoje]);

  async function alterarVaga(v: Vaga, corpo: Record<string, unknown>) {
    const r = await chamar("PATCH", `/api/efetivos/vagas/${v.id}`, corpo);
    if (!r.ok) {
      setMensagem({ tipo: "erro", texto: r.dados.error ?? "Não foi possível salvar" });
      return;
    }
    const futuras = (r.dados as any).alocacoesFuturas as number;
    if (futuras > 0) setMensagem({ tipo: "atencao", texto: `Profissional trocado. Esta vaga tem ${futuras} escala(s) em campanha: elas continuam na vaga, revise em Campanhas se for outra pessoa.` });
    await recarregar();
  }

  return (
    <div>
      <CabecalhoPagina
        titulo="Equipes e pessoas"
        subtitulo="Cadastro vivo: equipes por contrato, vagas, profissionais, ausências e quem dirige 4x4. Tudo o que você muda aqui aparece no Quadro."
        acoes={
          dados.podeEditar && (
            <button onClick={() => setEquipeModal("nova")} className="btn-primary">
              <IcMais tam={16} /> Nova equipe
            </button>
          )
        }
      />

      {mensagem && (
        <div className="mb-4 cursor-pointer" onClick={() => setMensagem(null)}>
          <Aviso tipo={mensagem.tipo}>{mensagem.texto}</Aviso>
        </div>
      )}
      {dados.podeEditar && <ImportarPlanilha temEquipes={dados.equipes.length > 0} />}
      {dados.podeEditar && aConfirmar > 0 && (
        <div className="mb-4">
          <Aviso tipo="atencao">
            <strong>{aConfirmar}</strong> equipe{aConfirmar > 1 ? "s" : ""} com contrato <strong>a confirmar</strong>: a planilha não informa o contrato de cada equipe. Abra <strong>Editar equipe</strong> e confirme (ou corrija) — as viaturas da equipe acompanham.
          </Aviso>
        </div>
      )}

      <div className="card mb-5 flex flex-wrap items-end gap-3 p-4">
        <label>
          <span className="label">Grupo</span>
          <select value={filtroGrupo} onChange={(e) => setFiltroGrupo(e.target.value)} className="field">
            <option value="">Todos</option>
            {grupos.map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
        </label>
        <label className="min-w-[240px] flex-1">
          <span className="label">Buscar equipe, cargo ou nome</span>
          <span className="relative block">
            <span className="pointer-events-none absolute left-3 top-1/2 mt-0.5 -translate-y-1/2 text-gray-400">
              <IcBusca tam={16} />
            </span>
            <input value={busca} onChange={(e) => setBusca(e.target.value)} className="field !pl-9" />
          </span>
        </label>
        <button onClick={() => setAbertas(abertas.size ? new Set() : new Set(visiveis.map((e) => e.id)))} className="btn-ghost">
          {abertas.size ? "Recolher todas" : "Expandir todas"}
        </button>
      </div>

      <div className="space-y-7">
        {porContrato.map(([projeto, equipes]) => (
          <section key={projeto}>
            <h2 className="mb-3 flex items-center gap-2.5 font-display text-lg font-semibold tracking-tight">
              <PontoContrato cor={corDoContrato(projeto)} tam={12} />
              {rotuloContrato(projeto)}
              <span className="chip-mute">{equipes.length} equipe{equipes.length === 1 ? "" : "s"}</span>
            </h2>
            <div className="space-y-3">
              {equipes.map((e) => {
                const vagas = vagasPorEquipe.get(e.id) ?? [];
                const preenchidas = vagas.filter(temNome).length;
                const aberta = abertas.has(e.id) || !!t;
                const viaturas = viaturasPorEquipe.get(e.id) ?? [];
                return (
                  <article key={e.id} className="card overflow-hidden">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5">
                      <button
                        onClick={() => setAbertas((s) => { const n = new Set(s); if (n.has(e.id)) n.delete(e.id); else n.add(e.id); return n; })}
                        className="flex min-w-0 flex-1 items-center gap-3 text-left"
                        aria-expanded={aberta}
                      >
                        <span className={`text-gray-400 transition-transform ${aberta ? "rotate-90" : ""}`}>▸</span>
                        <span className="min-w-0">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-[12px] text-gray-500">{e.codigo}</span>
                            <span className="font-display text-base font-semibold tracking-tight">{e.nome}</span>
                            {!e.contratoConfirmado && <span className="chip-warn">contrato a confirmar</span>}
                          </span>
                          <span className="block text-xs text-gray-500">
                            {e.grupo}
                            {e.gestor ? ` · gestor ${e.gestor}` : ""}
                            {viaturas.length > 0 && (
                              <span className="ml-2 inline-flex items-center gap-1 text-gray-500">
                                <IcCarro tam={13} /> {viaturas.join(", ")}
                              </span>
                            )}
                          </span>
                        </span>
                      </button>
                      <span className="num text-sm text-gray-600">
                        <strong className="text-ink">{preenchidas}</strong>/{vagas.length} preenchidas
                      </span>
                      <span className={e.status === "Ativa" ? "chip-ok" : "chip-mute"}>{e.status}</span>
                      {dados.podeEditar && (
                        <div className="flex gap-1.5">
                          <button onClick={() => setEquipeModal(e)} className="btn-ghost btn-sm">
                            Editar equipe
                          </button>
                          <button onClick={() => setNovaVagaEm(e)} className="btn-ghost btn-sm">
                            <IcMais tam={13} /> Pessoa
                          </button>
                        </div>
                      )}
                    </div>

                    {aberta && (
                      <div className="overflow-x-auto border-t border-line">
                        <table className="tbl">
                          <thead>
                            <tr>
                              <th>Cargo / função</th>
                              <th>Empresa</th>
                              <th>Atividade</th>
                              <th>Profissional</th>
                              <th>Status</th>
                              <th className="text-center" title="Habilitado a dirigir 4x4">4x4</th>
                              <th>Hoje</th>
                              <th />
                            </tr>
                          </thead>
                          <tbody>
                            {vagas.map((v) => {
                              const est = estadoDaVaga(v, idx, hoje);
                              const nAus = dados.ausencias.filter((a) => a.vagaId === v.id).length;
                              return (
                                <tr key={v.id} className="align-top">
                                  <td>
                                    {v.cargo}
                                    {v.nivel && v.nivel !== "NA" && <span className="ml-1.5 text-[11px] text-gray-400">{v.nivel}</span>}
                                  </td>
                                  <td className="text-gray-600">{v.empresa}</td>
                                  <td className="text-gray-600">{v.atividade}</td>
                                  <td>
                                    {dados.podeEditar && !ocultarNomes ? (
                                      <input
                                        key={`${v.id}-${v.nome ?? ""}`}
                                        defaultValue={v.nome ?? ""}
                                        placeholder="vaga aberta"
                                        onBlur={(ev) => {
                                          const novo = ev.target.value.trim();
                                          if (novo !== (v.nome ?? "")) alterarVaga(v, { nome: novo || null });
                                        }}
                                        onKeyDown={(ev) => ev.key === "Enter" && (ev.target as HTMLInputElement).blur()}
                                        className="w-full min-w-[170px] rounded-md border border-transparent bg-transparent px-2 py-1 text-sm text-ink placeholder:italic placeholder:text-gray-300 hover:border-line focus:border-brand focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand/20"
                                      />
                                    ) : (
                                      <span className={temNome(v) ? "text-ink" : "italic text-gray-300"}>{temNome(v) ? nomeDe(v) : "vaga aberta"}</span>
                                    )}
                                    {v.contratoAtual && v.disponivelAPartir && v.disponivelAPartir > hoje && (
                                      <div className="mt-0.5 text-[11px] text-info">em {v.contratoAtual} até {fmtDia(v.disponivelAPartir)}</div>
                                    )}
                                    {v.destino && <div className="text-[11px] text-gray-400">vai para: {v.destino}</div>}
                                  </td>
                                  <td>
                                    {dados.podeEditar ? (
                                      <select value={v.status} onChange={(ev) => alterarVaga(v, { status: ev.target.value })} className="rounded-md border border-line bg-white px-2 py-1 text-xs text-gray-700">
                                        {(STATUS_VAGA as readonly string[]).includes(v.status) ? null : <option>{v.status}</option>}
                                        {STATUS_VAGA.map((s) => (
                                          <option key={s}>{s}</option>
                                        ))}
                                      </select>
                                    ) : (
                                      <span className="text-xs text-gray-600">{v.status}</span>
                                    )}
                                  </td>
                                  <td className="text-center text-xs text-gray-500">{v.direcao4x4 === true ? "Sim" : v.direcao4x4 === false ? "Não" : "—"}</td>
                                  <td>
                                    <span className={CHIP_SITUACAO[est.situacao]}>{ROTULO_SITUACAO[est.situacao]}</span>
                                    {est.situacao !== "VAGA_ABERTA" && est.motivo && <div className="mt-0.5 text-[11px] text-gray-400">{est.motivo}</div>}
                                  </td>
                                  <td className="whitespace-nowrap text-right">
                                    <button onClick={() => setAusenciasDe(v)} className="btn-ghost btn-sm">
                                      Ausências{nAus > 0 ? ` (${nAus})` : ""}
                                    </button>
                                    {dados.podeEditar && (
                                      <button onClick={() => setDetalhes(v)} className="btn-ghost btn-sm ml-1">
                                        Detalhes
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        ))}
        {visiveis.length === 0 && (
          <div className="card">
            <Vazio titulo={dados.equipes.length === 0 ? "Nenhuma equipe cadastrada" : "Nenhuma equipe neste filtro"} texto={dados.equipes.length === 0 ? "Importe a planilha do Samuel acima ou crie a primeira equipe." : undefined} />
          </div>
        )}
      </div>

      {equipeModal && <ModalEquipe equipe={equipeModal === "nova" ? null : equipeModal} onFechar={() => setEquipeModal(null)} onSalvo={() => setEquipeModal(null)} />}
      {novaVagaEm && <ModalVaga equipe={novaVagaEm} onFechar={() => setNovaVagaEm(null)} onSalvo={() => setNovaVagaEm(null)} />}
      {detalhes && (
        <ModalVaga
          vaga={detalhes}
          onFechar={() => setDetalhes(null)}
          onSalvo={(av) => {
            setDetalhes(null);
            if (av) setMensagem({ tipo: "atencao", texto: av });
          }}
        />
      )}
      {ausenciasDe && <ModalAusencias vaga={ausenciasDe} onFechar={() => setAusenciasDe(null)} />}
    </div>
  );
}

// ---------------------------------------------------------------- importar planilha

function ImportarPlanilha({ temEquipes }: { temEquipes: boolean }) {
  const { recarregar } = useDados();
  const [aberto, setAberto] = useState(!temEquipes);
  const arquivoRef = useRef<HTMLInputElement>(null);
  const [nomeArquivo, setNomeArquivo] = useState("");
  const [dataRef, setDataRef] = useState(hojeBr());
  const [acrescentar, setAcrescentar] = useState(false);
  const [resumo, setResumo] = useState<any | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function enviar(simular: boolean) {
    const arquivo = arquivoRef.current?.files?.[0];
    if (!arquivo) return setErro("Escolha a planilha (.xlsx) primeiro.");
    setOcupado(true);
    setErro(null);
    setOk(null);
    const fd = new FormData();
    fd.append("arquivo", arquivo);
    fd.append("dataReferencia", dataRef);
    const q = [simular ? "simular=1" : "", acrescentar ? "acrescentar=1" : ""].filter(Boolean).join("&");
    const r = await chamar("POST", `/api/efetivos/importar${q ? `?${q}` : ""}`, fd);
    setOcupado(false);
    if (!r.ok) {
      setResumo(null);
      return setErro(r.dados.error ?? "Não foi possível importar");
    }
    if (simular) return setResumo(r.dados);
    setResumo(null);
    setOk(`Importado: ${(r.dados as any).equipesNovas} equipes, ${(r.dados as any).vagasNovas} vagas e ${(r.dados as any).veiculosNovos} viaturas.`);
    if (arquivoRef.current) arquivoRef.current.value = "";
    setNomeArquivo("");
    await recarregar();
  }

  return (
    <section className="card mb-5 p-5">
      <button onClick={() => setAberto(!aberto)} className="flex w-full items-center justify-between text-left">
        <span className="card-t">Importar planilha</span>
        <span className="text-gray-400">{aberto ? "▾" : "▸"}</span>
      </button>
      {aberto && (
        <div className="mt-3 space-y-3">
          <p className="text-xs text-gray-500">
            Use a planilha mais recente (aba “DIVISÃO DE EQUIPES”, com a aba de apoio de outro contrato). É a <strong>carga inicial</strong>: depois dela, a atualização é feita aqui no sistema e a importação nunca sobrescreve o que já foi ajustado.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <label>
              <span className="label">Planilha</span>
              <input
                ref={arquivoRef}
                type="file"
                accept=".xlsx"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  setNomeArquivo(f?.name ?? "");
                  setResumo(null);
                  const d = f ? dataDoNomeDoArquivo(f.name) : null;
                  if (d) setDataRef(d);
                }}
                className="mt-1 block text-sm"
              />
            </label>
            <label>
              <span className="label">Data da planilha</span>
              <input type="date" value={dataRef} onChange={(e) => setDataRef(e.target.value)} className="field" />
            </label>
            <button onClick={() => enviar(true)} disabled={ocupado || !nomeArquivo} className="btn-ghost">
              {ocupado ? "Lendo…" : "Conferir antes de importar"}
            </button>
          </div>
          {temEquipes && (
            <label className="flex items-center gap-2 text-xs text-gray-600">
              <input type="checkbox" checked={acrescentar} onChange={(e) => { setAcrescentar(e.target.checked); setResumo(null); }} className="accent-[#0A9E7F]" />
              Acrescentar só equipes novas (já existem equipes; as de mesmo nome são mantidas como estão)
            </label>
          )}
          {erro && <Aviso tipo="erro">{erro}</Aviso>}
          {ok && <Aviso tipo="ok">{ok}</Aviso>}
          {resumo && (
            <div className="space-y-2 rounded-xl border border-line bg-gray-50 p-4 text-sm">
              <div className="font-semibold text-ink">O que vai entrar (nada foi gravado ainda):</div>
              <ul className="grid gap-x-6 gap-y-0.5 text-xs text-gray-700 sm:grid-cols-2">
                <li>Equipes novas: <strong>{resumo.equipesNovas}</strong> (de {resumo.equipesNaPlanilha} na planilha)</li>
                <li>Vagas: <strong>{resumo.vagasNovas}</strong> — {resumo.vagasPreenchidas} com profissional, {resumo.vagasAbertas} abertas</li>
                <li>Viaturas citadas: <strong>{resumo.veiculosNovos}</strong></li>
                <li>Apoio de outro contrato: <strong>{resumo.apoioDeOutroContrato}</strong> pessoas</li>
              </ul>
              {resumo.avisos?.length > 0 && (
                <ul className="list-disc space-y-0.5 pl-5 text-xs text-warn">
                  {resumo.avisos.map((a: string, i: number) => (
                    <li key={i}>{a}</li>
                  ))}
                </ul>
              )}
              <button onClick={() => enviar(false)} disabled={ocupado || resumo.equipesNovas === 0} className="btn-primary">
                {ocupado ? "Importando…" : "Importar agora"}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
