import { timingSafeEqual } from "node:crypto";

/** Carga inicial feita pelo desenvolvedor: token longo guardado no ambiente do servidor (nunca no código). */
export function tokenDeCargaValido(req: Request): boolean {
  const esperado = process.env.IMPORT_TOKEN;
  const recebido = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!esperado || esperado.length < 24 || !recebido) return false;
  const a = Buffer.from(esperado);
  const b = Buffer.from(recebido);
  return a.length === b.length && timingSafeEqual(a, b);
}
