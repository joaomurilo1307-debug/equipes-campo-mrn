"use client";

import PaginaComAbas from "./Abas";
import EquipesPessoas from "./EquipesPessoas";
import Planejamento from "./Planejamento";

/** Equipes: a composição de cada equipe e o planejamento (início e fim). A linha do tempo e o histograma são páginas próprias. */
export default function EquipesComAbas() {
  return (
    <PaginaComAbas
      titulo="Equipes"
      subtitulo="Cada equipe com suas posições e o planejamento de início e fim. Para ver o tempo de todas juntas, use Linha do tempo e Histograma no menu."
      padrao="equipes"
      abas={[
        { id: "equipes", rotulo: "Equipes e posições", dica: "Composição de cada equipe", conteudo: () => <EquipesPessoas /> },
        { id: "planejamento", rotulo: "Planejamento (datas)", dica: "Início e fim de cada equipe, e quem fica livre quando", conteudo: () => <Planejamento /> },
      ]}
    />
  );
}
