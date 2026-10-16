import { redirect } from "next/navigation";

// A tela agora é uma aba de /equipes: o link antigo continua funcionando.
export default function Pagina({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(searchParams)) if (typeof v === "string" && k !== "aba") q.set(k, v);
  q.set("aba", "planejamento");
  redirect(`/equipes?${q}`);
}
