import { Suspense } from "react";
import Pessoas from "@/components/efetivos/Pessoas";

export default function PaginaPessoas() {
  return (
    <Suspense fallback={null}>
      <Pessoas />
    </Suspense>
  );
}
