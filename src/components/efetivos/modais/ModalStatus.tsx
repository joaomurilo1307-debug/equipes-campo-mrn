"use client";

import { useState } from "react";
import { useDados } from "../DadosContext";
import { chamar, fmtDia, hojeBr, type Vaga } from "../comum";
import { Aviso, Campo, Modal, RodapeModal } from "../ui";

/** Os status que a pessoa pode ter. "Vigente" = trabalhando. Os de afastamento aceitam período (início e fim). */
export const STATUS_DA_PESSOA = ["Vigente", "Férias", "Afastado", "Apto com restrição", "Em contratação", "Em mobilização", "Desmobilizado"] as const;
// status que viram uma ausência com data (a pessoa só fica ausente no período)
const COM_PERIODO = ["Férias", "Afastado"];
const COM_ENTRADA = ["Em contratação", "Em mobilização"];

/**
 * Muda o status de uma pessoa de forma simples: escolhe o status e, se for férias ou afastamento, o período; se for contratação
 * ou mobilização, a previsão de entrada. Com período, a pessoa continua na equipe e só fica ausente nas datas.
 */
export default function ModalStatus({ vaga, onFechar }: { vaga: Vaga; onFechar: () => void }) {
  const { recarregar, nomeDe, dados } = useDados();
  const aus = dados.ausencias.filter((a) => a.vagaId === vaga.id).sort((a, b) => a.inicio.localeCompare(b.inicio));
  const [status, setStatus] = useState<string>(vaga.status);
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");
  const [entrada, setEntrada] = useState(vaga.previsaoInicio ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const periodo = COM_PERIODO.includes(status);
  const temEntrada = COM_ENTRADA.includes(status);
  const lista = (STATUS_DA_PESSOA as readonly string[]).includes(vaga.status) ? [...STATUS_DA_PESSOA] : [vaga.status, ...STATUS_DA_PESSOA];

  async function salvar() {
    setSalvando(true);
    setErro(null);
    if (periodo && (inicio || fim)) {
      if (!inicio || !fim) {
        setSalvando(false);
        return setErro("Informe o início e o fim do período, ou deixe os dois em branco.");
      }
      if (fim < inicio) {
        setSalvando(false);
        return setErro("O fim não pode ser antes do início.");
      }
      // período informado: a pessoa continua Vigente e a ausência tem data
      const r = await chamar("POST", "/api/efetivos/ausencias", { vagaId: vaga.id, tipo: status, inicio, fim });
      if (!r.ok) {
        setSalvando(false);
        return setErro(r.dados.error ?? "Não foi possível lançar o período");
      }
      if (vaga.status !== "Vigente") await chamar("PATCH", `/api/efetivos/vagas/${vaga.id}`, { status: "Vigente" });
    } else {
      const corpo: Record<string, unknown> = { status };
      if (temEntrada) corpo.previsaoInicio = entrada || null;
      const r = await chamar("PATCH", `/api/efetivos/vagas/${vaga.id}`, corpo);
      if (!r.ok) {
        setSalvando(false);
        return setErro(r.dados.error ?? "Não foi possível salvar");
      }
    }
    setSalvando(false);
    await recarregar();
    onFechar();
  }

  return (
    <Modal titulo="Status da pessoa" subtitulo={`${nomeDe(vaga)} · ${vaga.cargo}`} onFechar={onFechar}>
      <div className="space-y-4 px-6 py-5">
        <Campo rotulo="Status">
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="field" autoFocus>
            {lista.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Campo>
        {periodo && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo rotulo="Início" dica="Com início e fim, a pessoa só fica ausente nesse período.">
              <input type="date" value={inicio} max={fim || undefined} onChange={(e) => setInicio(e.target.value)} className="field" placeholder={hojeBr()} />
            </Campo>
            <Campo rotulo="Fim">
              <input type="date" value={fim} min={inicio || undefined} onChange={(e) => setFim(e.target.value)} className="field" />
            </Campo>
          </div>
        )}
        {temEntrada && (
          <Campo rotulo="Previsão de entrada" dica="Quando o profissional entra na equipe.">
            <input type="date" value={entrada} onChange={(e) => setEntrada(e.target.value)} className="field" />
          </Campo>
        )}
        {aus.length > 0 && (
          <div className="rounded-lg bg-gray-50 px-3 py-2 text-[12px] text-gray-600">
            Períodos já lançados:{" "}
            {aus.map((a) => `${a.tipo} ${fmtDia(a.inicio)} a ${fmtDia(a.fim)}`).join(" · ")}
          </div>
        )}
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
      </div>
      <RodapeModal>
        <button onClick={onFechar} className="btn-ghost">
          Cancelar
        </button>
        <button onClick={salvar} disabled={salvando} className="btn-primary">
          {salvando ? "Salvando…" : "Salvar"}
        </button>
      </RodapeModal>
    </Modal>
  );
}
