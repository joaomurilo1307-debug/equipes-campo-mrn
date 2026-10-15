"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import ConsominasLogo from "@/components/ConsominasLogo";
import { DadosGate, DadosProvider, useShell } from "@/components/efetivos/DadosContext";
import { DicaProvider } from "@/components/efetivos/quadro/dicas";
import { ModalMinhaSenha } from "@/components/efetivos/AcessosEHistorico";
import { IcBase, IcCarro, IcContrato, IcEquipe, IcFechar, IcFerias, IcHistorico, IcMais, IcOlho, IcPainel, IcQuadro, IcRelatorio, IcSair, IcUsuarios, IcVaga } from "@/components/efetivos/icones";

type Item = { href: string; rotulo: string; icone: (p: { tam?: number }) => JSX.Element; so?: "editor" | "admin" };
type Secao = { titulo: string; itens: Item[] };

// A ordem segue o raciocínio de quem opera: ver o todo, entender a estrutura (contrato -> equipe -> vaga -> pessoa),
// cuidar dos recursos, e por fim os dados (base em Excel, relatórios) e o administrativo.
const SECOES: Secao[] = [
  {
    titulo: "Visão geral",
    itens: [
      { href: "/painel", rotulo: "Painel", icone: IcPainel },
      { href: "/quadro", rotulo: "Quadro de equipes", icone: IcQuadro },
    ],
  },
  {
    titulo: "Estrutura",
    itens: [
      { href: "/contratos", rotulo: "Contratos", icone: IcContrato },
      { href: "/equipes", rotulo: "Equipes", icone: IcEquipe },
      { href: "/vagas", rotulo: "Vagas", icone: IcVaga },
      { href: "/colaboradores", rotulo: "Colaboradores", icone: IcUsuarios },
    ],
  },
  {
    titulo: "Recursos",
    itens: [
      { href: "/frota", rotulo: "Frota", icone: IcCarro },
      { href: "/ferias", rotulo: "Férias e ausências", icone: IcFerias },
    ],
  },
  {
    titulo: "Dados",
    itens: [
      { href: "/base", rotulo: "Base (Excel)", icone: IcBase },
      { href: "/relatorios", rotulo: "Relatórios", icone: IcRelatorio },
      { href: "/historico", rotulo: "Histórico", icone: IcHistorico, so: "editor" },
    ],
  },
  { titulo: "Administração", itens: [{ href: "/usuarios", rotulo: "Acessos", icone: IcUsuarios, so: "admin" }] },
];

function Menu({ aoNavegar }: { aoNavegar?: () => void }) {
  const pathname = usePathname();
  const { data: sessao } = useSession();
  const { nivel, podeEditar, ocultarNomes, setOcultarNomes } = useShell();
  const nome = (sessao?.user as any)?.name ?? "";
  const [trocarSenha, setTrocarSenha] = useState(false);
  const secoes = SECOES.map((s) => ({ ...s, itens: s.itens.filter((i) => !i.so || (i.so === "editor" ? podeEditar : nivel === "ADMIN")) })).filter((s) => s.itens.length > 0);

  return (
    <div className="flex h-full flex-col">
      <div className="px-5 pb-4 pt-6">
        <ConsominasLogo size={34} />
        <div className="mt-3 font-display text-[13px] font-medium uppercase tracking-[0.16em] text-gray-500">Equipes de campo</div>
      </div>

      {podeEditar && (
        <div className="px-3 pb-3">
          <Link href="/equipes/nova" onClick={aoNavegar} className="btn-primary w-full">
            <IcMais tam={16} /> Nova equipe
          </Link>
        </div>
      )}

      <nav className="flex-1 space-y-3 overflow-y-auto px-3 pb-2" aria-label="Principal">
        {secoes.map((s) => (
          <div key={s.titulo}>
            <div className="px-3 pb-1 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-gray-400">{s.titulo}</div>
            <div className="space-y-0.5">
              {s.itens.map((i) => {
                const ativo = pathname?.startsWith(i.href);
                const Icone = i.icone;
                return (
                  <Link key={i.href} href={i.href} onClick={aoNavegar} className={`nav-item ${ativo ? "nav-item-active" : ""}`} aria-current={ativo ? "page" : undefined}>
                    <Icone tam={18} />
                    {i.rotulo}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="space-y-3 border-t border-line px-4 py-4">
        <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13px] text-gray-600 hover:bg-gray-100" title="Esconde os nomes dos profissionais para mostrar a tela ao cliente">
          <input type="checkbox" checked={ocultarNomes} onChange={(e) => setOcultarNomes(e.target.checked)} className="h-4 w-4 accent-[#0A9E7F]" />
          <IcOlho tam={16} />
          Modo apresentação
        </label>
        <div className="flex items-center justify-between gap-2 px-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-ink">{nome || "Usuário"}</div>
            <div className="text-[11px] text-gray-500">
              {nivel === "ADMIN" ? "Administrador" : podeEditar ? "Editor" : "Consulta"} ·{" "}
              <button onClick={() => setTrocarSenha(true)} className="underline hover:text-ink">
                trocar senha
              </button>
            </div>
          </div>
          <button onClick={() => signOut({ callbackUrl: "/login" })} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-accent" aria-label="Sair" title="Sair">
            <IcSair tam={18} />
          </button>
        </div>
      </div>
      {trocarSenha && <ModalMinhaSenha onFechar={() => setTrocarSenha(false)} />}
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [aberto, setAberto] = useState(false);
  return (
    <DadosProvider>
      <div className="min-h-screen lg:pl-64">
        <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-line bg-white lg:block">
          <Menu />
        </aside>

        <header className="no-print sticky top-0 z-30 flex items-center justify-between border-b border-line bg-white/90 px-4 py-2.5 backdrop-blur lg:hidden">
          <ConsominasLogo size={26} />
          <button onClick={() => setAberto(true)} className="btn-ghost btn-sm" aria-label="Abrir menu">
            Menu
          </button>
        </header>
        {aberto && (
          <div className="fixed inset-0 z-50 bg-ink/40 lg:hidden" onMouseDown={(e) => e.target === e.currentTarget && setAberto(false)}>
            <div className="h-full w-72 bg-white shadow-pop">
              <button onClick={() => setAberto(false)} className="absolute right-3 top-3 rounded-lg p-1.5 text-gray-400" aria-label="Fechar menu">
                <IcFechar />
              </button>
              <Menu aoNavegar={() => setAberto(false)} />
            </div>
          </div>
        )}

        <main className="px-6 py-6 sm:px-8">
          <DicaProvider>
            <DadosGate>{children}</DadosGate>
          </DicaProvider>
        </main>
      </div>
    </DadosProvider>
  );
}
