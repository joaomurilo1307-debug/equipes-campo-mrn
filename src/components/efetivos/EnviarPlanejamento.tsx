"use client";

import { useRef, useState } from "react";
import { useDados } from "./DadosContext";
import { chamar } from "./comum";
import { Aviso } from "./ui";

type Resumo = { simulacao: boolean; equipes: number; posicoes: number; viaturas: number; contratos: number; ausencias: number; movimentacoes?: number; viaturasNovas?: number; periodosDeViatura?: number; trocas?: number; total: number; exemplos: string[]; avisos: string[] };

/**
 * Envia a base em Excel PREENCHIDA (as colunas em amarelo: início e fim das equipes, previsão de entrada, placas, períodos de
 * ausência). Só preenche: célula em branco nunca apaga o que já está no sistema. Mostra o que mudaria antes de aplicar.
 */
export default function EnviarPlanejamento({ onConcluido }: { onConcluido?: () => void }) {
  const { recarregar } = useDados();
  const arquivoRef = useRef<HTMLInputElement>(null);
  const [nome, setNome] = useState("");
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function enviar(simular: boolean) {
    const arquivo = arquivoRef.current?.files?.[0];
    if (!arquivo) return setErro("Escolha a base em Excel (.xlsx) preenchida primeiro.");
    setOcupado(true);
    setErro(null);
    setOk(null);
    const fd = new FormData();
    fd.append("arquivo", arquivo);
    const r = await chamar<Resumo>("POST", `/api/efetivos/planejamento${simular ? "?simular=1" : ""}`, fd);
    setOcupado(false);
    if (!r.ok) {
      setResumo(null);
      return setErro((r.dados as any).error ?? "Não foi possível enviar");
    }
    if (simular) return setResumo(r.dados as Resumo);
    setResumo(null);
    const d = r.dados as Resumo;
    setOk(d.total === 0 ? "Nada mudou: o Excel não trazia nada novo." : `Planejamento aplicado: ${d.equipes} equipes, ${d.posicoes} posições, ${d.viaturas} viaturas, ${d.contratos} contratos e ${d.ausencias} ausências${d.movimentacoes ? `; ${d.movimentacoes} movimentações de pessoas feitas` : ""}.`);
    if (arquivoRef.current) arquivoRef.current.value = "";
    setNome("");
    await recarregar();
    onConcluido?.();
  }

  return (
    <div className="space-y-3 px-6 py-5">
      <p className="text-xs text-gray-500">
        Baixe a base (<strong>Baixar Excel</strong>), preencha as colunas em <strong>amarelo</strong> (início e fim de cada equipe na aba EQUIPES, status e previsão de entrada na aba PESSOAS, placas e tempo das viaturas na aba VIATURAS) e, para mexer em gente, a aba <strong>MOVIMENTAÇÕES</strong> (mover de equipe, liberar, desmobilizar, mudar status), e envie de volta. Só preenche: célula em branco não apaga nada, e o que veio das planilhas do Samuel não é alterado.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <label>
          <span className="label">Base preenchida (.xlsx)</span>
          <input
            ref={arquivoRef}
            type="file"
            accept=".xlsx"
            onChange={(e) => {
              setNome(e.target.files?.[0]?.name ?? "");
              setResumo(null);
              setOk(null);
            }}
            className="mt-1 block text-sm"
          />
        </label>
        <button onClick={() => enviar(true)} disabled={ocupado || !nome} className="btn-ghost">
          {ocupado ? "Lendo…" : "Conferir o que vai mudar"}
        </button>
      </div>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {ok && <Aviso tipo="ok">{ok}</Aviso>}
      {resumo && (
        <div className="space-y-2 rounded-xl border border-line bg-gray-50 p-4 text-sm">
          <div className="font-semibold text-ink">{resumo.total === 0 ? "Nada a mudar: o Excel não traz nada novo em relação ao sistema." : "O que vai mudar (nada foi gravado ainda):"}</div>
          {resumo.total > 0 && (
            <ul className="grid gap-x-6 gap-y-0.5 text-xs text-gray-700 sm:grid-cols-2">
              <li>Equipes (datas, local, gestor): <strong>{resumo.equipes}</strong></li>
              <li>Posições (previsão de entrada, contrato atual…): <strong>{resumo.posicoes}</strong></li>
              <li>Viaturas (placa, modelo…): <strong>{resumo.viaturas}</strong></li>
              <li>Contratos: <strong>{resumo.contratos}</strong></li>
              <li>Ausências com período: <strong>{resumo.ausencias}</strong></li>
              <li>Viaturas novas, períodos e trocas: <strong>{(resumo.viaturasNovas ?? 0) + (resumo.periodosDeViatura ?? 0) + (resumo.trocas ?? 0)}</strong></li>
              <li>Movimentações de pessoas (aba MOVIMENTAÇÕES): <strong>{resumo.movimentacoes ?? 0}</strong></li>
            </ul>
          )}
          {resumo.exemplos.length > 0 && (
            <ul className="list-disc space-y-0.5 pl-5 text-[11.5px] text-gray-600">
              {resumo.exemplos.map((x, i) => (
                <li key={i}>{x}</li>
              ))}
            </ul>
          )}
          {resumo.avisos.length > 0 && (
            <div>
              <div className="text-[11.5px] font-semibold text-warn">Atenção ({resumo.avisos.length})</div>
              <ul className="list-disc space-y-0.5 pl-5 text-[11.5px] text-gray-600">
                {resumo.avisos.slice(0, 12).map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </div>
          )}
          <button onClick={() => enviar(false)} disabled={ocupado || resumo.total === 0} className="btn-primary">
            {ocupado ? "Aplicando…" : "Aplicar"}
          </button>
        </div>
      )}
    </div>
  );
}
