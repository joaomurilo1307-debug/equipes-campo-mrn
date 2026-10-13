"use client";

import { useMemo, useState } from "react";
import { STATUS_EQUIPE, ordenarGrupos } from "@/lib/efetivos/disponibilidade";
import { useDados } from "../DadosContext";
import { A_DEFINIR, chamar, contratosConhecidos, type Equipe } from "../comum";
import { IcLixo } from "../icones";
import { Aviso, Campo, Modal, RodapeModal } from "../ui";

/** Cria ou edita uma equipe-base. O contrato é opcional e pode ser digitado ou escolhido. */
export default function ModalEquipe({ equipe, projetoPadrao, onFechar, onSalvo }: { equipe?: Equipe | null; projetoPadrao?: string; onFechar: () => void; onSalvo: (equipeId?: string) => void | Promise<void> }) {
  const { dados, recarregar } = useDados();
  const contratos = useMemo(() => contratosConhecidos(dados), [dados]);
  const grupos = ordenarGrupos([...dados.equipes.map((e) => e.grupo), "Fauna", "Flora"]);
  const [v, setV] = useState({
    nome: equipe?.nome ?? "",
    projeto: equipe ? (equipe.projeto === A_DEFINIR ? "" : equipe.projeto) : projetoPadrao ?? "",
    gestor: equipe?.gestor ?? "",
    grupo: equipe?.grupo ?? "Fauna",
    status: equipe?.status ?? "Ativa",
    local: equipe?.local ?? "",
    observacao: equipe?.observacao ?? "",
  });
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const set = (k: keyof typeof v, valor: string) => setV((x) => ({ ...x, [k]: valor }));

  async function salvar() {
    setSalvando(true);
    setErro(null);
    const corpo = { nome: v.nome, projeto: v.projeto.trim() || A_DEFINIR, gestor: v.gestor || null, grupo: v.grupo, status: v.status, local: v.local || null, observacao: v.observacao || null };
    const r = await chamar(equipe ? "PATCH" : "POST", equipe ? `/api/efetivos/equipes/${equipe.id}` : "/api/efetivos/equipes", corpo);
    setSalvando(false);
    if (!r.ok) return setErro(r.dados.error ?? "Não foi possível salvar");
    await recarregar();
    await onSalvo((r.dados as any).equipe?.id);
  }

  async function excluir() {
    if (!equipe || !window.confirm(`Excluir a equipe ${equipe.codigo} (${equipe.nome})?`)) return;
    setSalvando(true);
    const r = await chamar("DELETE", `/api/efetivos/equipes/${equipe.id}`);
    setSalvando(false);
    if (!r.ok) return setErro(r.dados.error ?? "Não foi possível excluir");
    await recarregar();
    await onSalvo();
  }

  return (
    <Modal titulo={equipe ? `Editar ${equipe.codigo}` : "Nova equipe"} onFechar={onFechar}>
      <div className="grid gap-4 px-6 py-5 sm:grid-cols-2">
        <Campo rotulo="Nome da equipe / frente" className="sm:col-span-2">
          <input value={v.nome} onChange={(e) => set("nome", e.target.value)} className="field" autoFocus={!equipe} />
        </Campo>
        <Campo rotulo="Contrato">
          <input list="lista-contratos-eq" value={v.projeto} onChange={(e) => set("projeto", e.target.value)} placeholder="deixe em branco se ainda não tem" className="field" />
          <datalist id="lista-contratos-eq">
            {contratos.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </Campo>
        <Campo rotulo="Gestor MRN">
          <input value={v.gestor} onChange={(e) => set("gestor", e.target.value)} className="field" />
        </Campo>
        <Campo rotulo="Grupo">
          <input list="lista-grupos-eq" value={v.grupo} onChange={(e) => set("grupo", e.target.value)} className="field" />
          <datalist id="lista-grupos-eq">
            {grupos.map((g) => (
              <option key={g} value={g} />
            ))}
          </datalist>
        </Campo>
        <Campo rotulo="Situação da equipe">
          <select value={v.status} onChange={(e) => set("status", e.target.value)} className="field">
            {STATUS_EQUIPE.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Local / frente" className="sm:col-span-2">
          <input value={v.local} onChange={(e) => set("local", e.target.value)} className="field" />
        </Campo>
        <Campo rotulo="Observações" className="sm:col-span-2">
          <textarea value={v.observacao} onChange={(e) => set("observacao", e.target.value)} rows={3} className="field" />
        </Campo>
      </div>
      {erro && (
        <div className="px-6 pb-4">
          <Aviso tipo="erro">{erro}</Aviso>
        </div>
      )}
      <RodapeModal>
        {equipe && (
          <button onClick={excluir} disabled={salvando} className="btn-danger mr-auto">
            <IcLixo tam={15} /> Excluir
          </button>
        )}
        <button onClick={onFechar} className="btn-ghost">
          Cancelar
        </button>
        <button onClick={salvar} disabled={salvando || !v.nome.trim() || !v.grupo.trim()} className="btn-primary">
          {salvando ? "Salvando…" : equipe ? "Salvar" : "Criar equipe"}
        </button>
      </RodapeModal>
    </Modal>
  );
}
