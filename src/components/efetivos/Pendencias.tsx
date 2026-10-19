"use client";

// "Sua missão": tudo o que o Samuel precisa preencher e as planilhas não trazem (datas das equipes, período de férias, previsão de entrada,
// placa e modelo das viaturas, tempo de uso, gestor do contrato), como passos em ordem. Cada passo mostra quanto falta, o que fazer e leva
// direto ao lugar certo (e diz onde fica na base em Excel). Passo concluído fica verde; a barra mostra o quanto já foi preenchido.
import Link from "next/link";
import { useMemo } from "react";
import { temNome } from "@/lib/efetivos/disponibilidade";
import { useDados } from "./DadosContext";

type Passo = { chave: string; titulo: string; oque: string; pendente: number; total: number; unidade: string; href: string; botao: string; excel: string };

export default function Pendencias() {
  const { dados, equipesCampo, conferenciaDoUso, conflitosDeViatura } = useDados();

  const passos: Passo[] = useMemo(() => {
    const usos = dados.usosVeiculo ?? [];
    const comPeriodo = new Set(dados.ausencias.map((a) => a.vagaId));
    const feriasTotal = dados.vagas.filter((v) => temNome(v) && /f[eé]rias|afastad/i.test(v.status));
    const feriasSem = feriasTotal.filter((v) => !comPeriodo.has(v.id)).length;
    const vagasEntrada = dados.vagas.filter((v) => (!v.nome && v.status === "Em contratação") || (temNome(v) && /contrata|mobiliza/i.test(v.status)));
    const entradaSem = vagasEntrada.filter((v) => !v.previsaoInicio).length;
    const contratosAtivos = dados.contratos.filter((c) => c.ativo);
    const prevista = dados.veiculos.filter((v) => v.status === "Prevista" && !dados.veiculos.some((x) => x.substituidoPorId === v.id)).length;
    return [
      { chave: "datas", titulo: "Datas das equipes", oque: "Informe quando cada equipe começa e quando termina.", pendente: new Set([...equipesCampo.filter((e) => !e.fim), ...equipesCampo.filter((e) => !e.inicio)]).size, total: equipesCampo.length, unidade: "equipes", href: "/equipes?aba=planejamento", botao: "Preencher datas", excel: "Excel: aba EQUIPES (Início e Fim da equipe)" },
      { chave: "ferias", titulo: "Férias e afastamentos", oque: "Para cada pessoa de férias ou afastada, informe de quando até quando.", pendente: feriasSem, total: feriasTotal.length, unidade: "pessoas", href: "/pessoas?aba=cadastro&situacao=AUSENTE", botao: "Informar períodos", excel: "Excel: aba PESSOAS (Status: início e fim)" },
      { chave: "entrada", titulo: "Entrada de quem vai começar", oque: "Informe a data prevista para as vagas em contratação ou mobilização.", pendente: entradaSem, total: vagasEntrada.length, unidade: "vagas", href: "/pessoas?aba=vagas", botao: "Informar previsões", excel: "Excel: aba PESSOAS (Previsão de entrada)" },
      { chave: "viaturas", titulo: "Placa e modelo das viaturas", oque: "Complete a placa e o modelo de cada viatura.", pendente: new Set([...dados.veiculos.filter((v) => !v.placa), ...dados.veiculos.filter((v) => !v.modelo)]).size, total: dados.veiculos.length, unidade: "viaturas", href: "/frota", botao: "Completar viaturas", excel: "Excel: aba VIATURAS (placa e modelo)" },
      { chave: "uso", titulo: "Tempo de cada viatura nas equipes", oque: "Diga de quando até quando a viatura ficou em cada equipe e confira se bate com o tempo da equipe.", pendente: new Set([...usos.filter((u) => !u.inicio && !u.fim), ...usos.filter((u) => conferenciaDoUso(u).nivel === "atencao")]).size + conflitosDeViatura.length, total: usos.length, unidade: "usos", href: "/frota", botao: "Definir tempos", excel: "Excel: aba VIATURAS (Início e Fim na equipe, Confere com a equipe?)" },
      { chave: "troca", titulo: "Viaturas previstas", oque: "Toda viatura prevista precisa substituir uma viatura. Use Editar > Troca planejada.", pendente: prevista, total: dados.veiculos.filter((v) => v.status === "Prevista").length, unidade: "viaturas", href: "/frota", botao: "Ajustar trocas", excel: "Excel: aba VIATURAS (Será substituída por)" },
      { chave: "gestor", titulo: "Gestor de cada contrato", oque: "Informe quem é o gestor de cada contrato.", pendente: contratosAtivos.filter((c) => !c.gestor).length, total: contratosAtivos.length, unidade: "contratos", href: "/contratos", botao: "Informar gestores", excel: "Sistema: Contratos" },
    ].filter((p) => p.total > 0);
  }, [dados, equipesCampo, conferenciaDoUso, conflitosDeViatura]);

  const totalGeral = passos.reduce((s, p) => s + p.total, 0);
  const feitoGeral = passos.reduce((s, p) => s + Math.max(0, p.total - p.pendente), 0);
  const pct = totalGeral ? Math.round((feitoGeral / totalGeral) * 100) : 100;
  const concluidos = passos.filter((p) => p.pendente === 0).length;
  const proximo = passos.find((p) => p.pendente > 0);

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-brand-light/40 px-4 py-3">
        <div className="min-w-0">
          <h2 className="font-display text-[16px] font-semibold tracking-tight text-ink">Sua missão: completar os dados</h2>
          <p className="text-[12px] text-gray-600">{proximo ? `${concluidos} de ${passos.length} passos concluídos. Clique em um passo para ir direto ao lugar de preencher.` : "Tudo preenchido. Obrigado!"}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-40" title={`${feitoGeral} de ${totalGeral} itens preenchidos`}>
            <div className="h-2 overflow-hidden rounded-full bg-white"><div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} /></div>
            <p className="mt-0.5 text-right text-[11px] font-semibold tabular-nums text-brand-dark">{pct}% preenchido</p>
          </div>
          {proximo && <Link href={proximo.href} className="rounded-lg bg-brand px-3.5 py-2 text-[13px] font-semibold text-white hover:opacity-90">Começar pelo passo {passos.indexOf(proximo) + 1}</Link>}
        </div>
      </div>
      <ol className="divide-y divide-line text-[13px]">
        {passos.map((p, i) => {
          const ok = p.pendente === 0;
          return (
            <li key={p.chave}>
              <Link href={p.href} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50">
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-bold ${ok ? "bg-ok/15 text-ok" : "bg-warn/15 text-warn"}`}>{ok ? "✓" : i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-ink">{p.titulo}</span>
                  <span className="block text-[12px] text-gray-600">{p.oque}</span>
                  <span className="block text-[11px] text-gray-400">{p.excel}</span>
                </span>
                <span className="w-28 shrink-0 text-right">
                  {ok ? <span className="text-[12px] font-semibold text-ok">concluído</span> : <><span className="num block font-display text-[18px] font-semibold leading-none text-warn">{p.pendente}</span><span className="block text-[11px] text-gray-500">{p.unidade} faltando</span></>}
                </span>
                <span className={`shrink-0 rounded-lg border px-3 py-1.5 text-[12px] font-semibold ${ok ? "border-line text-gray-400" : "border-brand text-brand-dark"}`}>{ok ? "rever" : p.botao}</span>
              </Link>
            </li>
          );
        })}
      </ol>
      <p className="border-t border-line px-4 py-2 text-[11.5px] text-gray-500">
        Prefere preencher em planilha? <Link href="/base" className="font-semibold text-brand-dark hover:underline">Base em Excel</Link>: baixe, preencha as colunas amarelas e envie em “Enviar planejamento preenchido”.
      </p>
    </section>
  );
}
