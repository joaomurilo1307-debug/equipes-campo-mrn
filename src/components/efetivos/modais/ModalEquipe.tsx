"use client";

import { useMemo, useState } from "react";
import { STATUS_EQUIPE, ordenarGrupos } from "@/lib/efetivos/disponibilidade";
import { useDados } from "../DadosContext";
import { A_DEFINIR, chamar, type Equipe } from "../comum";
import { Aviso, Campo, Modal, RodapeModal } from "../ui";

/** Cria ou edita uma equipe-base (o contrato dela é o que organiza o quadro e a frota). */
export default function ModalEquipe({ equipe, projetoPadrao, onFechar, onSalvo }: { equipe?: Equipe | null; projetoPadrao?: string; onFechar: () => void; onSalvo: () => void | Promise<void> }) {
  const { dados, recarregar } = useDados();
  const projetos = useMemo(() => Array.from(new Set(dados.equipes.map((e) => e.projeto).filter((p) => p !== A_DEFINIR))).sort(), [dados.equipes]);
  const grupos = ordenarGrupos([...dados.equipes.map((e) => e.grupo), "Fauna", "Flora"]);
  const [v, setV] = useState({
    nome: equipe?.nome ?? "",
    projeto: equipe ? (equipe.projeto === A_DEFINIR ? "" : equipe.projeto) : projetoPadrao ?? "",
    gestor: equipe?.gestor ?? "",
    grupo: equipe?.grupo ?? "Fauna",
    status: equipe?.status ?? "Ativa",
  });
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const set = (k: keyof typeof v, valor: string) => setV((x) => ({ ...x, [k]: valor }));
  const aConfirmar = !!equipe && !equipe.contratoConfirmado;

  async function salvar(soConfirmar = false) {
    setSalvando(true);
    setErro(null);
    const corpo = soConfirmar ? { contratoConfirmado: true } : { nome: v.nome, projeto: v.projeto || A_DEFINIR, gestor: v.gestor || null, grupo: v.grupo, status: v.status };
    const r = await chamar(equipe ? "PATCH" : "POST", equipe ? `/api/efetivos/equipes/${equipe.id}` : "/api/efetivos/equipes", corpo);
    setSalvando(false);
    if (!r.ok) return setErro(r.dados.error ?? "Não foi possível salvar");
    await recarregar();
    await onSalvo();
  }

  return (
    <Modal titulo={equipe ? `Editar ${equipe.codigo}` : "Nova equipe"} subtitulo="Equipe-base: o grupo de vagas que trabalha junto num contrato." onFechar={onFechar}>
      <div className="grid gap-4 px-6 py-5 sm:grid-cols-2">
        {aConfirmar && (
          <div className="sm:col-span-2">
            <Aviso tipo="atencao">
              O contrato desta equipe foi <strong>deduzido pelo nome</strong> (a planilha não o informa). Se estiver certo, confirme; se não, corrija abaixo.
              <div className="mt-2">
                <button onClick={() => salvar(true)} disabled={salvando} className="btn-ghost btn-sm">
                  Confirmar “{equipe!.projeto === A_DEFINIR ? "a definir" : equipe!.projeto}”
                </button>
              </div>
            </Aviso>
          </div>
        )}
        <Campo rotulo="Nome da equipe / frente" className="sm:col-span-2">
          <input value={v.nome} onChange={(e) => set("nome", e.target.value)} className="field" autoFocus={!equipe} />
        </Campo>
        <Campo rotulo="Contrato / projeto (CT)">
          <input list="lista-projetos-eq" value={v.projeto} onChange={(e) => set("projeto", e.target.value)} placeholder="ex.: 3636 PNM" className="field" />
          <datalist id="lista-projetos-eq">
            {projetos.map((p) => (
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
        <button onClick={() => salvar()} disabled={salvando || !v.nome.trim() || !v.grupo.trim()} className="btn-primary">
          {salvando ? "Salvando…" : equipe ? "Salvar" : "Criar equipe"}
        </button>
      </RodapeModal>
    </Modal>
  );
}
