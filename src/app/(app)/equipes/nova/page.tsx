import { Suspense } from "react";
import NovaEquipe from "@/components/efetivos/NovaEquipe";

export default function PaginaNovaEquipe() {
  return (
    <Suspense fallback={null}>
      <NovaEquipe />
    </Suspense>
  );
}
