import { Suspense } from "react";
import { redirect } from "next/navigation";
import EquipesComAbas from "@/components/efetivos/EquipesComAbas";

export default function Pagina({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  // a linha do tempo virou uma página própria (menu Consultar)
  if (searchParams.aba === "linha") redirect("/linha-do-tempo");
  return (
    <Suspense fallback={null}>
      <EquipesComAbas />
    </Suspense>
  );
}
