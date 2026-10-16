import { redirect } from "next/navigation";

// A tela virou a página "Linha do tempo": o link antigo continua funcionando.
export default function Pagina() {
  redirect("/linha-do-tempo");
}
