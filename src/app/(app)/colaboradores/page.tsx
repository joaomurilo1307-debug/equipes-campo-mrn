import { Suspense } from "react";
import Colaboradores from "@/components/efetivos/Colaboradores";

export default function PaginaColaboradores() {
  return (
    <Suspense fallback={null}>
      <Colaboradores />
    </Suspense>
  );
}
