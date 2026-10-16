"use client";

import PaginaComAbas from "./Abas";
import EquipesPessoas from "./EquipesPessoas";
import Planejamento from "./Planejamento";
import Quadro from "./quadro/Quadro";

/** Equipes: a composição de cada equipe, o planejamento (início e fim) e a linha do tempo. */
export default function EquipesComAbas() {
  return (
    <PaginaComAbas
      titulo="Equipes"
      subtitulo="Cada equipe com suas posições, o planejamento de início e fim, e a linha do tempo de todas."
      padrao="equipes"
      abas={[
        { id: "equipes", rotulo: "Equipes e posições", dica: "Composição de cada equipe", conteudo: () => <EquipesPessoas /> },
        { id: "planejamento", rotulo: "Planejamento (datas)", dica: "Início e fim de cada equipe, e quem fica livre quando", conteudo: () => <Planejamento /> },
        { id: "linha", rotulo: "Linha do tempo", dica: "Todas as equipes numa linha do tempo", conteudo: () => <Quadro /> },
      ]}
    />
  );
}
