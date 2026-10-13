"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import ConsominasLogo from "@/components/ConsominasLogo";
import Facetas from "@/components/efetivos/Facetas";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await signIn("credentials", { email, password, redirect: false });
    setLoading(false);
    if (res?.error) {
      setError(res.error === "CredentialsSignin" ? "E-mail ou senha inválidos." : res.error);
      return;
    }
    router.push("/painel");
    router.refresh();
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <section className="relative hidden overflow-hidden bg-brand-deep lg:block">
        <Facetas className="absolute inset-0 h-full w-full" />
        <div className="relative flex h-full flex-col justify-end p-14 text-white">
          <p className="font-display text-sm font-medium uppercase tracking-[0.2em] text-white/70">Grupo Consominas · MRN</p>
          <h1 className="mt-3 max-w-md font-display text-5xl font-semibold leading-[1.05] tracking-tight">Equipes de campo, sob controle.</h1>
          <p className="mt-4 max-w-md text-base text-white/75">Quem está livre, onde cada equipe e cada veículo está, e o que precisa de reforço — num só quadro.</p>
        </div>
      </section>

      <section className="flex items-center justify-center px-6 py-12">
        <form onSubmit={entrar} className="w-full max-w-sm">
          <ConsominasLogo size={44} />
          <h2 className="mt-8 font-display text-2xl font-semibold tracking-tight">Entrar</h2>
          <p className="mt-1 text-sm text-gray-500">Controle de equipes de afugentamento e resgate.</p>

          <label className="mt-7 block">
            <span className="label">E-mail</span>
            <input type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@consominas.com.br" className="field" autoComplete="username" />
          </label>
          <label className="mt-4 block">
            <span className="label">Senha</span>
            <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="field" autoComplete="current-password" />
          </label>

          {error && (
            <p role="alert" className="mt-4 rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">
              {error}
            </p>
          )}
          <button type="submit" disabled={loading} className="btn-primary mt-6 w-full py-2.5">
            {loading ? "Entrando…" : "Entrar"}
          </button>
        </form>
      </section>
    </div>
  );
}
