#!/bin/sh
set -e

# Sem --accept-data-loss: uma mudanca de schema que apagaria dados faz o container parar em vez de apagar.
echo "Aplicando schema no banco..."
npx prisma db push --skip-generate

if [ "$RUN_SEED" = "true" ]; then
  echo "Criando acessos iniciais (so os que ainda nao existem)..."
  npx tsx prisma/seed.ts || true
fi

if [ -n "$RESET_SENHA_NOME" ] && [ -n "$RESET_SENHA_HASH_B64" ]; then
  echo "Redefinindo senha de um usuario..."
  npx tsx prisma/reset-senha.ts || true
fi

echo "Iniciando aplicacao..."
exec npx next start -p 3000
