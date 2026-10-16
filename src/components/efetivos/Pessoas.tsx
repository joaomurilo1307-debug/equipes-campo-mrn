"use client";

import PaginaComAbas from "./Abas";
import Colaboradores from "./Colaboradores";
import Ferias from "./Ferias";
import Vagas from "./Vagas";

/** Pessoas: o cadastro geral (de todos os clientes que o usuário vê), as vagas a preencher e as férias e ausências. */
export default function Pessoas() {
  return (
    <PaginaComAbas
      titulo="Pessoas"
      subtitulo="Cadastro geral de quem trabalha nas equipes: status, onde está, mover de equipe, contrato ou cliente."
      padrao="cadastro"
      abas={[
        { id: "cadastro", rotulo: "Cadastro geral", dica: "Todas as pessoas, com status e equipe", conteudo: () => <Colaboradores /> },
        { id: "vagas", rotulo: "Vagas abertas", dica: "Posições sem pessoa, para contratar ou preencher", conteudo: () => <Vagas /> },
        { id: "ferias", rotulo: "Férias e ausências", dica: "Quem está fora e por quanto tempo", conteudo: () => <Ferias /> },
      ]}
    />
  );
}
