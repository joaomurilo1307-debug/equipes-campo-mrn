import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

// Cria os acessos iniciais (so quando ainda nao existem). A senha vem do ambiente e nunca fica no codigo.
//   SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD / SEED_ADMIN_NAME      -> administrador (Joao)
//   SEED_EDITOR_EMAIL / SEED_EDITOR_PASSWORD / SEED_EDITOR_NAME   -> editor (Samuel), opcional
const prisma = new PrismaClient();

async function criar(email: string | undefined, password: string | undefined, name: string, role: "ADMIN" | "EDITOR") {
  if (!email || !password) return;
  const e = email.trim().toLowerCase();
  if (await prisma.user.findUnique({ where: { email: e } })) {
    console.log("Usuário já existe:", e);
    return;
  }
  await prisma.user.create({ data: { name, email: e, passwordHash: await bcrypt.hash(password, 10), role } });
  console.log(`Usuário ${role} criado:`, e);
}

async function main() {
  await criar(process.env.SEED_ADMIN_EMAIL, process.env.SEED_ADMIN_PASSWORD, process.env.SEED_ADMIN_NAME || "Administrador", "ADMIN");
  await criar(process.env.SEED_EDITOR_EMAIL, process.env.SEED_EDITOR_PASSWORD, process.env.SEED_EDITOR_NAME || "Samuel", "EDITOR");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
