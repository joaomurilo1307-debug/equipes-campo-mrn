import { Suspense } from "react";
import Base from "@/components/efetivos/Base";

// A chave refaz a tela quando o link muda (os números do Painel abrem a Base já filtrada).
export default function PaginaBase({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  return (
    <Suspense fallback={null}>
      <Base key={JSON.stringify(searchParams)} />
    </Suspense>
  );
}
