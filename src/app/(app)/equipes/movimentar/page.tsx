import { Suspense } from "react";
import MovimentarEquipe from "@/components/efetivos/MovimentarEquipe";

export default function PaginaMovimentarEquipe({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  return (
    <Suspense fallback={null}>
      <MovimentarEquipe key={JSON.stringify(searchParams)} />
    </Suspense>
  );
}
