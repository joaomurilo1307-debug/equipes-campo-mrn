import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

// Tudo fora do login e da API de autenticação exige sessão. Em desenvolvimento, com
// DEV_MOCK_XLSX definido, a checagem é dispensada só para conferir o visual com dados de exemplo.
const modoMock = process.env.NODE_ENV !== "production" && !!process.env.DEV_MOCK_XLSX;

export default modoMock
  ? () => NextResponse.next()
  : withAuth({ pages: { signIn: "/login" } });

export const config = {
  matcher: ["/painel/:path*", "/consulta/:path*", "/linha-do-tempo/:path*", "/histograma/:path*", "/pessoas/:path*", "/vagas/:path*", "/base/:path*", "/relatorios/:path*", "/quadro/:path*", "/campanhas/:path*", "/equipes/:path*", "/ferias/:path*", "/contratos/:path*", "/frota/:path*", "/historico/:path*", "/usuarios/:path*"],
};
