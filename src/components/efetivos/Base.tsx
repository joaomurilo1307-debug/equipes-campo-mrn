"use client";

// Base: uma linha por posição, como na planilha-base em Excel. Contrato, equipe, pessoa, viatura e de onde a linha veio nas
// abas originais. Todo número do Painel é uma contagem destas linhas (os números do Painel abrem esta tela já filtrada).
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { linhasDaBase, type DadosBase, type LinhaBase } from "@/lib/efetivos/base";
import { ROTULO_SITUACAO, type Situacao } from "@/lib/efetivos/situacao";
import { useDados } from "./DadosContext";
import { rotuloContrato, type Vaga } from "./comum";
import { IcBaixar, IcMais } from "./icones";
import ImportarPlanilha from "./ImportarPlanilha";
import { ModalPuxar } from "./modais/ModaisVagas";
import ModalVaga from "./modais/ModalVaga";
import { Aviso, CabecalhoPagina, Modal, Vazio } from "./ui";

const CHIP_SITUACAO: Record<Situacao, string> = { EM_EQUIPE: "chip-ok", DISPONIVEL: "chip-info", OUTRO_CONTRATO: "chip-info", AUSENTE: "chip-bad", VAGA_ABERTA: "chip-warn", SEM_NOME: "chip-mute", DESMOBILIZADO: "chip-mute" };
const CHIP_POSICAO: Record<LinhaBase["posicao"], string> = { "Com nome": "chip-ok", "Sem nome informado": "chip-mute", "Vaga aberta": "chip-warn" };
type Ordem = { campo: keyof LinhaBase; asc: boolean };

export default function Base() {
  const params = useSearchParams();
  const { dados, idx, hoje, equipePorId, vagaPorId, nomeDe } = useDados();
  const podeEditar = dados.podeEditar;
  const admin = dados.nivel === "ADMIN";
  const [busca, setBusca] = useState(params.get("q") ?? "");
  const [contrato, setContrato] = useState(params.get("contrato") ?? "");
  const [equipe, setEquipe] = useState(params.get("equipe") ?? "");
  const [situacao, setSituacao] = useState(params.get("situacao") ?? "");
  const [posicao, setPosicao] = useState(params.get("posicao") ?? "");
  const [empresa, setEmpresa] = useState("");
  const [soConferir, setSoConferir] = useState(params.get("conferir") === "1");
  const [ordem, setOrdem] = useState<Ordem | null>(null);
  const [editar, setEditar] = useState<Vaga | null>(null);
  const [preencher, setPreencher] = useState<Vaga | null>(null);
  const [importar, setImportar] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const linhas = useMemo(() => linhasDaBase(dados as unknown as DadosBase, idx, hoje), [dados, idx, hoje]);
  const campo = linhas.filter((l) => l.contrato);
  const contratos = [...new Set(campo.map((l) => l.contrato))].sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }));
  const equipes = [...new Map(linhas.map((l) => [l.equipeId, `${l.codigoEquipe} · ${l.equipe}`])).entries()];
  const empresas = [...new Set(linhas.map((l) => l.empresa))].sort();

  const filtradas = useMemo(() => {
    const t = busca.trim().toLowerCase();
    const f = linhas
      .filter((l) => !contrato || l.contrato === contrato)
      .filter((l) => !equipe || l.equipeId === equipe)
      .filter((l) => !situacao || l.situacao === situacao)
      .filter((l) => !posicao || l.posicao === posicao)
      .filter((l) => !empresa || l.empresa === empresa)
      .filter((l) => !soConferir || !!l.conferir)
      .filter((l) => !t || `${l.nome} ${l.cargo} ${l.empresa} ${l.equipe} ${l.contrato} ${l.origem} ${l.conferir}`.toLowerCase().includes(t));
    if (!ordem) return f;
    const sinal = ordem.asc ? 1 : -1;
    return [...f].sort((a, b) => {
      const x = a[ordem.campo];
      const y = b[ordem.campo];
      if (typeof x === "number" && typeof y === "number") return (x - y) * sinal;
      return String(x ?? "").localeCompare(String(y ?? ""), "pt-BR", { numeric: true }) * sinal;
    });
  }, [linhas, busca, contrato, equipe, situacao, posicao, empresa, soConferir, ordem]);

  const n = (fn: (l: LinhaBase) => boolean) => filtradas.filter(fn).length;
  const paraConferir = linhas.filter((l) => l.conferir).length;
  const limpar = () => {
    setBusca("");
    setContrato("");
    setEquipe("");
    setSituacao("");
    setPosicao("");
    setEmpresa("");
    setSoConferir(false);
  };
  const filtrando = !!(busca || contrato || equipe || situacao || posicao || empresa || soConferir);

  const Th = ({ campo, children, className = "" }: { campo: keyof LinhaBase; children: React.ReactNode; className?: string }) => (
    <th className={`whitespace-nowrap px-3 py-2 text-left ${className}`}>
      <button onClick={() => setOrdem((o) => (o?.campo === campo ? (o.asc ? { campo, asc: false } : null) : { campo, asc: true }))} className="inline-flex items-center gap-1 font-semibold uppercase tracking-wide hover:text-ink">
        {children}
        {ordem?.campo === campo && <span aria-hidden="true">{ordem.asc ? "▲" : "▼"}</span>}
      </button>
    </th>
  );

  return (
    <div>
      <CabecalhoPagina
        titulo="Base"
        subtitulo="Uma linha por posição, como na planilha-base em Excel: contrato, equipe, pessoa, viatura e de onde veio nas abas originais. Todo número do Painel é uma contagem destas linhas."
        acoes={
          <>
            <a href="/api/efetivos/base" className="btn-primary" download>
              <IcBaixar tam={16} /> Baixar Excel
            </a>
            {admin && (
              <button onClick={() => setImportar(true)} className="btn-ghost">
                Importar planilha
              </button>
            )}
            {podeEditar && (
              <Link href="/vagas/abrir" className="btn-ghost">
                <IcMais tam={16} /> Nova posição
              </Link>
            )}
          </>
        }
      />
      {aviso && (
        <div className="mb-3 cursor-pointer" onClick={() => setAviso(null)}>
          <Aviso tipo="atencao">{aviso}</Aviso>
        </div>
      )}

      {/* filtros */}
      <div className="no-print mb-2 flex flex-wrap items-end gap-2.5">
        <label className="min-w-[220px] flex-1 text-xs">
          <span className="label">Buscar</span>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="nome, função, equipe, origem…" className="field !mt-0.5 !py-1.5" />
        </label>
        <label className="text-xs">
          <span className="label">Contrato</span>
          <select value={contrato} onChange={(e) => setContrato(e.target.value)} className="field !mt-0.5 !w-auto !py-1.5">
            <option value="">Todos</option>
            {contratos.map((c) => (
              <option key={c} value={c}>
                {rotuloContrato(c)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          <span className="label">Equipe</span>
          <select value={equipe} onChange={(e) => setEquipe(e.target.value)} className="field !mt-0.5 !w-48 !py-1.5">
            <option value="">Todas</option>
            {equipes.map(([id, nome]) => (
              <option key={id} value={id}>
                {nome}
              </option>
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
          <span className="label">Posição</span>
          <select value={posicao} onChange={(e) => setPosicao(e.target.value)} className="field !mt-0.5 !w-auto !py-1.5">
            <option value="">Todas</option>
            <option>Com nome</option>
            <option>Sem nome informado</option>
            <option>Vaga aberta</option>
          </select>
        </label>
        <label className="text-xs">
          <span className="label">Situação hoje</span>
          <select value={situacao} onChange={(e) => setSituacao(e.target.value)} className="field !mt-0.5 !w-auto !py-1.5">
            <option value="">Todas</option>
            {(Object.keys(ROTULO_SITUACAO) as Situacao[]).map((s) => (
              <option key={s} value={s}>
                {ROTULO_SITUACAO[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 pb-1.5 text-xs text-gray-600">
          <input type="checkbox" checked={soConferir} onChange={(e) => setSoConferir(e.target.checked)} className="accent-[#0A9E7F]" /> só para conferir ({paraConferir})
        </label>
        {filtrando && (
          <button onClick={limpar} className="btn-ghost btn-sm mb-1">
            Limpar filtros
          </button>
        )}
      </div>

      {/* a conta, no que está filtrado */}
      <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-[12.5px] text-gray-600">
        <span>
          <strong className="num text-ink">{filtradas.length}</strong> linha{filtradas.length === 1 ? "" : "s"}
          {filtrando ? ` de ${linhas.length}` : ""}
        </span>
        <span>
          <strong className="num text-ink">{n((l) => l.posicao === "Com nome")}</strong> com nome
        </span>
        <span>
          <strong className="num text-ink">{n((l) => l.posicao === "Sem nome informado")}</strong> sem nome informado
        </span>
        <span>
          <strong className="num" style={{ color: "#B86E00" }}>
            {n((l) => l.posicao === "Vaga aberta")}
          </strong>{" "}
          vagas abertas
        </span>
        <span className="text-gray-300">|</span>
        <span>
          <strong className="num text-ink">{n((l) => l.situacao === "EM_EQUIPE")}</strong> em equipe
        </span>
        <span>
          <strong className="num text-bad">{n((l) => l.situacao === "AUSENTE")}</strong> ausentes
        </span>
        <span>
          <strong className="num text-info">{n((l) => l.situacao === "DISPONIVEL")}</strong> disponíveis
        </span>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-auto" style={{ maxHeight: "calc(133.333vh - 330px)", minHeight: 320 }}>
          <table className="w-full text-[12px]">
            <thead className="sticky top-0 z-10 bg-gray-50 text-[10.5px] text-gray-500 shadow-[0_1px_0_#E1E7E3]">
              <tr>
                <Th campo="numero">Nº</Th>
                <Th campo="contrato">Contrato</Th>
                <Th campo="equipe">Equipe</Th>
                <Th campo="atividade">Atividade</Th>
                <Th campo="empresa">Empresa</Th>
                <Th campo="cargo">Função</Th>
                <Th campo="nome">Profissional</Th>
                <Th campo="posicao">Posição</Th>
                <Th campo="status">Status</Th>
                <Th campo="direcao4x4">4x4</Th>
                <Th campo="viatura">Viatura</Th>
                <Th campo="situacao">Hoje</Th>
                <Th campo="origem">Origem</Th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {filtradas.map((l) => {
                const v = vagaPorId.get(l.vagaId);
                const e = equipePorId.get(l.equipeId);
                return (
                  <tr key={l.vagaId} className="border-t border-gray-100 hover:bg-gray-50/60">
                    <td className="num px-3 py-1.5 text-gray-400">{l.numero ?? ""}</td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-gray-700">{l.contrato ? rotuloContrato(l.contrato) : <span className="text-gray-300">reserva</span>}</td>
                    <td className="min-w-[190px] px-3 py-1.5 text-ink">
                      {l.equipe}
                      <span className="ml-1 font-mono text-[10px] text-gray-400">{l.codigoEquipe}</span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-gray-600">{l.atividade}</td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-gray-600">{l.empresa}</td>
                    <td className="min-w-[180px] px-3 py-1.5 text-ink">{l.cargo}</td>
                    <td className="min-w-[150px] px-3 py-1.5">{v && l.nome ? <span className="font-medium text-ink">{nomeDe(v)}</span> : <span className="italic text-gray-300">{l.posicao === "Sem nome informado" ? "nome não informado" : "vaga aberta"}</span>}</td>
                    <td className="px-3 py-1.5">
                      <span className={CHIP_POSICAO[l.posicao]}>{l.posicao}</span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-gray-600">{l.status}</td>
                    <td className="px-3 py-1.5 text-gray-500">{l.direcao4x4}</td>
                    <td className="whitespace-nowrap px-3 py-1.5 font-semibold text-gray-700">{l.viatura}</td>
                    <td className="px-3 py-1.5" title={l.situacaoHoje}>
                      <span className={CHIP_SITUACAO[l.situacao]}>{ROTULO_SITUACAO[l.situacao]}</span>
                    </td>
                    <td className="max-w-[260px] px-3 py-1.5 text-[11px] text-gray-500">
                      <div className="truncate" title={l.origem}>
                        {l.origem || "—"}
                      </div>
                      {l.conferir && (
                        <div className="mt-0.5 inline-block max-w-full truncate rounded bg-warn-soft px-1.5 text-[10px] font-semibold text-warn" title={l.conferir}>
                          conferir
                        </div>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-right">
                      {podeEditar && v && e && (
                        <>
                          {(l.posicao === "Vaga aberta" || l.posicao === "Sem nome informado") && l.contrato && (
                            <button onClick={() => setPreencher(v)} className="rounded-md px-1.5 py-1 text-[11px] font-semibold text-brand-dark hover:bg-brand-soft">
                              preencher
                            </button>
                          )}
                          <button onClick={() => setEditar(v)} className="rounded-md px-1.5 py-1 text-[11px] font-semibold text-gray-500 hover:bg-gray-100">
                            editar
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filtradas.length === 0 && (
                <tr>
                  <td colSpan={14}>
                    <Vazio titulo="Nenhuma linha neste filtro" acao={filtrando ? <button onClick={limpar} className="btn-ghost btn-sm">Limpar filtros</button> : undefined} />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <p className="mt-3 text-[11.5px] text-gray-400">A coluna Origem diz de qual aba e linha da planilha original cada linha veio; “conferir” marca o que precisa de confirmação. O mesmo conteúdo sai no Excel, aba BASE.</p>

      {editar && (
        <ModalVaga
          vaga={editar}
          onFechar={() => setEditar(null)}
          onSalvo={(av) => {
            setEditar(null);
            if (av) setAviso(av);
          }}
        />
      )}
      {preencher && equipePorId.get(preencher.equipeId) && <ModalPuxar equipe={equipePorId.get(preencher.equipeId)!} vagaPreSelecionada={preencher} onFechar={() => setPreencher(null)} />}
      {importar && (
        <Modal titulo="Importar planilha" onFechar={() => setImportar(false)}>
          <ImportarPlanilha onConcluido={() => setImportar(false)} />
        </Modal>
      )}
    </div>
  );
}
