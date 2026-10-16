"use client";

// "O que falta preencher": os dados que as planilhas não trazem (datas das equipes, período de férias, previsão de entrada, placa e
// modelo das viaturas, gestor do contrato). Cada linha diz quanto falta, onde preencher no sistema e em qual aba do Excel.
import Link from "next/link";
import { useMemo } from "react";
import { temNome } from "@/lib/efetivos/disponibilidade";
import { useDados } from "./DadosContext";
import { Secao } from "./ui";

type Item = { chave: string; texto: string; n: number; href: string; onde: string };

export default function Pendencias() {
  const { dados, equipesCampo } = useDados();

  const itens: Item[] = useMemo(() => {
    const semFim = equipesCampo.filter((e) => !e.fim).length;
    const semInicio = equipesCampo.filter((e) => !e.inicio).length;
    const comPeriodo = new Set(dados.ausencias.map((a) => a.vagaId));
    const foraSemPeriodo = dados.vagas.filter((v) => temNome(v) && /f[eé]rias|afastad/i.test(v.status) && !comPeriodo.has(v.id)).length;
    const semEntrada = dados.vagas.filter((v) => (!v.nome && v.status === "Em contratação" && !v.previsaoInicio) || (temNome(v) && /contrata|mobiliza/i.test(v.status) && !v.previsaoInicio)).length;
    const semPlaca = dados.veiculos.filter((v) => !v.placa).length;
    const semModelo = dados.veiculos.filter((v) => !v.modelo).length;
    const semGestor = dados.contratos.filter((c) => c.ativo && !c.gestor).length;
    return [
      { chave: "fim", texto: "equipes sem data de fim", n: semFim, href: "/equipes?aba=planejamento", onde: "Equipes > Planejamento · Excel: aba EQUIPES" },
      { chave: "inicio", texto: "equipes sem data de início", n: semInicio, href: "/equipes?aba=planejamento", onde: "Equipes > Planejamento · Excel: aba EQUIPES" },
      { chave: "ferias", texto: "férias e afastamentos sem período", n: foraSemPeriodo, href: "/pessoas?aba=cadastro&situacao=AUSENTE", onde: "Pessoas > status · Excel: aba PESSOAS (Status: início e fim)" },
      { chave: "entrada", texto: "vagas em contratação ou mobilização sem previsão de entrada", n: semEntrada, href: "/pessoas?aba=vagas", onde: "Pessoas > Vagas · Excel: aba PESSOAS (Previsão de entrada)" },
      { chave: "placa", texto: "viaturas sem placa", n: semPlaca, href: "/frota", onde: "Viaturas · Excel: aba VIATURAS" },
      { chave: "modelo", texto: "viaturas sem modelo", n: semModelo, href: "/frota", onde: "Viaturas · Excel: aba VIATURAS" },
      { chave: "gestor", texto: "contratos sem gestor", n: semGestor, href: "/contratos", onde: "Contratos" },
    ].filter((i) => i.n > 0);
  }, [dados, equipesCampo]);

  return (
    <Secao
      titulo="O que falta preencher"
      sub="Dados que as planilhas não trazem. Preencha no sistema ou na base em Excel (Base > Baixar Excel, colunas amarelas, e Enviar planejamento preenchido)."
      direita={
        <Link href="/base" className="text-[12px] font-semibold text-brand-dark hover:underline">
          Base em Excel
        </Link>
      }
      semPadding
    >
      {itens.length === 0 ? (
        <p className="px-4 py-4 text-[13px] text-ok">Tudo preenchido.</p>
      ) : (
        <ul className="divide-y divide-line text-[13px]">
          {itens.map((i) => (
            <li key={i.chave}>
              <Link href={i.href} className="flex items-center gap-3 px-4 py-2 hover:bg-gray-50">
                <span className="num w-10 shrink-0 text-right font-display text-[18px] font-semibold text-warn">{i.n}</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-ink">{i.texto}</span>
                  <span className="block text-[11px] text-gray-500">{i.onde}</span>
                </span>
                <span className="shrink-0 text-[12px] font-semibold text-brand-dark">preencher</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Secao>
  );
}
