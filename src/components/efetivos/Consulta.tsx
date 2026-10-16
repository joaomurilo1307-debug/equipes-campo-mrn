"use client";

// Consulta: a resposta rápida. Escolha a data e veja quem está livre, quem está em contrato, quem está ausente e as vagas abertas.
// Uma tabela só, com o mesmo texto em todo lugar: situação, onde está e até quando.
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { somarDias, temNome, type Dia } from "@/lib/efetivos/disponibilidade";
import { clienteDaEquipe } from "@/lib/efetivos/clientes";
import type { Situacao } from "@/lib/efetivos/situacao";
import { useDados, useShell } from "./DadosContext";
import { A_DEFINIR, corDoContrato, ehReserva, fmtDia, fmtDiaCurto, rotuloContrato, type Equipe, type Vaga } from "./comum";
import ModalStatus from "./modais/ModalStatus";
import ModalVaga from "./modais/ModalVaga";
import { ModalColocarEmEquipe, ModalDesmobilizar } from "./modais/ModaisVagas";
import { CabecalhoPagina, PontoContrato, Segmentado, Vazio } from "./ui";

type Filtro = "livres" | "contrato" | "ausentes" | "vagas" | "todos";

const CHIP: Record<Situacao, { chip: string; rotulo: string }> = {
  EM_EQUIPE: { chip: "chip-ok", rotulo: "Em contrato" },
  DISPONIVEL: { chip: "chip-info", rotulo: "Livre" },
  AUSENTE: { chip: "chip-bad", rotulo: "Ausente" },
  OUTRO_CONTRATO: { chip: "chip-mute", rotulo: "Em outro contrato" },
  SEM_NOME: { chip: "chip-mute", rotulo: "Nome não informado" },
  VAGA_ABERTA: { chip: "chip-warn", rotulo: "Vaga aberta" },
  DESMOBILIZADO: { chip: "chip-mute", rotulo: "Desmobilizado" },
};

type Linha = { v: Vaga; e: Equipe | undefined; sit: Situacao; motivo: string | null; contrato: string; cliente: string; ate: string; viatura: string };

export default function Consulta() {
  const { dados, hoje, equipePorId, situacaoDe, nomeDe, contratoNoDia, veiculoPorId } = useDados();
  const { clientes, escopo } = useShell();
  const sp = useSearchParams();
  const podeEditar = dados.podeEditar;
  const [dia, setDia] = useState<Dia>(sp.get("data") && /^\d{4}-\d{2}-\d{2}$/.test(sp.get("data")!) ? sp.get("data")! : hoje);
  const [filtro, setFiltro] = useState<Filtro>((["livres", "contrato", "ausentes", "vagas", "todos"] as string[]).includes(sp.get("situacao") ?? "") ? (sp.get("situacao") as Filtro) : "livres");
  const [contrato, setContrato] = useState(sp.get("contrato") ?? "");
  const [empresa, setEmpresa] = useState("");
  const [busca, setBusca] = useState(sp.get("q") ?? "");
  const [modal, setModal] = useState<{ t: "mover" | "liberar" | "editar" | "status"; v: Vaga } | null>(null);

  const linhas: Linha[] = useMemo(() => {
    const out: Linha[] = [];
    for (const v of dados.vagas) {
      const s = situacaoDe(v, dia);
      if (s.situacao === "DESMOBILIZADO") continue;
      const e = equipePorId.get(v.equipeId);
      const reserva = !e || ehReserva(e);
      const ct = reserva ? "" : contratoNoDia(e!, dia) || A_DEFINIR;
      const aus = dados.ausencias.find((a) => a.vagaId === v.id && a.inicio <= dia && dia <= a.fim);
      let ate = "";
      if (s.situacao === "EM_EQUIPE") ate = e?.fim ? `até ${fmtDia(e.fim)}` : "sem fim previsto";
      else if (s.situacao === "DISPONIVEL") ate = e && !reserva && e.fim ? `desde ${fmtDia(somarDias(e.fim, 1))}` : v.disponivelAPartir ? `desde ${fmtDia(v.disponivelAPartir)}` : "sem equipe";
      else if (s.situacao === "AUSENTE") ate = aus ? `${fmtDiaCurto(aus.inicio)} a ${fmtDiaCurto(aus.fim)}` : "sem período informado";
      else if (s.situacao === "VAGA_ABERTA") ate = v.previsaoInicio ? `entra ${fmtDia(v.previsaoInicio)}` : "a preencher";
      else if (s.situacao === "OUTRO_CONTRATO") ate = s.motivo ?? "";
      out.push({
        v,
        e: reserva ? undefined : e,
        sit: s.situacao,
        motivo: s.situacao === "AUSENTE" ? aus?.tipo ?? s.motivo : s.motivo,
        contrato: ct,
        cliente: e ? clienteDaEquipe(e, dados.contratos) ?? "" : "",
        ate,
        viatura: v.veiculoId ? veiculoPorId.get(v.veiculoId)?.identificacao ?? "" : "",
      });
    }
    return out;
  }, [dados, dia, situacaoDe, equipePorId, contratoNoDia, veiculoPorId]);

  const t = busca.trim().toLowerCase();
  const base = linhas.filter((l) => (!contrato || l.contrato === contrato) && (!empresa || l.v.empresa === empresa) && (!t || `${l.v.nome ?? ""} ${l.v.cargo} ${l.e?.nome ?? ""} ${l.v.empresa}`.toLowerCase().includes(t)));
  const doFiltro = (f: Filtro, l: Linha) => (f === "todos" ? true : f === "livres" ? l.sit === "DISPONIVEL" : f === "contrato" ? l.sit === "EM_EQUIPE" : f === "ausentes" ? l.sit === "AUSENTE" : l.sit === "VAGA_ABERTA");
  const conta = (f: Filtro) => base.filter((l) => doFiltro(f, l)).length;
  const mostradas = base
    .filter((l) => doFiltro(filtro, l))
    .sort((a, b) => a.contrato.localeCompare(b.contrato, "pt-BR", { numeric: true }) || (a.e?.nome ?? "").localeCompare(b.e?.nome ?? "", "pt-BR") || (a.v.nome ?? "~").localeCompare(b.v.nome ?? "~", "pt-BR"));

  const contratos = useMemo(() => [...new Set(linhas.map((l) => l.contrato).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true })), [linhas]);
  const empresas = useMemo(() => [...new Set(linhas.map((l) => l.v.empresa).filter(Boolean))].sort(), [linhas]);

  // por contrato: o retrato do dia, e um clique filtra
  const porContrato = useMemo(() => {
    const m = new Map<string, { contrato: string; contrato_: number; ausentes: number; vagas: number; livres: number }>();
    for (const l of base) {
      const k = l.contrato || "(sem contrato)";
      const r = m.get(k) ?? { contrato: k, contrato_: 0, ausentes: 0, vagas: 0, livres: 0 };
      if (l.sit === "EM_EQUIPE") r.contrato_++;
      else if (l.sit === "AUSENTE") r.ausentes++;
      else if (l.sit === "VAGA_ABERTA") r.vagas++;
      else if (l.sit === "DISPONIVEL") r.livres++;
      m.set(k, r);
    }
    return [...m.values()].sort((a, b) => (a.contrato.startsWith("(") ? 1 : b.contrato.startsWith("(") ? -1 : a.contrato.localeCompare(b.contrato, "pt-BR", { numeric: true })));
  }, [base]);

  async function baixar() {
    // a biblioteca do Excel só é carregada quando se pede o arquivo (a tela abre mais leve)
    const XLSX = await import("xlsx");
    const dadosXlsx = mostradas.map((l) => ({
      Cliente: l.cliente,
      Contrato: l.contrato,
      Equipe: l.e?.nome ?? "",
      Profissional: l.v.nome ?? "",
      Função: l.v.cargo,
      Empresa: l.v.empresa,
      Situação: CHIP[l.sit].rotulo + (l.motivo && l.sit === "AUSENTE" ? ` (${l.motivo})` : ""),
      "Até quando / desde": l.ate,
      Viatura: l.viatura,
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dadosXlsx), "CONSULTA");
    XLSX.writeFile(wb, `consulta_${filtro}_${dia}.xlsx`);
  }

  const mostrarCliente = clientes.length > 1 && !escopo;

  return (
    <div>
      <CabecalhoPagina titulo="Consulta" subtitulo="Escolha a data e veja quem está livre, quem está em contrato, quem está ausente e as vagas abertas." />

      <div className="card mb-4 flex flex-wrap items-end gap-3 p-3.5">
        <label>
          <span className="label">Data</span>
          <input type="date" value={dia} onChange={(e) => e.target.value && setDia(e.target.value)} className="field" />
        </label>
        <div className="flex gap-1 pb-0.5">
          {(
            [
              ["Hoje", 0],
              ["+7 dias", 7],
              ["+30 dias", 30],
              ["+60 dias", 60],
            ] as [string, number][]
          ).map(([r, n]) => (
            <button key={r} onClick={() => setDia(somarDias(hoje, n))} className={`btn-sm ${dia === somarDias(hoje, n) ? "btn-primary" : "btn-ghost"}`}>
              {r}
            </button>
          ))}
        </div>
        <label>
          <span className="label">Contrato</span>
          <select value={contrato} onChange={(e) => setContrato(e.target.value)} className="field">
            <option value="">Todos</option>
            {contratos.map((c) => (
              <option key={c} value={c}>
                {rotuloContrato(c)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="label">Empresa</span>
          <select value={empresa} onChange={(e) => setEmpresa(e.target.value)} className="field">
            <option value="">Todas</option>
            {empresas.map((e) => (
              <option key={e}>{e}</option>
            ))}
          </select>
        </label>
        <label className="min-w-[200px] flex-1">
          <span className="label">Buscar</span>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="pessoa, função ou equipe" className="field" />
        </label>
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <Segmentado
          valor={filtro}
          onChange={(v) => setFiltro(v as Filtro)}
          opcoes={[
            { id: "livres", rotulo: `Livres · ${conta("livres")}` },
            { id: "contrato", rotulo: `Em contrato · ${conta("contrato")}` },
            { id: "ausentes", rotulo: `Ausentes · ${conta("ausentes")}` },
            { id: "vagas", rotulo: `Vagas abertas · ${conta("vagas")}` },
            { id: "todos", rotulo: `Todos · ${conta("todos")}` },
          ]}
        />
        <div className="flex items-center gap-2">
          <span className="text-[12px] text-gray-500">
            {fmtDia(dia)} · {mostradas.length} linha{mostradas.length === 1 ? "" : "s"}
          </span>
          <button onClick={baixar} disabled={mostradas.length === 0} className="btn-ghost btn-sm">
            Baixar Excel
          </button>
        </div>
      </div>

      {porContrato.length > 1 && (
        <div className="mb-3 flex flex-wrap gap-2" aria-label="Por contrato">
          {porContrato.map((r) => (
            <button
              key={r.contrato}
              onClick={() => setContrato(contrato === r.contrato ? "" : r.contrato.startsWith("(") ? "" : r.contrato)}
              className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-left text-[12px] transition-colors ${contrato === r.contrato ? "border-brand bg-brand-soft" : "border-line bg-white hover:bg-gray-50"}`}
            >
              {!r.contrato.startsWith("(") && <PontoContrato cor={corDoContrato(r.contrato)} tam={8} />}
              <span className="font-semibold">{r.contrato}</span>
              <span className="text-gray-500">
                <strong className="num text-ok">{r.contrato_}</strong> em contrato
                {r.ausentes > 0 && (
                  <>
                    {" · "}
                    <strong className="num text-bad">{r.ausentes}</strong> ausentes
                  </>
                )}
                {r.livres > 0 && (
                  <>
                    {" · "}
                    <strong className="num text-info">{r.livres}</strong> livres
                  </>
                )}
                {r.vagas > 0 && (
                  <>
                    {" · "}
                    <strong className="num text-warn">{r.vagas}</strong> vagas
                  </>
                )}
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="card overflow-hidden">
        {mostradas.length === 0 ? (
          <Vazio
            titulo={filtro === "livres" ? "Ninguém livre nessa data" : "Nada nesta consulta"}
            texto={filtro === "livres" ? "Pode ser que as equipes ainda não tenham data de fim: sem o fim, o sistema não sabe quando as pessoas ficam livres. Veja o Planejamento (Equipes > Planejamento)." : "Mude a data ou os filtros."}
            acao={filtro === "livres" ? <Link href="/equipes?aba=planejamento" className="btn-ghost btn-sm">Abrir o Planejamento</Link> : undefined}
          />
        ) : (
          <div className="max-h-[calc(133.333vh-330px)] overflow-auto">
            <table className="w-full text-[12.5px]">
              <thead className="sticky top-0 z-10 bg-gray-50 text-[10.5px] font-semibold uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-3 py-2 text-left">Pessoa</th>
                  <th className="px-3 py-2 text-left">Função</th>
                  <th className="px-3 py-2 text-left">Situação</th>
                  <th className="px-3 py-2 text-left">Contrato / equipe</th>
                  <th className="px-3 py-2 text-left">Até quando / desde</th>
                  <th className="px-3 py-2 text-left">Viatura</th>
                  {podeEditar && <th className="px-3 py-2" />}
                </tr>
              </thead>
              <tbody>
                {mostradas.map((l) => {
                  const c = CHIP[l.sit];
                  const comNome = temNome(l.v);
                  return (
                    <tr key={l.v.id} className="border-t border-gray-100 align-top hover:bg-gray-50/60">
                      <td className="px-3 py-2">
                        <div className={comNome ? "font-medium" : "italic text-gray-400"}>{comNome ? nomeDe(l.v) : l.sit === "SEM_NOME" ? "nome não informado" : "vaga aberta"}</div>
                        <div className="text-[10.5px] text-gray-400">{l.v.empresa}</div>
                      </td>
                      <td className="px-3 py-2 text-gray-600">
                        {l.v.cargo}
                        {l.v.direcao4x4 && <span className="ml-1 text-[10px] font-semibold text-info">4x4</span>}
                      </td>
                      <td className="px-3 py-2">
                        <span className={c.chip}>{c.rotulo}</span>
                        {l.sit === "AUSENTE" && l.motivo && <div className="mt-0.5 text-[10.5px] text-gray-500">{l.motivo}</div>}
                        {l.v.status !== "Vigente" && l.sit !== "AUSENTE" && l.sit !== "VAGA_ABERTA" && <div className="mt-0.5 text-[10.5px] text-gray-500">{l.v.status}</div>}
                      </td>
                      <td className="px-3 py-2">
                        {l.e ? (
                          <>
                            <span className="inline-flex items-center gap-1.5 text-gray-700">
                              <PontoContrato cor={corDoContrato(l.contrato)} tam={7} />
                              {mostrarCliente && l.cliente && <span className="font-semibold text-gray-500">{l.cliente} ·</span>} {rotuloContrato(l.contrato)}
                            </span>
                            <div>
                              <Link href={`/equipes?equipe=${l.e.id}`} className="text-[11.5px] text-gray-500 hover:text-brand-dark hover:underline">
                                {l.e.nome}
                              </Link>
                            </div>
                          </>
                        ) : (
                          <span className="text-gray-400">{mostrarCliente && l.cliente ? `${l.cliente} · ` : ""}sem equipe</span>
                        )}
                      </td>
                      <td className="num px-3 py-2 text-gray-600">{l.ate || "—"}</td>
                      <td className="px-3 py-2 text-gray-600">{l.viatura || <span className="text-gray-300">—</span>}</td>
                      {podeEditar && (
                        <td className="whitespace-nowrap px-3 py-2 text-right">
                          {comNome && (
                            <button onClick={() => setModal({ t: "mover", v: l.v })} className="rounded px-1.5 py-0.5 text-[11px] font-semibold text-brand-dark hover:bg-brand-soft">
                              {l.e ? "mover" : "colocar em equipe"}
                            </button>
                          )}
                          {comNome && l.e && (
                            <button onClick={() => setModal({ t: "liberar", v: l.v })} className="rounded px-1.5 py-0.5 text-[11px] font-semibold text-gray-500 hover:bg-bad-soft hover:text-bad">
                              liberar
                            </button>
                          )}
                          {comNome && (
                            <button onClick={() => setModal({ t: "status", v: l.v })} className="rounded px-1.5 py-0.5 text-[11px] font-semibold text-gray-500 hover:bg-gray-100">
                              status
                            </button>
                          )}
                          <button onClick={() => setModal({ t: "editar", v: l.v })} className="rounded px-1.5 py-0.5 text-[11px] font-semibold text-gray-500 hover:bg-gray-100">
                            editar
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal?.t === "mover" && <ModalColocarEmEquipe vaga={modal.v} onFechar={() => setModal(null)} />}
      {modal?.t === "liberar" && <ModalDesmobilizar vaga={modal.v} onFechar={() => setModal(null)} />}
      {modal?.t === "status" && <ModalStatus vaga={modal.v} onFechar={() => setModal(null)} />}
      {modal?.t === "editar" && <ModalVaga vaga={modal.v} onFechar={() => setModal(null)} onSalvo={() => setModal(null)} />}
    </div>
  );
}
