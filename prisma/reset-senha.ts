import { PrismaClient } from "@prisma/client";

// Uso unico (docker-entrypoint): define a senha de UM usuario a partir de um hash bcrypt vindo do ambiente (a senha em texto nunca fica no ambiente).
//   RESET_SENHA_NOME  -> parte do nome do usuario (precisa achar exatamente 1 usuario ativo)
//   RESET_SENHA_HASH_B64 -> hash bcrypt da nova senha, em base64 (o hash tem '$', que o docker compose interpretaria como variavel)
// Mostra no log quem foi alterado (nome, e-mail de login, papel, cliente). Depois de usar, remover as duas variaveis do ambiente.
const prisma = new PrismaClient();

async function main() {
  const nome = process.env.RESET_SENHA_NOME?.trim();
  const b64 = process.env.RESET_SENHA_HASH_B64?.trim();
  const hash = b64 ? Buffer.from(b64, "base64").toString("utf-8") : undefined;
  if (!nome || !hash) return;
  if (!/^\$2[aby]\$\d{2}\$.{53}$/.test(hash)) throw new Error("RESET_SENHA_HASH_B64 não parece um hash bcrypt. Nada foi alterado.");
  const achados = await prisma.user.findMany({ where: { active: true, name: { contains: nome, mode: "insensitive" } }, select: { id: true, name: true, email: true, role: true, cliente: true } });
  console.log(`Reset de senha: ${achados.length} usuário(s) ativo(s) com "${nome}":`, achados.map((u) => `${u.name} <${u.email}> ${u.role} cliente=${u.cliente ?? "todos"}`).join(" | "));
  if (achados.length !== 1) throw new Error("Esperava exatamente 1 usuário. Nada foi alterado.");
  await prisma.user.update({ where: { id: achados[0].id }, data: { passwordHash: hash } });
  console.log(`Senha redefinida: ${achados[0].name} <${achados[0].email}>`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(0); // nao derruba o container
  })
  .finally(() => prisma.$disconnect());
