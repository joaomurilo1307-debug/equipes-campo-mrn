import { Suspense } from "react";
import Histograma from "@/components/efetivos/Histograma";

export default function Pagina() {
  return (
    <Suspense fallback={null}>
      <Histograma />
    </Suspense>
  );
}
