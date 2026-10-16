"use client";

import PaginaComAbas from "./Abas";
import Histograma from "./Histograma";
import HistogramaViaturas from "./HistogramaViaturas";

/** Histograma: o de pessoas e equipes e o de viaturas, cada um na sua aba. */
export default function HistogramaComAbas() {
  return (
    <PaginaComAbas
      titulo="Histograma"
      subtitulo="Quanto cada equipe, contrato ou cliente usa de pessoas e de viaturas, mês a mês, e quanto está livre."
      padrao="pessoas"
      abas={[
        { id: "pessoas", rotulo: "Pessoas e equipes", dica: "Pessoas, posições, vagas, ausentes e equipes, com as pessoas livres no fim", conteudo: () => <Histograma /> },
        { id: "viaturas", rotulo: "Viaturas", dica: "Viaturas em uso, livres, em manutenção e previstas, mês a mês", conteudo: () => <HistogramaViaturas /> },
      ]}
    />
  );
}
