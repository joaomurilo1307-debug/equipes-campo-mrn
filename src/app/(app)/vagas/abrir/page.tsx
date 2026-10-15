import { Suspense } from "react";
import AbrirVagas from "@/components/efetivos/AbrirVagas";

export default function PaginaAbrirVagas({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  return (
    <Suspense fallback={null}>
      <AbrirVagas key={JSON.stringify(searchParams)} />
    </Suspense>
  );
}
