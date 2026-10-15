"use client";

import { useRef, useState } from "react";
import { useDados } from "./DadosContext";
import { chamar, hojeBr } from "./comum";
import { Aviso } from "./ui";

function dataDoNomeDoArquivo(nome: string): string | null {
  const m = /(\d{2})_(\d{2})_(\d{4})/.exec(nome);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

/** Importa as planilhas do Samuel (uma por contrato, ou a base do sistema; carga inicial, nunca sobrescreve). Mostra o que entraria antes de gravar. */
export default function ImportarPlanilha({ onConcluido }: { onConcluido?: () => void }) {
  const { dados, recarregar } = useDados();
  const temEquipes = dados.equipes.length > 0;
  const arquivoRef = useRef<HTMLInputElement>(null);
  const [nomeArquivo, setNomeArquivo] = useState("");
  const [dataRef, setDataRef] = useState(hojeBr());
  const [acrescentar, setAcrescentar] = useState(false);
  const [resumo, setResumo] = useState<any | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function enviar(simular: boolean) {
    const arquivos = Array.from(arquivoRef.current?.files ?? []);
    if (arquivos.length === 0) return setErro("Escolha a planilha (.xlsx) primeiro.");
    setOcupado(true);
    setErro(null);
    setOk(null);
    const fd = new FormData();
    for (const a of arquivos) fd.append("arquivo", a);
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
    onConcluido?.();
  }

  return (
    <div className="space-y-3 px-6 py-5">
      <p className="text-xs text-gray-500">
        Escolha as planilhas de acompanhamento do Samuel — <strong>uma por contrato</strong> (3686, 3687 LT…; pode marcar várias de uma vez, que viram uma base só) ou a base baixada deste sistema. É a <strong>carga inicial</strong>: depois dela, a atualização é feita aqui no sistema e a importação nunca sobrescreve o que já foi ajustado.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <label>
          <span className="label">Planilha(s)</span>
          <input
            ref={arquivoRef}
            type="file"
            accept=".xlsx"
            multiple
            onChange={(e) => {
              const fs = Array.from(e.target.files ?? []);
              setNomeArquivo(fs.map((f) => f.name).join(" + "));
              setResumo(null);
              // a data da planilha vem do nome do arquivo (a mais recente, se houver mais de uma)
              const datas = fs.map((f) => dataDoNomeDoArquivo(f.name)).filter((x): x is string => !!x).sort();
              if (datas.length) setDataRef(datas[datas.length - 1]);
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
          Acrescentar só equipes novas (as de mesmo nome são mantidas como estão)
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
            <li>Viaturas: <strong>{resumo.veiculosNovos}</strong></li>
            <li>Apoio de outro contrato: <strong>{resumo.apoioDeOutroContrato}</strong> pessoas</li>
          </ul>
          {resumo.avisos?.length > 0 && (
            <ul className="list-disc space-y-0.5 pl-5 text-xs text-gray-600">
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
  );
}
