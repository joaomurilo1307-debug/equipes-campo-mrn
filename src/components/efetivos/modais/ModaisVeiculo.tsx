"use client";

import { useMemo, useState } from "react";
import { STATUS_VEICULO, localizacaoNoDia } from "@/lib/efetivos/veiculos";
import { useDados } from "../DadosContext";
import { A_DEFINIR, chamar, corDoContrato, fmtDia, hojeBr, rotuloContrato, type Veiculo } from "../comum";
import { Aviso, Campo, Modal, PontoContrato, RodapeModal } from "../ui";

function useContratos() {
  const { dados } = useDados();
  return useMemo(
    () => Array.from(new Set([...dados.equipes.map((e) => e.projeto), ...dados.movimentos.map((m) => m.projeto), ...dados.campanhas.map((c) => c.projeto)].filter((p) => p && p !== A_DEFINIR))).sort(),
    [dados.equipes, dados.movimentos, dados.campanhas]
  );
}

/** Mover o veículo: a partir de uma data ele passa a estar em outro contrato/equipe/local. */
export function ModalMover({ veiculo, periodo, onFechar }: { veiculo: Veiculo; periodo?: { inicio: string; fim: string }; onFechar: () => void }) {
  const { dados, recarregar, hoje } = useDados();
  const contratos = useContratos();
  const atual = localizacaoNoDia(dados.movimentos.filter((m) => m.veiculoId === veiculo.id), hoje);
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
      projeto: f.projeto,
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
    <Modal titulo={`Mover ${veiculo.identificacao}${veiculo.placa ? ` · ${veiculo.placa}` : ""}`} subtitulo={atual ? `Hoje em ${rotuloContrato(atual.projeto)}${atual.local ? ` — ${atual.local}` : ""}` : "Sem localização registrada"} onFechar={onFechar}>
      <div className="space-y-4 px-6 py-5">
        <p className="text-xs text-gray-500">A passagem atual é encerrada no dia anterior ao início da nova; o histórico fica guardado.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="A partir de">
            <input type="date" value={f.inicio} onChange={(e) => set("inicio", e.target.value)} className="field" />
          </Campo>
          <Campo rotulo="Até (opcional)" dica="Vazio = continua lá.">
            <input type="date" value={f.fim} min={f.inicio} onChange={(e) => set("fim", e.target.value)} className="field" />
          </Campo>
          <Campo rotulo="Contrato / projeto">
            <input list="contratos-mover" value={f.projeto} onChange={(e) => set("projeto", e.target.value)} className="field" autoFocus />
            <datalist id="contratos-mover">
              {contratos.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </Campo>
          <Campo rotulo="Equipe (opcional)">
            <select value={f.equipeId} onChange={(e) => escolherEquipe(e.target.value)} className="field">
              <option value="">—</option>
              {dados.equipes.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.codigo} · {e.nome}
                </option>
              ))}
            </select>
          </Campo>
          <Campo rotulo="Campanha (opcional)">
            <select value={f.campanhaId} onChange={(e) => set("campanhaId", e.target.value)} className="field">
              <option value="">—</option>
              {dados.campanhas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.codigo} · {c.projeto}
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
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
      </div>
      <RodapeModal>
        <button onClick={onFechar} className="btn-ghost">
          Cancelar
        </button>
        <button onClick={salvar} disabled={salvando || !f.projeto.trim() || !f.inicio} className="btn-primary">
          {salvando ? "Gravando…" : "Registrar movimentação"}
        </button>
      </RodapeModal>
    </Modal>
  );
}

/** Histórico de onde o veículo andou. */
export function ModalHistoricoVeiculo({ veiculo, onFechar }: { veiculo: Veiculo; onFechar: () => void }) {
  const { dados, recarregar, equipePorId } = useDados();
  const movs = dados.movimentos.filter((m) => m.veiculoId === veiculo.id).sort((a, b) => b.inicio.localeCompare(a.inicio));
  const [erro, setErro] = useState<string | null>(null);

  async function remover(id: string) {
    if (!window.confirm("Remover esta passagem do histórico? (use só para corrigir um lançamento errado)")) return;
    const r = await chamar("DELETE", `/api/efetivos/veiculos/${veiculo.id}/movimentos/${id}`);
    if (!r.ok) return setErro(r.dados.error ?? "Não foi possível remover");
    await recarregar();
  }

  return (
    <Modal titulo={`Histórico — ${veiculo.identificacao}${veiculo.placa ? ` · ${veiculo.placa}` : ""}`} subtitulo="Por onde o veículo passou, da mais recente para a mais antiga." onFechar={onFechar}>
      <div className="space-y-2 px-6 py-5">
        {movs.length === 0 && <p className="text-sm text-gray-400">Nenhuma localização registrada para este veículo.</p>}
        <ol className="space-y-2">
          {movs.map((m) => {
            const eq = m.equipeId ? equipePorId.get(m.equipeId) : null;
            return (
              <li key={m.id} className="flex items-start justify-between gap-3 rounded-xl border border-line px-4 py-3 text-sm">
                <span className="min-w-0">
                  <span className="flex items-center gap-2 font-semibold text-ink">
                    <PontoContrato cor={corDoContrato(m.projeto)} tam={9} />
                    {rotuloContrato(m.projeto)}
                  </span>
                  <span className="mt-0.5 block text-xs text-gray-500">
                    {fmtDia(m.inicio)} a {m.fim ? fmtDia(m.fim) : "hoje (continua)"}
                    {eq ? ` · ${eq.codigo} ${eq.nome}` : ""}
                    {m.local ? ` · ${m.local}` : ""}
                  </span>
                  {m.observacao && <span className="block text-[11px] text-gray-400">{m.observacao}</span>}
                </span>
                {dados.podeEditar && (
                  <button onClick={() => remover(m.id)} className="btn-ghost btn-sm shrink-0">
                    remover
                  </button>
                )}
              </li>
            );
          })}
        </ol>
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
      </div>
    </Modal>
  );
}

/** Cadastra ou edita o veículo (placa, modelo, 4x4, situação) e, ao cadastrar, onde ele está. */
export function ModalVeiculo({ veiculo, onFechar, onSalvo }: { veiculo?: Veiculo | null; onFechar: () => void; onSalvo?: () => void }) {
  const { dados, recarregar } = useDados();
  const contratos = useContratos();
  const [f, setF] = useState({
    identificacao: veiculo?.identificacao ?? "",
    placa: veiculo?.placa ?? "",
    modelo: veiculo?.modelo ?? "",
    tracao4x4: veiculo?.tracao4x4 === true ? "sim" : veiculo?.tracao4x4 === false ? "nao" : "",
    status: veiculo?.status ?? "Em operação",
    observacao: veiculo?.observacao ?? "",
    projeto: "",
    equipeId: "",
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
    const corpo = veiculo ? base : { ...base, ...(f.projeto ? { localizacao: { inicio: f.inicio, projeto: f.projeto, equipeId: f.equipeId || null, local: f.local || null } } : {}) };
    const r = await chamar(veiculo ? "PATCH" : "POST", veiculo ? `/api/efetivos/veiculos/${veiculo.id}` : "/api/efetivos/veiculos", corpo);
    setSalvando(false);
    if (!r.ok) return setErro(r.dados.error ?? "Não foi possível salvar");
    await recarregar();
    onSalvo?.();
    onFechar();
  }

  return (
    <Modal titulo={veiculo ? `Editar ${veiculo.identificacao}` : "Novo veículo"} subtitulo={veiculo ? veiculo.codigo : "Cadastre a viatura e diga onde ela está."} onFechar={onFechar}>
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
            <option value="">Não informado</option>
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
            <div className="mb-2 text-sm font-semibold text-gray-700">Onde está agora (opcional)</div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo rotulo="Contrato / projeto">
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
