import { Suspense } from "react";
import EquipesComAbas from "@/components/efetivos/EquipesComAbas";

export default function Pagina() {
  return (
    <Suspense fallback={null}>
      <EquipesComAbas />
    </Suspense>
  );
}
