"use client";

import { useMemo, useState } from "react";
import { STATUS_VEICULO, localizacaoNoDia } from "@/lib/efetivos/veiculos";
import { useDados } from "../DadosContext";
import { A_DEFINIR, chamar, contratosConhecidos, corDoContrato, fmtDia, hojeBr, rotuloContrato, type Movimento, type Veiculo } from "../comum";
import { IcLapis, IcLixo } from "../icones";
import { Aviso, Campo, Modal, PontoContrato, RodapeModal } from "../ui";

function useContratos() {
  const { dados } = useDados();
  return useMemo(() => contratosConhecidos(dados), [dados]);
}

/** Mover o veículo: a partir de uma data ele passa a estar em outro contrato, equipe e local. */
export function ModalMover({ veiculo, periodo, onFechar }: { veiculo: Veiculo; periodo?: { inicio: string; fim: string }; onFechar: () => void }) {
  const { dados, recarregar, hoje, equipePorId } = useDados();
  const contratos = useContratos();
  const atual = localizacaoNoDia(dados.movimentos.filter((m) => m.veiculoId === veiculo.id), hoje);
  const atualEq = atual?.equipeId ? equipePorId.get(atual.equipeId) : null;
  const [f, setF] = useState({ inicio: periodo?.inicio ?? hoje, fim: periodo?.fim ?? "", projeto: "", equipeId: "", campanhaId: "", local: "", observacao: "" });
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));

  function escolherEquipe(id: string) {
    const eq = dados.equipes.find((e) => e.id === id);
    setF((x) => ({ ...x, equipeId: id, projeto: x.projeto || (eq && eq.projeto !== A_DEFINIR ? eq.projeto : "") }));
  }

  async function salvar() {
    setSalvando(true);
    setErro(null);
    const r = await chamar("POST", `/api/efetivos/veiculos/${veiculo.id}/mover`, {
      inicio: f.inicio,
      fim: f.fim || null,
      projeto: f.projeto.trim() || A_DEFINIR,
      equipeId: f.equipeId || null,
      campanhaId: f.campanhaId || null,
      local: f.local || null,
      observacao: f.observacao || null,
    });
    setSalvando(false);
    if (!r.ok) return setErro(r.dados.error ?? "Não foi possível mover");
    await recarregar();
    onFechar();
  }

  return (
    <Modal
      titulo={`Mover ${veiculo.identificacao}${veiculo.placa ? ` · ${veiculo.placa}` : ""}`}
      subtitulo={atual ? `Hoje: ${rotuloContrato(atual.projeto)}${atualEq ? ` · ${atualEq.nome}` : ""}${atual.local ? ` · ${atual.local}` : ""}` : "Sem localização registrada"}
      onFechar={onFechar}
    >
      <div className="space-y-4 px-6 py-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="A partir de">
            <input type="date" value={f.inicio} onChange={(e) => set("inicio", e.target.value)} className="field" />
          </Campo>
          <Campo rotulo="Até (opcional)" dica="Em branco = continua lá.">
            <input type="date" value={f.fim} min={f.inicio} onChange={(e) => set("fim", e.target.value)} className="field" />
          </Campo>
          <Campo rotulo="Equipe">
            <select value={f.equipeId} onChange={(e) => escolherEquipe(e.target.value)} className="field">
              <option value="">—</option>
              {dados.equipes.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.codigo} · {e.nome}
                </option>
              ))}
            </select>
          </Campo>
          <Campo rotulo="Contrato">
            <input list="contratos-mover" value={f.projeto} onChange={(e) => set("projeto", e.target.value)} placeholder="o da equipe, se tiver" className="field" />
            <datalist id="contratos-mover">
              {contratos.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </Campo>
          <Campo rotulo="Campanha (opcional)">
            <select value={f.campanhaId} onChange={(e) => set("campanhaId", e.target.value)} className="field">
              <option value="">—</option>
              {dados.campanhas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.codigo} · {rotuloContrato(c.projeto)}
                </option>
              ))}
            </select>
          </Campo>
          <Campo rotulo="Local / frente">
            <input value={f.local} onChange={(e) => set("local", e.target.value)} className="field" />
          </Campo>
          <Campo rotulo="Observação" className="sm:col-span-2">
            <input value={f.observacao} onChange={(e) => set("observacao", e.target.value)} className="field" />
          </Campo>
        </div>
        <p className="text-[11px] text-gray-500">A passagem atual termina no dia anterior; o histórico fica guardado.</p>
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
      </div>
      <RodapeModal>
        <button onClick={onFechar} className="btn-ghost">
          Cancelar
        </button>
        <button onClick={salvar} disabled={salvando || !f.inicio || (!f.projeto.trim() && !f.equipeId && !f.local.trim())} className="btn-primary">
          {salvando ? "Gravando…" : "Registrar movimentação"}
        </button>
      </RodapeModal>
    </Modal>
  );
}

/** Corrige uma passagem do histórico (datas, contrato, equipe, local) ou a exclui. */
function ModalPassagem({ veiculo, mov, onFechar }: { veiculo: Veiculo; mov: Movimento; onFechar: () => void }) {
  const { dados, recarregar } = useDados();
  const contratos = useContratos();
  const [f, setF] = useState({ inicio: mov.inicio, fim: mov.fim ?? "", projeto: mov.projeto === A_DEFINIR ? "" : mov.projeto, equipeId: mov.equipeId ?? "", local: mov.local ?? "", observacao: mov.observacao ?? "" });
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));

  async function salvar() {
    setSalvando(true);
    setErro(null);
    const r = await chamar("PATCH", `/api/efetivos/veiculos/${veiculo.id}/movimentos/${mov.id}`, {
      inicio: f.inicio,
      fim: f.fim || null,
      projeto: f.projeto.trim() || A_DEFINIR,
      equipeId: f.equipeId || null,
      local: f.local || null,
      observacao: f.observacao || null,
    });
    setSalvando(false);
    if (!r.ok) return setErro(r.dados.error ?? "Não foi possível salvar");
    await recarregar();
    onFechar();
  }
  async function excluir() {
    if (!window.confirm("Excluir esta passagem do histórico?")) return;
    setSalvando(true);
    const r = await chamar("DELETE", `/api/efetivos/veiculos/${veiculo.id}/movimentos/${mov.id}`);
    setSalvando(false);
    if (!r.ok) return setErro(r.dados.error ?? "Não foi possível excluir");
    await recarregar();
    onFechar();
  }
  return (
    <Modal titulo="Corrigir passagem" subtitulo={`${veiculo.identificacao}${veiculo.placa ? ` · ${veiculo.placa}` : ""}`} onFechar={onFechar}>
      <div className="grid gap-4 px-6 py-5 sm:grid-cols-2">
        <Campo rotulo="De">
          <input type="date" value={f.inicio} onChange={(e) => set("inicio", e.target.value)} className="field" />
        </Campo>
        <Campo rotulo="Até" dica="Em branco = continua lá.">
          <input type="date" value={f.fim} min={f.inicio} onChange={(e) => set("fim", e.target.value)} className="field" />
        </Campo>
        <Campo rotulo="Equipe">
          <select value={f.equipeId} onChange={(e) => set("equipeId", e.target.value)} className="field">
            <option value="">—</option>
            {dados.equipes.map((e) => (
              <option key={e.id} value={e.id}>
                {e.codigo} · {e.nome}
              </option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Contrato">
          <input list="contratos-passagem" value={f.projeto} onChange={(e) => set("projeto", e.target.value)} className="field" />
          <datalist id="contratos-passagem">
            {contratos.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </Campo>
        <Campo rotulo="Local / frente">
          <input value={f.local} onChange={(e) => set("local", e.target.value)} className="field" />
        </Campo>
        <Campo rotulo="Observação">
          <input value={f.observacao} onChange={(e) => set("observacao", e.target.value)} className="field" />
        </Campo>
      </div>
      {erro && (
        <div className="px-6 pb-4">
          <Aviso tipo="erro">{erro}</Aviso>
        </div>
      )}
      <RodapeModal>
        <button onClick={excluir} disabled={salvando} className="btn-danger mr-auto">
          <IcLixo tam={15} /> Excluir
        </button>
        <button onClick={onFechar} className="btn-ghost">
          Cancelar
        </button>
        <button onClick={salvar} disabled={salvando || !f.inicio} className="btn-primary">
          {salvando ? "Salvando…" : "Salvar"}
        </button>
      </RodapeModal>
    </Modal>
  );
}

/** Histórico de onde o veículo andou, com correção de cada passagem. */
export function ModalHistoricoVeiculo({ veiculo, onFechar }: { veiculo: Veiculo; onFechar: () => void }) {
  const { dados, equipePorId } = useDados();
  const movs = dados.movimentos.filter((m) => m.veiculoId === veiculo.id).sort((a, b) => b.inicio.localeCompare(a.inicio));
  const [editando, setEditando] = useState<Movimento | null>(null);

  return (
    <>
      <Modal titulo={`Histórico — ${veiculo.identificacao}${veiculo.placa ? ` · ${veiculo.placa}` : ""}`} subtitulo="Por onde o veículo passou, da mais recente para a mais antiga." onFechar={onFechar}>
        <div className="space-y-2 px-6 py-5">
          {movs.length === 0 && <p className="text-sm text-gray-400">Nenhuma localização registrada para este veículo.</p>}
          <ol className="space-y-2">
            {movs.map((m) => {
              const eq = m.equipeId ? equipePorId.get(m.equipeId) : null;
              return (
                <li key={m.id} className="flex items-start justify-between gap-3 rounded-xl border border-line px-4 py-2.5 text-sm">
                  <span className="min-w-0">
                    <span className="flex items-center gap-2 font-semibold text-ink">
                      <PontoContrato cor={corDoContrato(m.projeto)} tam={9} />
                      {rotuloContrato(m.projeto)}
                    </span>
                    <span className="mt-0.5 block text-xs text-gray-500">
                      {fmtDia(m.inicio)} a {m.fim ? fmtDia(m.fim) : "hoje (continua)"}
                      {eq ? ` · ${eq.nome}` : ""}
                      {m.local ? ` · ${m.local}` : ""}
                    </span>
                    {m.observacao && <span className="block text-[11px] text-gray-400">{m.observacao}</span>}
                  </span>
                  {dados.podeEditar && (
                    <button onClick={() => setEditando(m)} className="btn-ghost btn-sm shrink-0">
                      <IcLapis tam={13} /> Corrigir
                    </button>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      </Modal>
      {editando && <ModalPassagem veiculo={veiculo} mov={editando} onFechar={() => setEditando(null)} />}
    </>
  );
}

/** Cadastra ou edita o veículo (placa, modelo, 4x4, situação) e, ao cadastrar, onde ele está. */
export function ModalVeiculo({ veiculo, equipeIdPadrao, onFechar, onSalvo }: { veiculo?: Veiculo | null; equipeIdPadrao?: string; onFechar: () => void; onSalvo?: () => void }) {
  const { dados, recarregar, equipePorId } = useDados();
  const contratos = useContratos();
  const eqPadrao = equipeIdPadrao ? equipePorId.get(equipeIdPadrao) : null;
  const [f, setF] = useState({
    identificacao: veiculo?.identificacao ?? "",
    placa: veiculo?.placa ?? "",
    modelo: veiculo?.modelo ?? "",
    tracao4x4: veiculo?.tracao4x4 === true ? "sim" : veiculo?.tracao4x4 === false ? "nao" : "",
    status: veiculo?.status ?? "Em operação",
    observacao: veiculo?.observacao ?? "",
    projeto: eqPadrao && eqPadrao.projeto !== A_DEFINIR ? eqPadrao.projeto : "",
    equipeId: equipeIdPadrao ?? "",
    local: "",
    inicio: hojeBr(),
  });
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));

  async function salvar() {
    setSalvando(true);
    setErro(null);
    const base = {
      identificacao: f.identificacao,
      placa: f.placa || null,
      modelo: f.modelo || null,
      tracao4x4: f.tracao4x4 === "sim" ? true : f.tracao4x4 === "nao" ? false : null,
      status: f.status,
      observacao: f.observacao || null,
    };
    const temLocal = !!(f.projeto.trim() || f.equipeId);
    const corpo = veiculo ? base : { ...base, ...(temLocal ? { localizacao: { inicio: f.inicio, projeto: f.projeto.trim() || A_DEFINIR, equipeId: f.equipeId || null, local: f.local || null } } : {}) };
    const r = await chamar(veiculo ? "PATCH" : "POST", veiculo ? `/api/efetivos/veiculos/${veiculo.id}` : "/api/efetivos/veiculos", corpo);
    setSalvando(false);
    if (!r.ok) return setErro(r.dados.error ?? "Não foi possível salvar");
    await recarregar();
    onSalvo?.();
    onFechar();
  }

  async function excluir() {
    if (!veiculo || !window.confirm(`Excluir o veículo ${veiculo.identificacao} e todo o histórico dele?`)) return;
    setSalvando(true);
    const r = await chamar("DELETE", `/api/efetivos/veiculos/${veiculo.id}`);
    setSalvando(false);
    if (!r.ok) return setErro(r.dados.error ?? "Não foi possível excluir");
    await recarregar();
    onFechar();
  }

  return (
    <Modal titulo={veiculo ? `Editar ${veiculo.identificacao}` : "Novo veículo"} subtitulo={veiculo?.codigo} onFechar={onFechar}>
      <div className="grid gap-4 px-6 py-5 sm:grid-cols-2">
        <Campo rotulo="Identificação" dica="Como a equipe chama: VL 01, prefixo, placa…">
          <input value={f.identificacao} onChange={(e) => set("identificacao", e.target.value)} className="field" autoFocus={!veiculo} />
        </Campo>
        <Campo rotulo="Placa">
          <input value={f.placa} onChange={(e) => set("placa", e.target.value)} className="field uppercase" />
        </Campo>
        <Campo rotulo="Modelo">
          <input value={f.modelo} onChange={(e) => set("modelo", e.target.value)} className="field" />
        </Campo>
        <Campo rotulo="Tração 4x4?">
          <select value={f.tracao4x4} onChange={(e) => set("tracao4x4", e.target.value)} className="field">
            <option value="">—</option>
            <option value="sim">Sim</option>
            <option value="nao">Não</option>
          </select>
        </Campo>
        <Campo rotulo="Situação">
          <select value={f.status} onChange={(e) => set("status", e.target.value)} className="field">
            {STATUS_VEICULO.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Observação">
          <input value={f.observacao} onChange={(e) => set("observacao", e.target.value)} className="field" />
        </Campo>
        {!veiculo && (
          <div className="rounded-xl border border-line bg-gray-50 p-4 sm:col-span-2">
            <div className="mb-2 text-[13px] font-semibold text-gray-700">Onde está</div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo rotulo="Equipe">
                <select
                  value={f.equipeId}
                  onChange={(e) => {
                    const eq = equipePorId.get(e.target.value);
                    setF((x) => ({ ...x, equipeId: e.target.value, projeto: x.projeto || (eq && eq.projeto !== A_DEFINIR ? eq.projeto : "") }));
                  }}
                  className="field"
                >
                  <option value="">—</option>
                  {dados.equipes.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.codigo} · {e.nome}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo rotulo="Contrato">
                <input list="contratos-novo" value={f.projeto} onChange={(e) => set("projeto", e.target.value)} className="field" />
                <datalist id="contratos-novo">
                  {contratos.map((p) => (
                    <option key={p} value={p} />
                  ))}
                </datalist>
              </Campo>
              <Campo rotulo="Desde">
                <input type="date" value={f.inicio} onChange={(e) => set("inicio", e.target.value)} className="field" />
              </Campo>
              <Campo rotulo="Local / frente">
                <input value={f.local} onChange={(e) => set("local", e.target.value)} className="field" />
              </Campo>
            </div>
          </div>
        )}
      </div>
      {erro && (
        <div className="px-6 pb-4">
          <Aviso tipo="erro">{erro}</Aviso>
        </div>
      )}
      <RodapeModal>
        {veiculo && (
          <button onClick={excluir} disabled={salvando} className="btn-danger mr-auto">
            <IcLixo tam={15} /> Excluir
          </button>
        )}
        <button onClick={onFechar} className="btn-ghost">
          Cancelar
        </button>
        <button onClick={salvar} disabled={salvando || !f.identificacao.trim()} className="btn-primary">
          {salvando ? "Salvando…" : "Salvar"}
        </button>
      </RodapeModal>
    </Modal>
  );
}
