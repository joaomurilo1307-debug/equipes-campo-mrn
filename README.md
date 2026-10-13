# Equipes de Campo — Grupo Consominas

Sistema do Samuel (MRN) para controlar equipes de afugentamento e resgate: quem está livre, onde cada equipe e cada veículo está, campanhas, capacidade x demanda e vagas abertas.

- **Quadro**: Gantt por contrato; arraste sobre a equipe para criar campanha, sobre uma pessoa para lançar ausência, sobre um veículo para movê-lo.
- **Painel**: status das equipes, resumo por grupo, agora e depois, capacidade x demanda, vagas por cargo, frota por contrato.
- Next.js 14 + Prisma/Postgres + NextAuth. Regras de disponibilidade em `src/lib/efetivos` (puras, com testes em `tests/`).
- Não há dados de pessoas neste repositório: a planilha entra pela tela "Equipes e pessoas" (carga inicial; nunca sobrescreve).

Desenvolvimento sem banco: `DEV_MOCK_XLSX=<planilha.xlsx> npm run dev` abre a tela com dados da planilha (somente leitura, só para conferir o visual).
