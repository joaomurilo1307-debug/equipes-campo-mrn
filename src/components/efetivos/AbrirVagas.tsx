"use client";

// Abrir vagas / adicionar um cargo novo numa equipe, no mesmo estilo de montar uma equipe: escolhe a equipe, descreve as
// vagas (função, empresa, atividade, quantidade) e confere o resumo à direita. Função que ainda não existe vira cargo novo.
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { dataValida, temNome, type Dia } from "@/lib/efetivos/disponibilidade";
import { useDados } from "./DadosContext";
import { A_DEFINIR, chamar, ehReserva, rotuloContrato, valoresUsados, type Equipe } from "./comum";
import { Assistente, Numeros, Pronto, ResumoCard, Rotulo } from "./assistente";
import { IcFechar, IcMais } from "./icones";
import { Aviso, Secao } from "./ui";

const ATIVIDADES = ["Resgate", "Afugentamento", "Apoio"];
const NIVEIS = ["Superior", "Técnico", "NA"];

type Linha = { cargo: string; empresa: string; atividade: string; nivel: string; direcao4x4: "" | "sim" | "nao"; quantidade: number; contratando: boolean; previsao: string; veiculoId: string };

export default function AbrirVagas() {
  const params = useSearchParams();
  const { dados, equipesCampo, equipePorId, vagasPorEquipe, veiculosPorEquipe, recarregar, contagemDe } = useDados();
  const podeEditar = dados.podeEditar;
  const cargos = useMemo(() => valoresUsados(dados.vagas, "cargo"), [dados.vagas]);
  const empresas = useMemo(() => valoresUsados(dados.vagas, "empresa"), [dados.vagas]);
  const pedida = params.get("equipe");
  const [equipeId, setEquipeId] = useState(pedida && equipePorId.has(pedida) ? pedida : equipesCampo[0]?.id ?? "");
  const equipe: Equipe | undefined = equipePorId.get(equipeId);
  const nova = (base?: Partial<Linha>): Linha => ({ cargo: "", empresa: empresas[0] ?? "Consominas", atividade: "Resgate", nivel: "", direcao4x4: "", quantidade: 1, contratando: false, previsao: "", veiculoId: "", ...base });
  const [linhas, setLinhas] = useState<Linha[]>([nova()]);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [feito, setFeito] = useState<{ n: number; novos: string[]; equipeId: string } | null>(null);

  const doTime = vagasPorEquipe.get(equipeId) ?? [];
  const viaturas = veiculosPorEquipe.get(equipeId) ?? [];
  const cm = equipe ? contagemDe([equipe.id]) : null;
  // funções que a equipe já tem (para começar de um modelo)
  const funcoesDoTime = useMemo(() => {
    const m = new Map<string, { cargo: string; empresa: string; atividade: string; nivel: string | null; n: number }>();
    for (const v of doTime) {
      const k = `${v.cargo}|${v.empresa}|${v.atividade}`;
      const x = m.get(k) ?? { cargo: v.cargo, empresa: v.empresa, atividade: v.atividade, nivel: v.nivel, n: 0 };
      x.n++;
      m.set(k, x);
    }
    return [...m.values()].sort((a, b) => b.n - a.n);
  }, [doTime]);

  const valida = (l: Linha) => l.cargo.trim() !== "" && l.empresa.trim() !== "" && l.quantidade >= 1 && (!l.previsao || dataValida(l.previsao));
  const validas = linhas.filter(valida);
  const totalNovas = validas.reduce((s, l) => s + l.quantidade, 0);
  const cargosNovos = [...new Set(validas.map((l) => l.cargo.trim()).filter((c) => !cargos.some((x) => x.toLowerCase() === c.toLowerCase())))];
  const podeSalvar = podeEditar && !!equipe && validas.length > 0 && validas.length === linhas.filter((l) => l.cargo.trim() || l.empresa.trim()).length && !salvando;

  const set = (i: number, k: keyof Linha, v: string | number | boolean) => setLinhas((x) => x.map((l, j) => (j === i ? { ...l, [k]: v } : l)));

  async function salvar() {
    if (!equipe) return;
    setSalvando(true);
    setErro(null);
    let criadas = 0;
    for (const l of validas) {
      const r = await chamar("POST", "/api/efetivos/vagas", {
        equipeId: equipe.id,
        nome: null,
        cargo: l.cargo.trim(),
        empresa: l.empresa.trim(),
        atividade: l.atividade,
        nivel: l.nivel || null,
        direcao4x4: l.direcao4x4 === "" ? null : l.direcao4x4 === "sim",
        status: l.contratando ? "Em contratação" : "Vigente",
        previsaoInicio: l.contratando && l.previsao ? (l.previsao as Dia) : null,
        veiculoId: l.veiculoId || null,
        quantidade: l.quantidade,
        contrato: equipe.projeto !== A_DEFINIR ? equipe.projeto : null,
        equipeContrato: equipe.nome,
      });
      if (!r.ok) {
        setSalvando(false);
        await recarregar();
        setErro(`${criadas > 0 ? `${criadas} vaga(s) já foram abertas. ` : ""}Não consegui abrir "${l.cargo}": ${r.dados.error ?? "erro desconhecido"}`);
        return;
      }
      criadas += l.quantidade;
    }
    await recarregar();
    setSalvando(false);
    setFeito({ n: criadas, novos: cargosNovos, equipeId: equipe.id });
  }

  if (feito) {
    const e = equipePorId.get(feito.equipeId);
    return (
      <Pronto
        titulo={`${feito.n} vaga${feito.n === 1 ? "" : "s"} aberta${feito.n === 1 ? "" : "s"}`}
        texto={
          <>
            {e?.nome}
            {feito.novos.length > 0 && (
              <>
                <br />
                Cargo{feito.novos.length === 1 ? "" : "s"} novo{feito.novos.length === 1 ? "" : "s"}: <strong>{feito.novos.join(", ")}</strong>. Já aparece{feito.novos.length === 1 ? "" : "m"} nas listas de função.
              </>
            )}
          </>
        }
        acoes={
          <>
            <Link href={`/vagas?equipe=${feito.equipeId}`} className="btn-primary">
              Preencher as vagas
            </Link>
            <Link href={`/equipes?equipe=${feito.equipeId}`} className="btn-ghost">
              Ver a equipe
            </Link>
            <Link href={`/vagas/abrir?equipe=${feito.equipeId}&n=${Date.now()}`} className="btn-ghost">
              Abrir mais vagas
            </Link>
          </>
        }
      />
    );
  }

  return (
    <Assistente
      titulo="Abrir vagas / novo cargo"
      subtitulo="Aumente uma equipe: diga qual função falta, de qual empresa e quantas vagas. Uma função que ainda não existe entra como cargo novo."
      voltarHref={equipe ? `/equipes?equipe=${equipe.id}` : "/vagas"}
      topo={!podeEditar ? <Aviso tipo="info">Seu acesso é só de consulta.</Aviso> : undefined}
      resumo={
        <ResumoCard
          rotulo="Vagas a abrir"
          titulo={equipe?.nome ?? "Escolha a equipe"}
          linhas={equipe ? [[rotuloContrato(equipe.projeto), equipe.grupo].filter(Boolean).join(" · ")] : []}
          rodape={
            <>
              {erro && <Aviso tipo="erro">{erro}</Aviso>}
              <button type="button" onClick={salvar} disabled={!podeSalvar} className="btn-primary w-full">
                {salvando ? "Abrindo…" : totalNovas > 0 ? `Abrir ${totalNovas} vaga${totalNovas === 1 ? "" : "s"}` : "Abrir vagas"}
              </button>
              <p className="text-center text-[11px] text-gray-400">Tudo fica no histórico.</p>
            </>
          }
        >
          <Numeros itens={[{ valor: totalNovas, rotulo: "a abrir", cor: "#B86E00" }, { valor: cargosNovos.length, rotulo: "cargos novos" }, { valor: cm ? cm.abertas : 0, rotulo: "já abertas" }]} />
          {cm && (
            <p className="rounded-lg bg-gray-50 px-3 py-2 text-[12px] text-gray-600">
              A equipe tem <strong className="num text-ink">{cm.posicoes}</strong> posições hoje ({cm.comNome} com nome, {cm.semNome} sem nome informado, {cm.abertas} vagas abertas)
              {totalNovas > 0 && (
                <>
                  ; passa a ter <strong className="num text-ink">{cm.posicoes + totalNovas}</strong>.
                </>
              )}
            </p>
          )}
          {cargosNovos.length > 0 && (
            <p className="text-[11.5px] text-info">
              Cargo novo: <strong>{cargosNovos.join(", ")}</strong>
            </p>
          )}
        </ResumoCard>
      }
    >
      <Secao titulo="Em que equipe" sub="O contrato vem antes: é nele que a equipe trabalha.">
        <div className="grid gap-3 sm:grid-cols-2">
          <Rotulo t="Equipe" className="sm:col-span-2">
            <select value={equipeId} onChange={(e) => setEquipeId(e.target.value)} className="field">
              {[...new Set(equipesCampo.map((e) => e.projeto || A_DEFINIR))]
                .sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }))
                .map((c) => (
                  <optgroup key={c} label={rotuloContrato(c)}>
                    {equipesCampo
                      .filter((e) => (e.projeto || A_DEFINIR) === c && !ehReserva(e))
                      .map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.codigo} · {e.nome}
                        </option>
                      ))}
                  </optgroup>
                ))}
            </select>
          </Rotulo>
        </div>
        {funcoesDoTime.length > 0 && (
          <div className="mt-3">
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Funções que esta equipe já tem (clique para começar de uma)</div>
            <div className="flex flex-wrap gap-1.5">
              {funcoesDoTime.map((f) => (
                <button key={`${f.cargo}|${f.empresa}|${f.atividade}`} type="button" onClick={() => setLinhas((x) => [...x.filter((l) => l.cargo.trim() || l.empresa !== (empresas[0] ?? "")), nova({ cargo: f.cargo, empresa: f.empresa, atividade: f.atividade, nivel: f.nivel ?? "" })])} className="rounded-md bg-gray-50 px-2 py-1 text-[11.5px] text-gray-700 ring-1 ring-line hover:bg-brand-soft hover:text-brand-dark">
                  {f.cargo} <span className="text-gray-400">· {f.empresa} · {f.atividade}</span> <strong className="num">×{f.n}</strong>
                </button>
              ))}
            </div>
          </div>
        )}
      </Secao>

      <Secao
        titulo="Vagas"
        sub="Cada linha abre quantas vagas você pedir. Em contratação = a pessoa ainda vai ser contratada; senão fica aberta para puxar quem estiver disponível."
        direita={
          <button type="button" onClick={() => setLinhas((x) => [...x, nova()])} className="btn-ghost btn-sm">
            <IcMais tam={13} /> linha
          </button>
        }
      >
        <ul className="space-y-3">
          {linhas.map((l, i) => {
            const novoCargo = l.cargo.trim() !== "" && !cargos.some((c) => c.toLowerCase() === l.cargo.trim().toLowerCase());
            return (
              <li key={i} className="rounded-xl border border-line bg-gray-50/50 p-3">
                <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-[2fr_1.2fr_1fr_1fr_90px_auto]">
                  <Rotulo t="Função / cargo">
                    <input list="av-cargos" value={l.cargo} onChange={(e) => set(i, "cargo", e.target.value)} className="field !mt-0.5 !py-1.5" placeholder="ex.: Auxiliar de campo / Mateiro" />
                    {novoCargo && <span className="mt-0.5 block text-[10.5px] font-semibold text-info">cargo novo</span>}
                  </Rotulo>
                  <Rotulo t="Empresa">
                    <input list="av-empresas" value={l.empresa} onChange={(e) => set(i, "empresa", e.target.value)} className="field !mt-0.5 !py-1.5" />
                  </Rotulo>
                  <Rotulo t="Atividade">
                    <select value={l.atividade} onChange={(e) => set(i, "atividade", e.target.value)} className="field !mt-0.5 !py-1.5">
                      {ATIVIDADES.map((a) => (
                        <option key={a}>{a}</option>
                      ))}
                    </select>
                  </Rotulo>
                  <Rotulo t="Nível">
                    <select value={l.nivel} onChange={(e) => set(i, "nivel", e.target.value)} className="field !mt-0.5 !py-1.5">
                      <option value="">—</option>
                      {NIVEIS.map((a) => (
                        <option key={a}>{a}</option>
                      ))}
                    </select>
                  </Rotulo>
                  <Rotulo t="Quantas">
                    <input type="number" min={1} max={50} value={l.quantidade} onChange={(e) => set(i, "quantidade", Math.max(1, Number(e.target.value) || 1))} className="field !mt-0.5 !py-1.5" />
                  </Rotulo>
                  <div className="flex items-end pb-1">
                    {linhas.length > 1 && (
                      <button type="button" onClick={() => setLinhas((x) => x.filter((_, j) => j !== i))} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-bad" aria-label="Remover linha">
                        <IcFechar tam={14} />
                      </button>
                    )}
                  </div>
                </div>
                <div className="mt-2.5 flex flex-wrap items-end gap-x-4 gap-y-2">
                  <label className="flex items-center gap-2 text-[12.5px] text-gray-700">
                    <input type="checkbox" checked={l.contratando} onChange={(e) => set(i, "contratando", e.target.checked)} className="accent-[#0A9E7F]" /> Em contratação
                  </label>
                  {l.contratando && (
                    <Rotulo t="Previsão de entrada">
                      <input type="date" value={l.previsao} onChange={(e) => set(i, "previsao", e.target.value)} className="field !mt-0.5 !py-1" />
                    </Rotulo>
                  )}
                  <Rotulo t="Dirige 4x4">
                    <select value={l.direcao4x4} onChange={(e) => set(i, "direcao4x4", e.target.value)} className="field !mt-0.5 !w-28 !py-1">
                      <option value="">Não informado</option>
                      <option value="sim">Sim</option>
                      <option value="nao">Não</option>
                    </select>
                  </Rotulo>
                  {viaturas.length > 0 && (
                    <Rotulo t="Viatura em que vai">
                      <select value={l.veiculoId} onChange={(e) => set(i, "veiculoId", e.target.value)} className="field !mt-0.5 !w-32 !py-1">
                        <option value="">Nenhuma</option>
                        {viaturas.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.identificacao}
                          </option>
                        ))}
                      </select>
                    </Rotulo>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        <datalist id="av-cargos">
          {cargos.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <datalist id="av-empresas">
          {empresas.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </Secao>

      {doTime.length > 0 && (
        <Secao titulo="Como a equipe está hoje" sub={`${doTime.filter(temNome).length} com nome de ${doTime.length} posições.`} semPadding>
          <ul className="grid divide-y divide-line sm:grid-cols-2 sm:divide-y-0">
            {funcoesDoTime.slice(0, 8).map((f) => (
              <li key={`${f.cargo}|${f.empresa}|${f.atividade}`} className="flex items-center justify-between gap-3 px-4 py-2 text-[12.5px]">
                <span className="min-w-0 truncate text-ink">
                  {f.cargo} <span className="text-gray-400">· {f.empresa}</span>
                </span>
                <span className="num font-semibold text-gray-600">{f.n}</span>
              </li>
            ))}
          </ul>
        </Secao>
      )}
    </Assistente>
  );
}
