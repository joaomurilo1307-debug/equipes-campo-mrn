import { Suspense } from "react";
import LinhaDoTempo from "@/components/efetivos/LinhaDoTempo";

export default function Pagina() {
  return (
    <Suspense fallback={null}>
      <LinhaDoTempo />
    </Suspense>
  );
}
