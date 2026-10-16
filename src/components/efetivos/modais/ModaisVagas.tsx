"use client";

// Controle de vagas da equipe: abrir vagas, desmobilizar (a vaga fica aberta) e puxar um colaborador do cadastro.
import { clienteDaEquipe } from "@/lib/efetivos/clientes";
import { useMemo, useState } from "react";
import { temNome } from "@/lib/efetivos/disponibilidade";
import { useDados } from "../DadosContext";
import { chamar, fmtDia, rotuloContrato, valoresUsados, type Equipe, type Vaga } from "../comum";
import { Aviso, Campo, Modal, RodapeModal } from "../ui";

const ATIVIDADES_VAGA = ["Resgate", "Afugentamento", "Apoio"];

// ---------------------------------------------------------------- abrir vagas

/** Aumenta a equipe: abre uma ou várias vagas iguais (função, empresa, atividade). */
export function ModalAbrirVaga({ equipe, onFechar }: { equipe: Equipe; onFechar: () => void }) {
  const { dados, recarregar } = useDados();
  const cargos = valoresUsados(dados.vagas, "cargo");
  const empresas = valoresUsados(dados.vagas, "empresa");
  const [v, setV] = useState({ cargo: "", empresa: empresas[0] ?? "Consominas", atividade: "Resgate", nivel: "", direcao4x4: "", quantidade: 1 });
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const set = (k: keyof typeof v, valor: string | number) => setV((x) => ({ ...x, [k]: valor }));

  async function salvar() {
    setSalvando(true);
    setErro(null);
    const r = await chamar("POST", "/api/efetivos/vagas", {
      equipeId: equipe.id,
      nome: null,
      cargo: v.cargo,
      empresa: v.empresa,
      atividade: v.atividade,
      nivel: v.nivel || null,
      direcao4x4: v.direcao4x4 === "" ? null : v.direcao4x4 === "sim",
      quantidade: v.quantidade,
      contrato: equipe.projeto !== "A definir" ? equipe.projeto : null,
      equipeContrato: equipe.nome,
    });
    setSalvando(false);
    if (!r.ok) return setErro(r.dados.error ?? "Não foi possível abrir a vaga");
    await recarregar();
    onFechar();
  }

  const invalido = !v.cargo.trim() || !v.empresa.trim() || v.quantidade < 1;
  return (
    <Modal titulo="Abrir vaga" subtitulo={`${equipe.nome} — a vaga fica aberta até alguém ser puxado do cadastro ou cadastrado.`} onFechar={onFechar}>
      <div className="grid gap-3 px-5 py-4 sm:grid-cols-2">
        <Campo rotulo="Função" className="sm:col-span-2">
          <input list="vg-cargos" value={v.cargo} onChange={(e) => set("cargo", e.target.value)} className="field" placeholder="ex.: Auxiliar de campo / Mateiro" />
          <datalist id="vg-cargos">
            {cargos.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Campo>
        <Campo rotulo="Empresa">
          <input list="vg-empresas" value={v.empresa} onChange={(e) => set("empresa", e.target.value)} className="field" />
          <datalist id="vg-empresas">
            {empresas.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Campo>
        <Campo rotulo="Atividade">
          <select value={v.atividade} onChange={(e) => set("atividade", e.target.value)} className="field">
            {ATIVIDADES_VAGA.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Nível">
          <select value={v.nivel} onChange={(e) => set("nivel", e.target.value)} className="field">
            <option value="">—</option>
            <option>Superior</option>
            <option>Técnico</option>
            <option>NA</option>
          </select>
        </Campo>
        <Campo rotulo="Dirige 4x4?">
          <select value={v.direcao4x4} onChange={(e) => set("direcao4x4", e.target.value)} className="field">
            <option value="">—</option>
            <option value="sim">Sim</option>
            <option value="nao">Não</option>
          </select>
        </Campo>
        <Campo rotulo="Quantas vagas" dica="Abre todas de uma vez, iguais." className="sm:col-span-2">
          <input type="number" min={1} max={50} value={v.quantidade} onChange={(e) => set("quantidade", Math.max(1, Number(e.target.value) || 1))} className="field !w-28" />
        </Campo>
      </div>
      {erro && (
        <div className="px-5 pb-3">
          <Aviso tipo="erro">{erro}</Aviso>
        </div>
      )}
      <RodapeModal>
        <button onClick={onFechar} className="btn-ghost">
          Cancelar
        </button>
        <button onClick={salvar} disabled={salvando || invalido} className="btn-primary">
          {salvando ? "Abrindo…" : `Abrir ${v.quantidade} vaga${v.quantidade === 1 ? "" : "s"}`}
        </button>
      </RodapeModal>
    </Modal>
  );
}

// ---------------------------------------------------------------- desmobilizar

/** A pessoa sai da equipe; a vaga dela pode ficar aberta e ela segue no cadastro (disponível) ou é desmobilizada. */
export function ModalDesmobilizar({ vaga, onFechar }: { vaga: Vaga; onFechar: () => void }) {
  const { equipePorId, hoje, recarregar, nomeDe } = useDados();
  const equipe = equipePorId.get(vaga.equipeId);
  const [destino, setDestino] = useState<"reserva" | "desligado">("reserva");
  const [abrirVaga, setAbrirVaga] = useState(true);
  const [data, setData] = useState(hoje);
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    setSalvando(true);
    setErro(null);
    const r = await chamar("POST", `/api/efetivos/vagas/${vaga.id}/desmobilizar`, { destino, abrirVaga, data, motivo: motivo || null });
    setSalvando(false);
    if (!r.ok) return setErro(r.dados.error ?? "Não foi possível desmobilizar");
    await recarregar();
    onFechar();
  }

  return (
    <Modal titulo="Desmobilizar da equipe" subtitulo={`${nomeDe(vaga)} · ${vaga.cargo}${equipe ? ` · ${equipe.nome}` : ""}`} onFechar={onFechar}>
      <div className="space-y-3 px-5 py-4">
        <fieldset className="space-y-1.5">
          <legend className="label mb-1">O que acontece com a pessoa</legend>
          <label className={`flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2 text-sm ${destino === "reserva" ? "border-brand bg-brand-soft" : "border-line"}`}>
            <input type="radio" name="destino" checked={destino === "reserva"} onChange={() => setDestino("reserva")} className="mt-1 accent-[#0A9E7F]" />
            <span>
              <strong className="block text-ink">Fica disponível</strong>
              <span className="text-xs text-gray-600">Sai da equipe, continua no cadastro de colaboradores e pode ser puxada para outra equipe.</span>
            </span>
          </label>
          <label className={`flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2 text-sm ${destino === "desligado" ? "border-brand bg-brand-soft" : "border-line"}`}>
            <input type="radio" name="destino" checked={destino === "desligado"} onChange={() => setDestino("desligado")} className="mt-1 accent-[#0A9E7F]" />
            <span>
              <strong className="block text-ink">Desmobilizada</strong>
              <span className="text-xs text-gray-600">Sai do contrato. O registro fica no cadastro com status “Desmobilizado”, para o histórico.</span>
            </span>
          </label>
        </fieldset>
        <label className="flex cursor-pointer items-start gap-2.5 rounded-lg bg-gray-50 px-3 py-2 text-sm">
          <input type="checkbox" checked={abrirVaga} onChange={(e) => setAbrirVaga(e.target.checked)} className="mt-1 accent-[#0A9E7F]" />
          <span>
            <strong className="block text-ink">Abrir a vaga dela na equipe</strong>
            <span className="text-xs text-gray-600">Fica uma vaga aberta de {vaga.cargo} ({vaga.empresa}) no lugar, para contratar ou puxar alguém.</span>
          </span>
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo rotulo="Data da saída">
            <input type="date" value={data} onChange={(e) => e.target.value && setData(e.target.value)} className="field" />
          </Campo>
          <Campo rotulo="Motivo (opcional)">
            <input value={motivo} onChange={(e) => setMotivo(e.target.value)} className="field" placeholder="ex.: fim do contrato, mudança de equipe" />
          </Campo>
        </div>
      </div>
      {erro && (
        <div className="px-5 pb-3">
          <Aviso tipo="erro">{erro}</Aviso>
        </div>
      )}
      <RodapeModal>
        <button onClick={onFechar} className="btn-ghost">
          Cancelar
        </button>
        <button onClick={salvar} disabled={salvando} className="btn-primary">
          {salvando ? "Salvando…" : "Desmobilizar"}
        </button>
      </RodapeModal>
    </Modal>
  );
}

// ---------------------------------------------------------------- puxar colaborador

/** Puxa um colaborador já cadastrado para a equipe, ocupando uma vaga (ou criando a posição). */
export function ModalPuxar({ equipe, vagaPreSelecionada, onFechar }: { equipe: Equipe; vagaPreSelecionada?: Vaga | null; onFechar: () => void }) {
  const { dados, hoje, recarregar, equipePorId, vagasPorEquipe, nomeDe } = useDados();
  const [busca, setBusca] = useState("");
  const [onde, setOnde] = useState<"todos" | "reserva" | "equipes">("todos");
  const [sel, setSel] = useState<string | null>(null);
  const [lugar, setLugar] = useState<string>(vagaPreSelecionada?.id ?? "nova");
  const [abrirNaOrigem, setAbrirNaOrigem] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const lugares = useMemo(() => (vagasPorEquipe.get(equipe.id) ?? []).filter((v) => !temNome(v)), [vagasPorEquipe, equipe.id]);
  const candidatos = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return dados.vagas
      .filter((v) => temNome(v) && v.equipeId !== equipe.id && v.status !== "Desmobilizado")
      .filter((v) => {
        const eq = equipePorId.get(v.equipeId);
        const naReserva = eq?.grupo === "Apoio";
        return onde === "todos" || (onde === "reserva" ? naReserva : !naReserva);
      })
      .filter((v) => !t || `${v.nome} ${v.cargo} ${v.empresa} ${v.contrato ?? ""}`.toLowerCase().includes(t))
      .sort((a, b) => (a.nome ?? "").localeCompare(b.nome ?? "", "pt-BR"))
      .slice(0, 120);
  }, [dados.vagas, equipe.id, equipePorId, busca, onde]);
  const escolhido = sel ? dados.vagas.find((v) => v.id === sel) : null;
  const veioDeEquipe = escolhido ? equipePorId.get(escolhido.equipeId)?.grupo !== "Apoio" : false;

  async function salvar() {
    if (!sel) return;
    setSalvando(true);
    setErro(null);
    const r = await chamar("POST", `/api/efetivos/vagas/${sel}/mover`, { equipeId: equipe.id, vagaDestinoId: lugar === "nova" ? null : lugar, abrirVagaNaOrigem: abrirNaOrigem });
    setSalvando(false);
    if (!r.ok) return setErro(r.dados.error ?? "Não foi possível puxar o colaborador");
    await recarregar();
    onFechar();
  }

  return (
    <Modal titulo="Puxar colaborador" subtitulo={`Para ${equipe.nome}. Escolha entre os colaboradores cadastrados.`} onFechar={onFechar} largo>
      <div className="grid gap-4 px-5 py-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome, função, empresa ou contrato…" className="field !mt-0 min-w-[200px] flex-1" autoFocus />
            <select value={onde} onChange={(e) => setOnde(e.target.value as typeof onde)} className="field !mt-0 !w-auto">
              <option value="todos">Todos</option>
              <option value="reserva">Disponíveis (sem equipe)</option>
              <option value="equipes">Em outras equipes</option>
            </select>
          </div>
          <ul className="max-h-[48vh] divide-y divide-line overflow-y-auto rounded-xl border border-line">
            {candidatos.map((v) => {
              const eq = equipePorId.get(v.equipeId);
              const ativo = sel === v.id;
              return (
                <li key={v.id}>
                  <button onClick={() => setSel(v.id)} className={`flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-[13px] ${ativo ? "bg-brand-soft" : "hover:bg-gray-50"}`}>
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-ink">{nomeDe(v)}</span>
                      <span className="block truncate text-[11px] text-gray-500">
                        {v.cargo} · {v.empresa}
                      </span>
                    </span>
                    <span className="shrink-0 text-right text-[11px] text-gray-500">
                      {eq?.grupo === "Apoio" ? <span className="chip-ok">disponível</span> : eq?.nome}
                      {v.contrato && <span className="block">{rotuloContrato(v.contrato)}</span>}
                    </span>
                  </button>
                </li>
              );
            })}
            {candidatos.length === 0 && <li className="px-4 py-8 text-center text-sm text-gray-400">Ninguém encontrado.</li>}
          </ul>
        </div>

        <div className="space-y-3">
          <div className="rounded-xl border border-line bg-gray-50 p-3 text-sm">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Colaborador</div>
            {escolhido ? (
              <>
                <div className="mt-0.5 font-medium text-ink">{nomeDe(escolhido)}</div>
                <div className="text-xs text-gray-500">
                  {escolhido.cargo} · {escolhido.empresa}
                </div>
              </>
            ) : (
              <p className="mt-0.5 text-xs text-gray-400">Escolha na lista ao lado.</p>
            )}
          </div>
          <Campo rotulo="Vai ocupar">
            <select value={lugar} onChange={(e) => setLugar(e.target.value)} className="field">
              <option value="nova">Uma posição nova na equipe</option>
              {lugares.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.semNome ? "Posição sem nome" : "Vaga aberta"} · {v.cargo} ({v.empresa}, {v.atividade})
                </option>
              ))}
            </select>
          </Campo>
          {veioDeEquipe && (
            <label className="flex cursor-pointer items-start gap-2 text-xs text-gray-600">
              <input type="checkbox" checked={abrirNaOrigem} onChange={(e) => setAbrirNaOrigem(e.target.checked)} className="mt-0.5 accent-[#0A9E7F]" />
              <span>
                Abrir uma vaga na equipe de onde ele sai ({equipePorId.get(escolhido!.equipeId)?.nome})
              </span>
            </label>
          )}
          {escolhido?.disponivelAPartir && escolhido.disponivelAPartir > hoje && <p className="text-[11px] text-info">{escolhido.contratoAtual ? `Em ${escolhido.contratoAtual}, ` : ""}livre a partir de {fmtDia(escolhido.disponivelAPartir)}.</p>}
        </div>
      </div>
      {erro && (
        <div className="px-5 pb-3">
          <Aviso tipo="erro">{erro}</Aviso>
        </div>
      )}
      <RodapeModal>
        <button onClick={onFechar} className="btn-ghost">
          Cancelar
        </button>
        <button onClick={salvar} disabled={salvando || !sel} className="btn-primary">
          {salvando ? "Puxando…" : "Puxar para a equipe"}
        </button>
      </RodapeModal>
    </Modal>
  );
}

// ---------------------------------------------------------------- colocar um colaborador numa equipe

/** O mesmo movimento visto do colaborador: escolhe a equipe e a vaga que ele vai ocupar. */
export function ModalColocarEmEquipe({ vaga, onFechar }: { vaga: Vaga; onFechar: () => void }) {
  const { completos, recarregar, equipePorId, nomeDe } = useDados();
  const atual = equipePorId.get(vaga.equipeId);
  const veioDeEquipe = !!atual && atual.grupo !== "Apoio";
  // as equipes de destino vêm de tudo o que o usuário vê (não só do cliente escolhido na tela): a administração move entre clientes
  const equipes = useMemo(() => completos.equipes.filter((e) => e.grupo !== "Apoio" && e.id !== vaga.equipeId && e.status !== "Inativa"), [completos.equipes, vaga.equipeId]);
  const clienteDe = (e: { projeto: string; cliente: string | null }) => clienteDaEquipe(e, completos.contratos) ?? "";
  // um grupo por (cliente, contrato)
  const contratos = useMemo(
    () =>
      [...new Set(equipes.map((e) => `${clienteDaEquipe(e, completos.contratos) ?? ""}\u0000${e.projeto}`))].sort((a, b) => {
        const [ca, pa] = a.split("\u0000");
        const [cb, pb] = b.split("\u0000");
        return ca.localeCompare(cb, "pt-BR") || (pa === "A definir" ? 1 : pb === "A definir" ? -1 : pa.localeCompare(pb, "pt-BR", { numeric: true }));
      }),
    [equipes, completos.contratos]
  );
  const [equipeId, setEquipeId] = useState("");
  const [lugar, setLugar] = useState("nova");
  const [abrirNaOrigem, setAbrirNaOrigem] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const lugares = useMemo(() => (equipeId ? completos.vagas.filter((v) => v.equipeId === equipeId && !temNome(v)) : []), [completos.vagas, equipeId]);

  async function salvar() {
    setSalvando(true);
    setErro(null);
    const r = await chamar("POST", `/api/efetivos/vagas/${vaga.id}/mover`, { equipeId, vagaDestinoId: lugar === "nova" ? null : lugar, abrirVagaNaOrigem: abrirNaOrigem });
    setSalvando(false);
    if (!r.ok) return setErro(r.dados.error ?? "Não foi possível mover");
    await recarregar();
    onFechar();
  }

  return (
    <Modal titulo="Colocar em uma equipe" subtitulo={`${nomeDe(vaga)} · ${vaga.cargo}${veioDeEquipe ? ` · hoje em ${atual!.nome}` : " · hoje sem equipe"}`} onFechar={onFechar}>
      <div className="space-y-3 px-5 py-4">
        <Campo rotulo="Equipe">
          <select value={equipeId} onChange={(e) => (setEquipeId(e.target.value), setLugar("nova"))} className="field">
            <option value="">Escolha…</option>
            {contratos.map((chave) => {
              const [cli, c] = chave.split("\u0000");
              return (
              <optgroup key={chave} label={`${cli ? `${cli} · ` : ""}${rotuloContrato(c)}`}>
                {equipes
                  .filter((e) => e.projeto === c && clienteDe(e) === cli)
                  .map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.nome}
                    </option>
                  ))}
              </optgroup>
              );
            })}
          </select>
        </Campo>
        {equipeId && (
          <Campo rotulo="Vai ocupar">
            <select value={lugar} onChange={(e) => setLugar(e.target.value)} className="field">
              <option value="nova">Uma posição nova na equipe</option>
              {lugares.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.semNome ? "Posição sem nome" : "Vaga aberta"} · {v.cargo} ({v.empresa}, {v.atividade})
                </option>
              ))}
            </select>
          </Campo>
        )}
        {veioDeEquipe && (
          <label className="flex cursor-pointer items-start gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={abrirNaOrigem} onChange={(e) => setAbrirNaOrigem(e.target.checked)} className="mt-1 accent-[#0A9E7F]" />
            <span>
              Abrir uma vaga em <strong>{atual!.nome}</strong>, de onde ele sai
            </span>
          </label>
        )}
      </div>
      {erro && (
        <div className="px-5 pb-3">
          <Aviso tipo="erro">{erro}</Aviso>
        </div>
      )}
      <RodapeModal>
        <button onClick={onFechar} className="btn-ghost">
          Cancelar
        </button>
        <button onClick={salvar} disabled={salvando || !equipeId} className="btn-primary">
          {salvando ? "Movendo…" : "Colocar na equipe"}
        </button>
      </RodapeModal>
    </Modal>
  );
}
