"use client";

// Painel lateral de um veículo: onde está hoje, próxima mudança e últimas passagens.
import { diferencaDias } from "@/lib/efetivos/disponibilidade";
import { localizacaoNoDia, proximoMovimento, type MovimentoBase } from "@/lib/efetivos/veiculos";
import { useDados } from "../DadosContext";
import { CHIP_VEICULO, corDoContrato, fmtDia, rotuloContrato, type Veiculo } from "../comum";
import { Drawer, PontoContrato } from "../ui";

function Fato({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{rotulo}</dt>
      <dd className="mt-0.5 text-sm text-ink">{children}</dd>
    </div>
  );
}

// ---------------------------------------------------------------- veículo

export function DrawerVeiculo({ veiculo, onFechar, onMover, onEditar, onHistorico }: { veiculo: Veiculo; onFechar: () => void; onMover: () => void; onEditar: () => void; onHistorico: () => void }) {
  const { dados, hoje, equipePorId } = useDados();
  const movs = dados.movimentos.filter((m) => m.veiculoId === veiculo.id);
  const loc = localizacaoNoDia(movs as MovimentoBase[], hoje);
  const prox = proximoMovimento(movs as MovimentoBase[], hoje);
  const eq = loc?.equipeId ? equipePorId.get(loc.equipeId) : null;
  const recentes = [...movs].sort((a, b) => b.inicio.localeCompare(a.inicio)).slice(0, 5);
  return (
    <Drawer
      titulo={
        <span className="flex flex-wrap items-center gap-2">
          {veiculo.identificacao}
          <span className={CHIP_VEICULO[veiculo.status]}>{veiculo.status}</span>
        </span>
      }
      subtitulo={`${veiculo.codigo}${veiculo.placa ? ` · ${veiculo.placa}` : ""}${veiculo.modelo ? ` · ${veiculo.modelo}` : ""}`}
      onFechar={onFechar}
      rodape={
        dados.podeEditar ? (
          <div className="flex gap-2">
            <button onClick={onMover} className="btn-primary flex-1">
              Mover veículo
            </button>
            <button onClick={onEditar} className="btn-ghost">
              Editar
            </button>
          </div>
        ) : undefined
      }
    >
      <div className="rounded-xl border border-line p-4">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Onde está hoje</div>
        {loc ? (
          <>
            <div className="mt-1.5 flex items-center gap-2 font-display text-xl font-semibold">
              <PontoContrato cor={corDoContrato(loc.projeto)} />
              {rotuloContrato(loc.projeto)}
            </div>
            <div className="mt-1 text-sm text-gray-600">{[eq ? `${eq.codigo} · ${eq.nome}` : null, loc.local].filter(Boolean).join(" · ") || "Sem equipe ou local informado"}</div>
            <div className="mt-1 text-xs text-gray-500">
              desde {fmtDia(loc.inicio)} · {diferencaDias(loc.inicio, hoje) + 1} dia(s)
            </div>
          </>
        ) : (
          <p className="mt-1.5 text-sm text-bad">Sem localização registrada.</p>
        )}
        {prox && (
          <div className="mt-3 rounded-lg bg-info-soft px-3 py-2 text-xs text-info">
            Próxima mudança: {fmtDia(prox.inicio)} → <strong>{rotuloContrato(prox.projeto)}</strong>
          </div>
        )}
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3">
        <Fato rotulo="Placa">{veiculo.placa ?? <span className="text-warn">a informar</span>}</Fato>
        <Fato rotulo="Modelo">{veiculo.modelo ?? "—"}</Fato>
        <Fato rotulo="Tração 4x4">{veiculo.tracao4x4 === true ? "Sim" : veiculo.tracao4x4 === false ? "Não" : "—"}</Fato>
      </dl>
      {veiculo.observacao && <p className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">{veiculo.observacao}</p>}

      <h4 className="mt-6 flex items-center justify-between font-display text-base font-semibold">
        Últimas passagens
        <button onClick={onHistorico} className="text-xs font-semibold text-brand-dark hover:underline">
          ver histórico completo
        </button>
      </h4>
      <ol className="mt-2 space-y-1.5">
        {recentes.map((m) => (
          <li key={m.id} className="flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 text-sm">
            <span className="flex min-w-0 items-center gap-2">
              <PontoContrato cor={corDoContrato(m.projeto)} tam={8} />
              <span className="truncate font-medium">{rotuloContrato(m.projeto)}</span>
            </span>
            <span className="shrink-0 text-xs text-gray-500">
              {fmtDia(m.inicio)} → {m.fim ? fmtDia(m.fim) : "hoje"}
            </span>
          </li>
        ))}
      </ol>
    </Drawer>
  );
}
