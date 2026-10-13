import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, Outfit } from "next/font/google";
import "./globals.css";
import Providers from "./providers";

// Outfit lembra a geometria do logotipo (títulos e números); Plex Sans dá o tom técnico da engenharia.
const display = Outfit({ subsets: ["latin"], variable: "--font-display", display: "swap" });
const body = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-body", display: "swap" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  title: "Equipes de Campo | Grupo Consominas",
  description: "Controle de equipes, campanhas e veículos de afugentamento e resgate.",
};

export const viewport: Viewport = {
  themeColor: "#0A9E7F",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
