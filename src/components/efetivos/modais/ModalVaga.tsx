"use client";

import { useMemo, useState } from "react";
import { useDados } from "../DadosContext";
import { chamar, valoresUsados, type Equipe, type Vaga } from "../comum";
import { Aviso, Campo, Modal, RodapeModal } from "../ui";

/** Nova pessoa (vaga) na equipe, ou detalhes de uma existente (equipe, função, 4x4, outro contrato...). */
export default function ModalVaga({ equipe, vaga, onFechar, onSalvo }: { equipe?: Equipe; vaga?: Vaga; onFechar: () => void; onSalvo: (aviso?: string) => void | Promise<void> }) {
  const { dados, recarregar, equipePorId } = useDados();
  const equipeAtual = vaga ? equipePorId.get(vaga.equipeId) : equipe;
  const cargos = useMemo(() => valoresUsados(dados.vagas, "cargo"), [dados.vagas]);
  const empresas = useMemo(() => valoresUsados(dados.vagas, "empresa"), [dados.vagas]);
  const atividades = useMemo(() => valoresUsados(dados.vagas, "atividade"), [dados.vagas]);
  const projetos = useMemo(() => Array.from(new Set(dados.equipes.map((e) => e.projeto))).sort(), [dados.equipes]);

  const [v, setV] = useState({
    equipeId: vaga?.equipeId ?? equipe?.id ?? "",
    nome: vaga?.nome ?? "",
    cargo: vaga?.cargo ?? "",
    empresa: vaga?.empresa ?? "Consominas",
    atividade: vaga?.atividade ?? "Resgate",
    nivel: vaga?.nivel ?? "",
    direcao4x4: vaga?.direcao4x4 === true ? "sim" : vaga?.direcao4x4 === false ? "nao" : "",
    contratoAtual: vaga?.contratoAtual ?? "",
    disponivelAPartir: vaga?.disponivelAPartir ?? "",
    destino: vaga?.destino ?? "",
    previsaoInicio: vaga?.previsaoInicio ?? "",
    observacao: vaga?.observacao ?? "",
  });
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const set = (k: keyof typeof v, valor: string) => setV((x) => ({ ...x, [k]: valor }));

  async function salvar() {
    setSalvando(true);
    setErro(null);
    const base = {
      cargo: v.cargo,
      empresa: v.empresa,
      atividade: v.atividade,
      nivel: v.nivel || null,
      nome: v.nome || null,
      direcao4x4: v.direcao4x4 === "sim" ? true : v.direcao4x4 === "nao" ? false : null,
      contratoAtual: v.contratoAtual || null,
      disponivelAPartir: v.disponivelAPartir || null,
      destino: v.destino || null,
      previsaoInicio: v.previsaoInicio || null,
      observacao: v.observacao || null,
    };
    const r = vaga ? await chamar("PATCH", `/api/efetivos/vagas/${vaga.id}`, { ...base, equipeId: v.equipeId }) : await chamar("POST", "/api/efetivos/vagas", { ...base, equipeId: v.equipeId });
    setSalvando(false);
    if (!r.ok) return setErro(r.dados.error ?? "Não foi possível salvar");
    await recarregar();
    const futuras = (r.dados as any).alocacoesFuturas as number | undefined;
    await onSalvo(futuras && futuras > 0 ? `Profissional trocado: a vaga tem ${futuras} escala(s) em campanha, que continuam nela. Revise em Campanhas se for outra pessoa.` : undefined);
  }

  return (
    <Modal titulo={vaga ? `Detalhes — ${vaga.nome ?? vaga.cargo}` : `Nova pessoa — ${equipeAtual?.codigo ?? ""}`} subtitulo={equipeAtual ? equipeAtual.nome : undefined} onFechar={onFechar}>
      <div className="grid gap-4 px-6 py-5 sm:grid-cols-2">
        {vaga && (
          <Campo rotulo="Equipe (mudar aqui move a pessoa de equipe)" className="sm:col-span-2">
            <select value={v.equipeId} onChange={(e) => set("equipeId", e.target.value)} className="field">
              {dados.equipes.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.codigo} · {e.nome} ({e.projeto})
                </option>
              ))}
            </select>
          </Campo>
        )}
        <Campo rotulo="Profissional" dica="Deixe em branco se a vaga ainda está aberta." className="sm:col-span-2">
          <input value={v.nome} onChange={(e) => set("nome", e.target.value)} className="field" autoFocus={!vaga} />
        </Campo>
        <Campo rotulo="Cargo / função">
          <input list="lista-cargos" value={v.cargo} onChange={(e) => set("cargo", e.target.value)} className="field" />
          <datalist id="lista-cargos">
            {cargos.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Campo>
        <Campo rotulo="Empresa">
          <input list="lista-empresas" value={v.empresa} onChange={(e) => set("empresa", e.target.value)} className="field" />
          <datalist id="lista-empresas">
            {empresas.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Campo>
        <Campo rotulo="Atividade">
          <input list="lista-atividades" value={v.atividade} onChange={(e) => set("atividade", e.target.value)} className="field" />
          <datalist id="lista-atividades">
            {atividades.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
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
            <option value="">Não informado</option>
            <option value="sim">Sim</option>
            <option value="nao">Não</option>
          </select>
        </Campo>
        <Campo rotulo="Previsão de início" dica="Para vaga em contratação.">
          <input type="date" value={v.previsaoInicio} onChange={(e) => set("previsaoInicio", e.target.value)} className="field" />
        </Campo>
        <div className="rounded-xl border border-info/20 bg-info-soft/60 p-4 sm:col-span-2">
          <div className="mb-2 text-sm font-semibold text-info">Ainda em outro contrato? (reforço que vai migrar)</div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Campo rotulo="Contrato atual">
              <input list="lista-projetos-vaga" value={v.contratoAtual} onChange={(e) => set("contratoAtual", e.target.value)} className="field" />
              <datalist id="lista-projetos-vaga">
                {projetos.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
            </Campo>
            <Campo rotulo="Livre a partir de">
              <input type="date" value={v.disponivelAPartir} onChange={(e) => set("disponivelAPartir", e.target.value)} className="field" />
            </Campo>
            <Campo rotulo="Vai migrar para">
              <input value={v.destino} onChange={(e) => set("destino", e.target.value)} className="field" />
            </Campo>
          </div>
          <p className="mt-2 text-[11px] text-gray-500">Antes da data de liberação a pessoa conta como ocupada nesse contrato e não aparece livre para montar equipe.</p>
        </div>
        <Campo rotulo="Observação (visível só a quem edita)" className="sm:col-span-2">
          <textarea value={v.observacao} onChange={(e) => set("observacao", e.target.value)} rows={2} className="field" />
        </Campo>
      </div>
      {erro && (
        <div className="px-6 pb-4">
          <Aviso tipo="erro">{erro}</Aviso>
        </div>
      )}
      <RodapeModal>
        <button onClick={onFechar} className="btn-ghost">
          Cancelar
        </button>
        <button onClick={salvar} disabled={salvando || !v.cargo.trim() || !v.empresa.trim() || !v.equipeId} className="btn-primary">
          {salvando ? "Salvando…" : vaga ? "Salvar" : "Adicionar pessoa"}
        </button>
      </RodapeModal>
    </Modal>
  );
}
