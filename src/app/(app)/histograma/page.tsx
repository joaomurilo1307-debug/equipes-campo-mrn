import { Suspense } from "react";
import HistogramaComAbas from "@/components/efetivos/HistogramaComAbas";

export default function Pagina() {
  return (
    <Suspense fallback={null}>
      <HistogramaComAbas />
    </Suspense>
  );
}
