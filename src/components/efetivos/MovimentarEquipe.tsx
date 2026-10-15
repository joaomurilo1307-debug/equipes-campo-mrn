"use client";

// Movimentar equipe: a equipe passa para outro contrato/frente a partir de uma data. As viaturas acompanham e as pessoas passam
// a ser do novo contrato. A passagem anterior é fechada no dia anterior e todas ficam registradas.
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { dataValida, somarDias, temNome } from "@/lib/efetivos/disponibilidade";
import { useDados } from "./DadosContext";
import { A_DEFINIR, chamar, contratosConhecidos, corDoContrato, ehReserva, fmtDia, rotuloContrato } from "./comum";
import { Assistente, Numeros, Pronto, ResumoCard, Rotulo } from "./assistente";
import { IcMover } from "./icones";
import { Aviso, PontoContrato, Secao } from "./ui";

export default function MovimentarEquipe() {
  const params = useSearchParams();
  const { dados, hoje, equipesCampo, equipePorId, vagasPorEquipe, veiculosPorEquipe, movimentosPorEquipe, recarregar, contagemDe } = useDados();
  const podeEditar = dados.podeEditar;
  const contratos = useMemo(() => contratosConhecidos(dados), [dados]);
  const pedida = params.get("equipe");
  const [equipeId, setEquipeId] = useState(pedida && equipePorId.has(pedida) ? pedida : equipesCampo[0]?.id ?? "");
  const equipe = equipePorId.get(equipeId);
  const pIni = params.get("inicio");
  const pFim = params.get("fim");
  const [f, setF] = useState({
    projeto: "",
    local: "",
    inicio: pIni && dataValida(pIni) ? pIni : hoje,
    comFim: !!(pFim && dataValida(pFim)),
    fim: pFim && dataValida(pFim) ? pFim : somarDias(hoje, 29),
    observacao: "",
    viaturas: true,
    pessoas: true,
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [feito, setFeito] = useState<{ agora: boolean; viaturas: number; pessoas: number; avisos: string[]; para: string; equipeId: string } | null>(null);

  const vagas = vagasPorEquipe.get(equipeId) ?? [];
  const pessoas = vagas.filter(temNome);
  const viaturas = veiculosPorEquipe.get(equipeId) ?? [];
  const passagens = [...(movimentosPorEquipe.get(equipeId) ?? [])].sort((a, b) => b.inicio.localeCompare(a.inicio));
  const cm = equipe ? contagemDe([equipe.id]) : null;
  const destino = f.projeto.trim();
  const mudaDeContrato = !!equipe && destino !== "" && destino !== equipe.projeto;
  const gestorDoDestino = dados.contratos.find((c) => c.codigo === destino)?.gestor ?? null;
  const datasOk = dataValida(f.inicio) && (!f.comFim || (dataValida(f.fim) && f.fim >= f.inicio));
  const podeSalvar = podeEditar && !!equipe && destino !== "" && datasOk && !salvando && (mudaDeContrato || f.local.trim() !== "" || (equipe?.local ?? "") !== f.local);
  const agendado = f.inicio > hoje;
  const doContratoAntigo = pessoas.filter((v) => !v.contrato || v.contrato === equipe?.projeto).length;

  async function salvar() {
    if (!equipe) return;
    setSalvando(true);
    setErro(null);
    const r = await chamar("POST", `/api/efetivos/equipes/${equipe.id}/movimentar`, {
      projeto: destino,
      local: f.local.trim() || null,
      inicio: f.inicio,
      fim: f.comFim ? f.fim : null,
      observacao: f.observacao.trim() || null,
      moverViaturas: f.viaturas,
      atualizarPessoas: f.pessoas,
    });
    setSalvando(false);
    if (!r.ok) return setErro(r.dados.error ?? "Não foi possível movimentar a equipe");
    await recarregar();
    const d = r.dados as any;
    setFeito({ agora: !!d.aplicadoAgora, viaturas: d.viaturas ?? 0, pessoas: d.pessoas ?? 0, avisos: d.avisos ?? [], para: destino, equipeId: equipe.id });
  }

  if (feito) {
    const e = equipePorId.get(feito.equipeId);
    return (
      <Pronto
        titulo={feito.agora ? "Equipe movimentada" : "Movimentação agendada"}
        texto={
          <>
            <strong>{e?.nome}</strong> → {rotuloContrato(feito.para)}
            <br />
            {feito.agora ? `${feito.pessoas} pessoa(s) passaram ao novo contrato e ${feito.viaturas} viatura(s) acompanharam.` : `Vale a partir de ${fmtDia(f.inicio)}: o sistema muda o contrato da equipe nesse dia. ${feito.viaturas} viatura(s) já ficam agendadas.`}
            {feito.avisos.length > 0 && (
              <>
                <br />
                <span className="text-warn">Atenção: {feito.avisos.join("; ")}</span>
              </>
            )}
          </>
        }
        acoes={
          <>
            <Link href={`/equipes?equipe=${feito.equipeId}`} className="btn-primary">
              Ver a equipe
            </Link>
            <Link href="/quadro" className="btn-ghost">
              Ver no quadro
            </Link>
            <Link href={`/equipes/movimentar?n=${Date.now()}`} className="btn-ghost">
              Movimentar outra
            </Link>
          </>
        }
      />
    );
  }

  return (
    <Assistente
      titulo="Movimentar equipe"
      subtitulo="Leve uma equipe para outro contrato ou frente a partir de uma data. A passagem atual é fechada no dia anterior e fica no histórico."
      voltarHref={equipe ? `/equipes?equipe=${equipe.id}` : "/equipes"}
      topo={!podeEditar ? <Aviso tipo="info">Seu acesso é só de consulta.</Aviso> : undefined}
      resumo={
        <ResumoCard
          rotulo="Movimentação"
          titulo={equipe?.nome ?? "Escolha a equipe"}
          linhas={equipe ? [`${rotuloContrato(equipe.projeto)} → ${destino ? rotuloContrato(destino) : "…"}`, `${fmtDia(f.inicio)}${f.comFim ? ` a ${fmtDia(f.fim)}` : " em diante"}${agendado ? " · agendado" : ""}`] : []}
          rodape={
            <>
              {erro && <Aviso tipo="erro">{erro}</Aviso>}
              <button type="button" onClick={salvar} disabled={!podeSalvar} className="btn-primary w-full">
                {salvando ? "Movimentando…" : agendado ? "Agendar movimentação" : "Movimentar equipe"}
              </button>
              <p className="text-center text-[11px] text-gray-400">Tudo fica no histórico.</p>
            </>
          }
        >
          <Numeros itens={[{ valor: pessoas.length, rotulo: "pessoas" }, { valor: viaturas.length, rotulo: "viaturas" }, { valor: cm?.abertas ?? 0, rotulo: "vagas abertas", cor: "#B86E00" }]} />
          {mudaDeContrato && gestorDoDestino && <p className="rounded-lg bg-gray-50 px-3 py-2 text-[12px] text-gray-600">O gestor passa a ser <strong className="text-ink">{gestorDoDestino}</strong>, do contrato {destino}.</p>}
          {f.pessoas && mudaDeContrato && !agendado && <p className="text-[11.5px] text-gray-500">{doContratoAntigo} pessoa(s) que estavam no contrato {rotuloContrato(equipe?.projeto ?? "")} passam para {rotuloContrato(destino)}.</p>}
        </ResumoCard>
      }
    >
      <Secao titulo="Qual equipe" sub="A equipe e onde ela está hoje.">
        <div className="grid gap-3 sm:grid-cols-2">
          <Rotulo t="Equipe" className="sm:col-span-2">
            <select value={equipeId} onChange={(e) => setEquipeId(e.target.value)} className="field">
              {[...new Set(equipesCampo.map((e) => e.projeto || A_DEFINIR))]
                .sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }))
                .map((c) => (
                  <optgroup key={c} label={rotuloContrato(c)}>
                    {equipesCampo
                      .filter((e) => (e.projeto || A_DEFINIR) === c && !ehReserva(e))
                      .map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.codigo} · {e.nome}
                        </option>
                      ))}
                  </optgroup>
                ))}
            </select>
          </Rotulo>
        </div>
        {equipe && (
          <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-gray-600">
            <span className="inline-flex items-center gap-2">
              <PontoContrato cor={corDoContrato(equipe.projeto)} />
              Hoje em <strong className="text-ink">{rotuloContrato(equipe.projeto)}</strong>
              {equipe.local ? ` · ${equipe.local}` : ""}
            </span>
            <span>
              {pessoas.length} pessoas · {viaturas.length} viatura{viaturas.length === 1 ? "" : "s"}
            </span>
          </p>
        )}
      </Secao>

      <Secao titulo="Para onde e quando" sub="O contrato de destino e a data em que a equipe passa a estar lá.">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Rotulo t="Contrato de destino">
            <input list="mv-contratos" value={f.projeto} onChange={(e) => set("projeto", e.target.value)} className="field" placeholder="ex.: 3687 LT" autoFocus />
            <datalist id="mv-contratos">
              {contratos.filter((c) => c !== equipe?.projeto).map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Rotulo>
          <Rotulo t="Frente / local (opcional)" className="lg:col-span-1">
            <input value={f.local} onChange={(e) => set("local", e.target.value)} className="field" placeholder={equipe?.local ?? ""} />
          </Rotulo>
          <Rotulo t="A partir de">
            <input type="date" value={f.inicio} onChange={(e) => e.target.value && set("inicio", e.target.value)} className="field" />
          </Rotulo>
          <div>
            <label className="mb-1 flex items-center gap-2 text-xs font-medium text-gray-600">
              <input type="checkbox" checked={f.comFim} onChange={(e) => set("comFim", e.target.checked)} className="accent-[#0A9E7F]" /> Tem data de fim
            </label>
            <input type="date" disabled={!f.comFim} value={f.fim} min={f.inicio} onChange={(e) => e.target.value && set("fim", e.target.value)} className="field disabled:bg-gray-50" />
          </div>
        </div>
        <Rotulo t="Observação (opcional)" className="mt-3 block">
          <input value={f.observacao} onChange={(e) => set("observacao", e.target.value)} className="field" placeholder="ex.: atendimento ao trecho 4, pedido da MRN" />
        </Rotulo>
        {agendado && <p className="mt-3 text-[12px] text-info">Data futura: fica agendada. No dia, o sistema muda o contrato da equipe sozinho e o quadro já mostra a passagem.</p>}
        {!datasOk && <p className="mt-3 text-[12px] text-bad">Confira as datas: o fim não pode ser antes do início.</p>}
      </Secao>

      <Secao titulo="O que vai junto" sub="Marque o que acompanha a equipe.">
        <label className="flex cursor-pointer items-start gap-2.5 py-1 text-[13px] text-gray-700">
          <input type="checkbox" checked={f.viaturas} onChange={(e) => set("viaturas", e.target.checked)} className="mt-0.5 accent-[#0A9E7F]" />
          <span>
            As viaturas da equipe acompanham ({viaturas.length}){viaturas.length > 0 && <span className="text-gray-400"> · {viaturas.map((v) => v.identificacao).join(", ")}</span>}
          </span>
        </label>
        <label className="flex cursor-pointer items-start gap-2.5 py-1 text-[13px] text-gray-700">
          <input type="checkbox" checked={f.pessoas} onChange={(e) => set("pessoas", e.target.checked)} className="mt-0.5 accent-[#0A9E7F]" />
          <span>As pessoas da equipe passam a ser do novo contrato ({doContratoAntigo}). Quem está em outro contrato por empréstimo continua como está.</span>
        </label>
      </Secao>

      {passagens.length > 0 && (
        <Secao titulo="Passagens desta equipe" sub="A mais recente em cima." semPadding>
          <ul className="divide-y divide-line">
            {passagens.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 px-4 py-2 text-[12.5px]">
                <span className="inline-flex items-center gap-2">
                  <PontoContrato cor={corDoContrato(m.projeto)} tam={8} />
                  <strong className="text-ink">{rotuloContrato(m.projeto)}</strong>
                  {m.local && <span className="text-gray-500">· {m.local}</span>}
                </span>
                <span className="num text-gray-500">
                  {fmtDia(m.inicio)} → {m.fim ? fmtDia(m.fim) : "em curso"}
                </span>
              </li>
            ))}
          </ul>
        </Secao>
      )}
      <p className="flex items-center gap-1.5 text-[11.5px] text-gray-400">
        <IcMover tam={13} /> Para corrigir o contrato cadastrado sem registrar passagem, edite o campo Contrato na ficha da equipe.
      </p>
    </Assistente>
  );
}
