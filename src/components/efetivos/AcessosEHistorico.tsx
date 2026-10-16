"use client";

import { useCallback, useEffect, useState } from "react";
import { chamar } from "./comum";
import { Aviso, CabecalhoPagina, Campo, Modal, RodapeModal } from "./ui";
import { IcMais } from "./icones";
import { CLIENTES_PADRAO } from "@/lib/efetivos/clientes";

/** Os clientes que se pode escolher para um acesso: os padrão e os que já existem nos acessos. */
const opcoesDeCliente = (lista: Usuario[] | null) => [...new Set([...CLIENTES_PADRAO, ...((lista ?? []).map((u) => u.cliente).filter((c): c is string => !!c))])];

// ---------------------------------------------------------------- acessos (só o administrador)

type Usuario = { id: string; name: string; email: string; role: "ADMIN" | "EDITOR" | "VISUALIZADOR"; active: boolean; cliente: string | null; createdAt: string };
const ROTULO_PAPEL: Record<string, string> = { ADMIN: "Administrador", EDITOR: "Editor", VISUALIZADOR: "Somente consulta" };
const DESCRICAO_PAPEL: Record<string, string> = {
  ADMIN: "Vê todos os clientes e faz tudo: movimenta pessoas, equipes e viaturas entre contratos e clientes, importa bases e cria acessos.",
  EDITOR: "Monta e movimenta equipes, lança ausências e mexe em viaturas, só no cliente do acesso (ou em todos, se não houver cliente).",
  VISUALIZADOR: "Só consulta, no cliente do acesso; não vê o motivo das ausências.",
};

export function Acessos() {
  const [lista, setLista] = useState<Usuario[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [novo, setNovo] = useState(false);
  const [senhaDe, setSenhaDe] = useState<Usuario | null>(null);

  const carregar = useCallback(async () => {
    const r = await chamar<{ usuarios: Usuario[] }>("GET", "/api/usuarios");
    if (!r.ok) return setErro(r.dados.error ?? "Não foi possível carregar os acessos");
    setLista(r.dados.usuarios);
  }, []);
  useEffect(() => {
    carregar();
  }, [carregar]);

  async function alterar(u: Usuario, corpo: Record<string, unknown>) {
    setErro(null);
    const r = await chamar("PATCH", `/api/usuarios/${u.id}`, corpo);
    if (!r.ok) return setErro(r.dados.error ?? "Não foi possível alterar");
    await carregar();
  }

  return (
    <div>
      <CabecalhoPagina
        titulo="Acessos"
        subtitulo="Quem entra no sistema. Cada pessoa tem o seu usuário e a sua senha; o acesso pode ficar restrito a um cliente (MRN, AGA)."
        acoes={
          <button onClick={() => setNovo(true)} className="btn-primary">
            <IcMais tam={16} /> Novo acesso
          </button>
        }
      />
      <div className="card mb-5 grid gap-4 p-5 sm:grid-cols-3">
        {Object.keys(ROTULO_PAPEL).map((p) => (
          <div key={p}>
            <div className="font-display text-sm font-semibold">{ROTULO_PAPEL[p]}</div>
            <p className="mt-0.5 text-xs text-gray-500">{DESCRICAO_PAPEL[p]}</p>
          </div>
        ))}
      </div>
      {erro && <div className="mb-4"><Aviso tipo="erro">{erro}</Aviso></div>}
      <div className="card overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr>
              <th>Nome</th>
              <th>E-mail</th>
              <th>Papel</th>
              <th>Cliente</th>
              <th>Situação</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(lista ?? []).map((u) => (
              <tr key={u.id}>
                <td className="font-semibold">{u.name}</td>
                <td className="text-gray-600">{u.email}</td>
                <td>
                  <select value={u.role} onChange={(e) => alterar(u, { role: e.target.value })} className="rounded-md border border-line bg-white px-2 py-1 text-sm">
                    {Object.entries(ROTULO_PAPEL).map(([k, r]) => (
                      <option key={k} value={k}>
                        {r}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  {u.role === "ADMIN" ? (
                    <span className="text-[12px] text-gray-500">todos os clientes</span>
                  ) : (
                    <select value={u.cliente ?? ""} onChange={(e) => alterar(u, { cliente: e.target.value || null })} className="rounded-md border border-line bg-white px-2 py-1 text-sm" title="Cliente a que este acesso fica restrito">
                      <option value="">Todos os clientes</option>
                      {opcoesDeCliente(lista).map((c) => (
                        <option key={c} value={c}>
                          só {c}
                        </option>
                      ))}
                    </select>
                  )}
                </td>
                <td>{u.active ? <span className="chip-ok">Ativo</span> : <span className="chip-mute">Desativado</span>}</td>
                <td className="whitespace-nowrap text-right">
                  <button onClick={() => setSenhaDe(u)} className="btn-ghost btn-sm">
                    Redefinir senha
                  </button>
                  <button onClick={() => alterar(u, { active: !u.active })} className="btn-ghost btn-sm ml-1">
                    {u.active ? "Desativar" : "Reativar"}
                  </button>
                </td>
              </tr>
            ))}
            {!lista && !erro && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-gray-400">
                  Carregando…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {novo && <ModalNovoAcesso clientes={opcoesDeCliente(lista)} onFechar={() => setNovo(false)} onSalvo={() => { setNovo(false); carregar(); }} />}
      {senhaDe && <ModalSenha usuario={senhaDe} onFechar={() => setSenhaDe(null)} />}
    </div>
  );
}

function ModalNovoAcesso({ clientes, onFechar, onSalvo }: { clientes: string[]; onFechar: () => void; onSalvo: () => void }) {
  const [f, setF] = useState({ name: "", email: "", password: "", role: "EDITOR", cliente: "" });
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  async function salvar() {
    setSalvando(true);
    setErro(null);
    const r = await chamar("POST", "/api/usuarios", { ...f, cliente: f.role === "ADMIN" ? null : f.cliente || null });
    setSalvando(false);
    if (!r.ok) return setErro(r.dados.error ?? "Não foi possível criar");
    onSalvo();
  }
  return (
    <Modal titulo="Novo acesso" subtitulo="A pessoa entra com este e-mail e esta senha e pode trocá-la depois." onFechar={onFechar}>
      <div className="grid gap-4 px-6 py-5 sm:grid-cols-2">
        <Campo rotulo="Nome">
          <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className="field" autoFocus />
        </Campo>
        <Campo rotulo="E-mail">
          <input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} className="field" />
        </Campo>
        <Campo rotulo="Senha inicial" dica="Mínimo de 8 caracteres.">
          <input type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} className="field" autoComplete="new-password" />
        </Campo>
        <Campo rotulo="Papel">
          <select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} className="field">
            {Object.entries(ROTULO_PAPEL).map(([k, r]) => (
              <option key={k} value={k}>
                {r}
              </option>
            ))}
          </select>
        </Campo>
        {f.role !== "ADMIN" && (
          <Campo rotulo="Cliente" dica="O usuário só vê e mexe nos dados deste cliente. Ex.: o Samuel, só MRN.">
            <select value={f.cliente} onChange={(e) => setF({ ...f, cliente: e.target.value })} className="field">
              <option value="">Todos os clientes</option>
              {clientes.map((c) => (
                <option key={c} value={c}>
                  só {c}
                </option>
              ))}
            </select>
          </Campo>
        )}
      </div>
      {erro && <div className="px-6 pb-4"><Aviso tipo="erro">{erro}</Aviso></div>}
      <RodapeModal>
        <button onClick={onFechar} className="btn-ghost">Cancelar</button>
        <button onClick={salvar} disabled={salvando || !f.name.trim() || !f.email.trim() || f.password.length < 8} className="btn-primary">
          {salvando ? "Criando…" : "Criar acesso"}
        </button>
      </RodapeModal>
    </Modal>
  );
}

function ModalSenha({ usuario, onFechar }: { usuario: Usuario; onFechar: () => void }) {
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  async function salvar() {
    setErro(null);
    const r = await chamar("PATCH", `/api/usuarios/${usuario.id}`, { password: senha });
    if (!r.ok) return setErro(r.dados.error ?? "Não foi possível redefinir");
    setOk(true);
  }
  return (
    <Modal titulo={`Redefinir senha — ${usuario.name}`} onFechar={onFechar}>
      <div className="space-y-3 px-6 py-5">
        <Campo rotulo="Nova senha" dica="Mínimo de 8 caracteres. Combine com a pessoa por um canal seguro.">
          <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} className="field" autoFocus autoComplete="new-password" />
        </Campo>
        {ok && <Aviso tipo="ok">Senha redefinida.</Aviso>}
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
      </div>
      <RodapeModal>
        <button onClick={onFechar} className="btn-ghost">{ok ? "Fechar" : "Cancelar"}</button>
        {!ok && (
          <button onClick={salvar} disabled={senha.length < 8} className="btn-primary">
            Redefinir
          </button>
        )}
      </RodapeModal>
    </Modal>
  );
}

// ---------------------------------------------------------------- histórico

type Registro = { id: string; em: string; por: string; acao: string; resumo: string };

export function Historico() {
  const [lista, setLista] = useState<Registro[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  useEffect(() => {
    chamar<{ historico: Registro[] }>("GET", "/api/efetivos/historico").then((r) => {
      if (!r.ok) return setErro(r.dados.error ?? "Não foi possível carregar o histórico");
      setLista(r.dados.historico);
    });
  }, []);
  const t = busca.trim().toLowerCase();
  const visiveis = (lista ?? []).filter((x) => !t || `${x.resumo} ${x.por} ${x.acao}`.toLowerCase().includes(t));
  return (
    <div>
      <CabecalhoPagina titulo="Histórico" subtitulo="Quem escalou, moveu, lançou ausência ou importou — as últimas 400 alterações." />
      <div className="card mb-4 p-4">
        <label className="block max-w-md">
          <span className="label">Buscar no histórico</span>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="equipe, nome, veículo…" className="field" />
        </label>
      </div>
      {erro && <div className="mb-4"><Aviso tipo="erro">{erro}</Aviso></div>}
      <div className="card overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr>
              <th>Quando</th>
              <th>Quem</th>
              <th>O quê</th>
            </tr>
          </thead>
          <tbody>
            {visiveis.map((x) => (
              <tr key={x.id} className="align-top">
                <td className="whitespace-nowrap text-gray-500">{new Date(x.em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</td>
                <td className="whitespace-nowrap font-medium">{x.por}</td>
                <td>{x.resumo}</td>
              </tr>
            ))}
            {lista && visiveis.length === 0 && (
              <tr>
                <td colSpan={3} className="py-10 text-center text-gray-400">
                  Nenhum registro.
                </td>
              </tr>
            )}
            {!lista && !erro && (
              <tr>
                <td colSpan={3} className="py-10 text-center text-gray-400">
                  Carregando…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- cada pessoa troca a própria senha

export function ModalMinhaSenha({ onFechar }: { onFechar: () => void }) {
  const [f, setF] = useState({ atual: "", nova: "", repetir: "" });
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [salvando, setSalvando] = useState(false);
  async function salvar() {
    setErro(null);
    if (f.nova !== f.repetir) return setErro("As duas senhas novas não são iguais.");
    setSalvando(true);
    const r = await chamar("POST", "/api/minha-senha", { atual: f.atual, nova: f.nova });
    setSalvando(false);
    if (!r.ok) return setErro(r.dados.error ?? "Não foi possível trocar a senha");
    setOk(true);
  }
  return (
    <Modal titulo="Trocar minha senha" onFechar={onFechar}>
      <div className="space-y-4 px-6 py-5">
        <Campo rotulo="Senha atual">
          <input type="password" value={f.atual} onChange={(e) => setF({ ...f, atual: e.target.value })} className="field" autoFocus autoComplete="current-password" />
        </Campo>
        <Campo rotulo="Nova senha" dica="Mínimo de 8 caracteres.">
          <input type="password" value={f.nova} onChange={(e) => setF({ ...f, nova: e.target.value })} className="field" autoComplete="new-password" />
        </Campo>
        <Campo rotulo="Repita a nova senha">
          <input type="password" value={f.repetir} onChange={(e) => setF({ ...f, repetir: e.target.value })} className="field" autoComplete="new-password" />
        </Campo>
        {ok && <Aviso tipo="ok">Senha trocada. Use a nova no próximo acesso.</Aviso>}
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
      </div>
      <RodapeModal>
        <button onClick={onFechar} className="btn-ghost">{ok ? "Fechar" : "Cancelar"}</button>
        {!ok && (
          <button onClick={salvar} disabled={salvando || !f.atual || f.nova.length < 8} className="btn-primary">
            {salvando ? "Salvando…" : "Trocar senha"}
          </button>
        )}
      </RodapeModal>
    </Modal>
  );
}
