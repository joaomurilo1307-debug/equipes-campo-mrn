"use client";

import { useMemo, useState } from "react";
import { useDados } from "../DadosContext";
import { chamar, contratosConhecidos, valoresUsados, type Equipe, type Vaga } from "../comum";
import { IcLixo } from "../icones";
import { Aviso, Campo, Modal, RodapeModal } from "../ui";

/** Nova pessoa (vaga) na equipe, ou todos os detalhes de uma existente: equipe, função, 4x4, carro, outro contrato… */
export default function ModalVaga({ equipe, vaga, onFechar, onSalvo }: { equipe?: Equipe; vaga?: Vaga; onFechar: () => void; onSalvo: (aviso?: string) => void | Promise<void> }) {
  const { dados, recarregar, equipePorId, veiculosPorEquipe } = useDados();
  const equipeInicial = vaga ? equipePorId.get(vaga.equipeId) : equipe;
  const cargos = useMemo(() => valoresUsados(dados.vagas, "cargo"), [dados.vagas]);
  const empresas = useMemo(() => valoresUsados(dados.vagas, "empresa"), [dados.vagas]);
  const atividades = useMemo(() => valoresUsados(dados.vagas, "atividade"), [dados.vagas]);
  const contratos = useMemo(() => contratosConhecidos(dados), [dados]);

  const [v, setV] = useState({
    equipeId: vaga?.equipeId ?? equipe?.id ?? "",
    nome: vaga?.nome ?? "",
    cargo: vaga?.cargo ?? "",
    empresa: vaga?.empresa ?? "Consominas",
    atividade: vaga?.atividade ?? "Resgate",
    nivel: vaga?.nivel ?? "",
    direcao4x4: vaga?.direcao4x4 === true ? "sim" : vaga?.direcao4x4 === false ? "nao" : "",
    veiculoId: vaga?.veiculoId ?? "",
    contratoAtual: vaga?.contratoAtual ?? "",
    disponivelAPartir: vaga?.disponivelAPartir ?? "",
    destino: vaga?.destino ?? "",
    previsaoInicio: vaga?.previsaoInicio ?? "",
    observacao: vaga?.observacao ?? "",
  });
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const set = (k: keyof typeof v, valor: string) => setV((x) => ({ ...x, [k]: valor }));

  // viaturas oferecidas: as da equipe escolhida (e a que a pessoa ja usa, se for de outra)
  const viaturas = useMemo(() => {
    const lista = [...(veiculosPorEquipe.get(v.equipeId) ?? [])];
    const atual = vaga?.veiculoId ? dados.veiculos.find((x) => x.id === vaga.veiculoId) : null;
    if (atual && !lista.some((x) => x.id === atual.id)) lista.push(atual);
    return lista;
  }, [veiculosPorEquipe, v.equipeId, vaga?.veiculoId, dados.veiculos]);

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
      veiculoId: v.veiculoId || null,
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

  async function excluir() {
    if (!vaga || !window.confirm("Excluir esta vaga? As ausências dela também saem.")) return;
    setSalvando(true);
    const r = await chamar("DELETE", `/api/efetivos/vagas/${vaga.id}`);
    setSalvando(false);
    if (!r.ok) return setErro(r.dados.error ?? "Não foi possível excluir");
    await recarregar();
    await onSalvo();
  }

  return (
    <Modal titulo={vaga ? `Detalhes — ${vaga.nome ?? vaga.cargo}` : `Nova pessoa — ${equipeInicial?.codigo ?? ""}`} subtitulo={equipeInicial?.nome} onFechar={onFechar}>
      <div className="grid gap-4 px-6 py-5 sm:grid-cols-2">
        {vaga && (
          <Campo rotulo="Equipe (mudar aqui move a pessoa de equipe)" className="sm:col-span-2">
            <select value={v.equipeId} onChange={(e) => set("equipeId", e.target.value)} className="field">
              {dados.equipes.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.codigo} · {e.nome}
                </option>
              ))}
            </select>
          </Campo>
        )}
        <Campo rotulo="Profissional" dica="Em branco = vaga aberta." className="sm:col-span-2">
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
            <option value="">—</option>
            <option value="sim">Sim</option>
            <option value="nao">Não</option>
          </select>
        </Campo>
        <Campo rotulo="Vai na viatura">
          <select value={v.veiculoId} onChange={(e) => set("veiculoId", e.target.value)} className="field">
            <option value="">— nenhuma</option>
            {viaturas.map((x) => (
              <option key={x.id} value={x.id}>
                {x.identificacao}
                {x.placa ? ` · ${x.placa}` : ""}
              </option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Previsão de início" dica="Para vaga em contratação.">
          <input type="date" value={v.previsaoInicio} onChange={(e) => set("previsaoInicio", e.target.value)} className="field" />
        </Campo>
        <div className="rounded-xl border border-line bg-gray-50 p-4 sm:col-span-2">
          <div className="mb-2 text-[13px] font-semibold text-gray-700">Ainda em outro contrato (reforço que vai migrar)</div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Campo rotulo="Contrato atual">
              <input list="lista-contratos-vaga" value={v.contratoAtual} onChange={(e) => set("contratoAtual", e.target.value)} className="field" />
              <datalist id="lista-contratos-vaga">
                {contratos.map((p) => (
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
        </div>
        <Campo rotulo="Observações" className="sm:col-span-2">
          <textarea value={v.observacao} onChange={(e) => set("observacao", e.target.value)} rows={2} className="field" />
        </Campo>
      </div>
      {erro && (
        <div className="px-6 pb-4">
          <Aviso tipo="erro">{erro}</Aviso>
        </div>
      )}
      <RodapeModal>
        {vaga && (
          <button onClick={excluir} disabled={salvando} className="btn-danger mr-auto">
            <IcLixo tam={15} /> Excluir vaga
          </button>
        )}
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
