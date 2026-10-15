import { Suspense } from "react";
import Vagas from "@/components/efetivos/Vagas";

export default function PaginaVagas({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  return (
    <Suspense fallback={null}>
      <Vagas key={JSON.stringify(searchParams)} />
    </Suspense>
  );
}
