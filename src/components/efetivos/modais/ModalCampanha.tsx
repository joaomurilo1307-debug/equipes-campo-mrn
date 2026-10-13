"use client";

import { useMemo, useState } from "react";
import { ATIVIDADES, PRIORIDADES, STATUS_CAMPANHA, ordenarGrupos } from "@/lib/efetivos/disponibilidade";
import { useDados } from "../DadosContext";
import { A_DEFINIR, campanhaDeApi, chamar, descreverConflitos, hojeBr, type Campanha } from "../comum";
import { Aviso, Campo, Modal, RodapeModal } from "../ui";

export type PadraoCampanha = Partial<{ projeto: string; grupo: string; atividade: string; inicio: string; fim: string; qtdEquipes: number }>;

/** Cria ou edita uma campanha (o pedido do cliente + o período). */
export default function ModalCampanha({
  campanha,
  padrao,
  onFechar,
  onSalvo,
}: {
  campanha?: Campanha | null;
  padrao?: PadraoCampanha;
  onFechar: () => void;
  onSalvo: (c: Campanha) => void | Promise<void>;
}) {
  const { dados, recarregar, hoje } = useDados();
  const grupos = ordenarGrupos([...dados.equipes.map((e) => e.grupo), "Fauna", "Flora"]).filter((g) => g !== "Apoio");
  const projetos = useMemo(() => Array.from(new Set(dados.equipes.map((e) => e.projeto).filter((p) => p !== A_DEFINIR))).sort(), [dados.equipes]);
  const [v, setV] = useState({
    recebidaEm: campanha?.recebidaEm ?? hoje,
    solicitante: campanha?.solicitante ?? "",
    projeto: campanha?.projeto ?? padrao?.projeto ?? "",
    grupo: campanha?.grupo ?? padrao?.grupo ?? grupos[0] ?? "Fauna",
    atividade: campanha?.atividade ?? padrao?.atividade ?? "Resgate",
    local: campanha?.local ?? "",
    inicio: campanha?.inicio ?? padrao?.inicio ?? hojeBr(),
    fim: campanha?.fim ?? padrao?.fim ?? hojeBr(),
    qtdEquipes: campanha?.qtdEquipes ?? padrao?.qtdEquipes ?? 1,
    prioridade: campanha?.prioridade ?? "Média",
    status: campanha?.status ?? "Nova",
    observacao: campanha?.observacao ?? "",
  });
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const set = (k: keyof typeof v, valor: string | number) => setV((x) => ({ ...x, [k]: valor }));

  async function salvar() {
    setSalvando(true);
    setErro(null);
    const corpo = {
      recebidaEm: v.recebidaEm || null,
      solicitante: v.solicitante || null,
      projeto: v.projeto,
      grupo: v.grupo,
      atividade: v.atividade,
      local: v.local || null,
      inicio: v.inicio,
      fim: v.fim,
      qtdEquipes: Number(v.qtdEquipes),
      prioridade: v.prioridade,
      status: v.status,
      observacao: v.observacao || null,
    };
    const r = await chamar(campanha ? "PATCH" : "POST", campanha ? `/api/efetivos/campanhas/${campanha.id}` : "/api/efetivos/campanhas", corpo);
    setSalvando(false);
    if (!r.ok) return setErro(descreverConflitos(r.dados));
    await recarregar();
    await onSalvo(campanhaDeApi((r.dados as any).campanha));
  }

  const invalido = !v.projeto.trim() || !v.inicio || !v.fim || v.fim < v.inicio;
  return (
    <Modal titulo={campanha ? `Editar ${campanha.codigo}` : "Nova campanha"} subtitulo="O pedido do cliente e o período em que a equipe fica em campo." onFechar={onFechar}>
      <div className="grid gap-4 px-6 py-5 sm:grid-cols-2">
        <Campo rotulo="Contrato / projeto">
          <input list="lista-projetos" value={v.projeto} onChange={(e) => set("projeto", e.target.value)} className="field" placeholder="ex.: 3636 PNM" />
          <datalist id="lista-projetos">
            {projetos.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </Campo>
        <Campo rotulo="Grupo">
          <select value={v.grupo} onChange={(e) => set("grupo", e.target.value)} className="field">
            {grupos.map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Atividade">
          <select value={v.atividade} onChange={(e) => set("atividade", e.target.value)} className="field">
            {ATIVIDADES.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Local / frente">
          <input value={v.local} onChange={(e) => set("local", e.target.value)} className="field" />
        </Campo>
        <Campo rotulo="Início">
          <input type="date" value={v.inicio} onChange={(e) => set("inicio", e.target.value)} className="field" />
        </Campo>
        <Campo rotulo="Fim">
          <input type="date" value={v.fim} min={v.inicio} onChange={(e) => set("fim", e.target.value)} className="field" />
        </Campo>
        <Campo rotulo="Equipes pedidas">
          <input type="number" min={1} max={100} value={v.qtdEquipes} onChange={(e) => set("qtdEquipes", Number(e.target.value))} className="field" />
        </Campo>
        <Campo rotulo="Prioridade">
          <select value={v.prioridade} onChange={(e) => set("prioridade", e.target.value)} className="field">
            {PRIORIDADES.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Solicitante">
          <input value={v.solicitante} onChange={(e) => set("solicitante", e.target.value)} className="field" />
        </Campo>
        <Campo rotulo="Recebida em">
          <input type="date" value={v.recebidaEm} onChange={(e) => set("recebidaEm", e.target.value)} className="field" />
        </Campo>
        <Campo rotulo="Situação" className="sm:col-span-2" dica="Concluída e Cancelada liberam as pessoas escaladas; o histórico fica guardado.">
          <select value={v.status} onChange={(e) => set("status", e.target.value)} className="field">
            {STATUS_CAMPANHA.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Observação" className="sm:col-span-2">
          <textarea value={v.observacao} onChange={(e) => set("observacao", e.target.value)} rows={2} className="field" />
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
        <button onClick={salvar} disabled={salvando || invalido} className="btn-primary">
          {salvando ? "Salvando…" : campanha ? "Salvar" : "Criar campanha"}
        </button>
      </RodapeModal>
    </Modal>
  );
}
