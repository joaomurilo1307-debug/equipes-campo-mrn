import { Suspense } from "react";
import Consulta from "@/components/efetivos/Consulta";

export default function PaginaConsulta() {
  return (
    <Suspense fallback={null}>
      <Consulta />
    </Suspense>
  );
}
