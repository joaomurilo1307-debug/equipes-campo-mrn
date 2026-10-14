import { Suspense } from "react";
import MontarCampanha from "@/components/efetivos/MontarCampanha";

// A chave refaz a tela quando o link muda (editar outra campanha, começar uma nova).
export default function PaginaMontar({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  return (
    <Suspense fallback={null}>
      <MontarCampanha key={JSON.stringify(searchParams)} />
    </Suspense>
  );
}
