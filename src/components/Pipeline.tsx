"use client";

import { Check, CircleAlert } from "lucide-react";
import type { AgentId } from "@/lib/types";

export type AgentState = {
  status: "aguardando" | "rodando" | "concluido" | "erro";
  logs: string[];
  ms?: number;
  tokens?: number;
};

const META: Record<AgentId, { name: string; role: string }> = {
  monitor: { name: "Monitor", role: "Vigia os pedidos e levanta alertas" },
  diagnostico: { name: "Diagnóstico", role: "Descobre por que estão atrasando" },
  restaurantes: { name: "Restaurantes", role: "Separa problema de hoje de problema crônico" },
  acoes: { name: "Ações", role: "Transforma diagnóstico em próximos passos" },
  relatorio: { name: "Relatório", role: "Escreve o resumo para a liderança" },
};

function Node({ id, state }: { id: AgentId; state: AgentState }) {
  const m = META[id];
  const last = state.logs[state.logs.length - 1];
  const color =
    state.status === "concluido" ? "var(--ok)" : state.status === "rodando" ? "var(--warn)" : state.status === "erro" ? "var(--bad)" : "var(--sea-600)";
  return (
    <div
      className="relative rounded-xl border px-3.5 py-3 transition-colors"
      style={{ borderColor: state.status === "aguardando" ? "var(--sea-700)" : color, background: "var(--sea-800)" }}
    >
      <div className="flex items-center gap-2">
        <span
          className={`grid size-4 place-items-center rounded-full ${state.status === "rodando" ? "running-dot" : ""}`}
          style={{ background: state.status === "aguardando" ? "transparent" : color, border: `1.5px solid ${color}` }}
          aria-hidden
        >
          {state.status === "concluido" && <Check className="size-2.5 text-sea-900" strokeWidth={3.5} />}
          {state.status === "erro" && <CircleAlert className="size-2.5 text-sea-900" strokeWidth={3.5} />}
        </span>
        <span className="font-display text-[15px] font-semibold">{m.name}</span>
        {state.ms !== undefined && (
          <span className="ml-auto text-xs text-ink-faint">
            {(state.ms / 1000).toFixed(1).replace(".", ",")} s{state.tokens ? `, ${state.tokens.toLocaleString("pt-BR")} tokens` : ""}
          </span>
        )}
      </div>
      <p className="mt-1 text-xs text-ink-soft">{m.role}</p>
      {last && state.status !== "aguardando" && (
        <p className="mt-2 text-xs text-ink" aria-live="polite">{last}</p>
      )}
    </div>
  );
}

const Connector = () => <div className="mx-auto h-4 w-px bg-sea-600" aria-hidden />;

export default function Pipeline({ agents }: { agents: Record<AgentId, AgentState> }) {
  return (
    <ol className="flex flex-col" aria-label="Fluxo dos agentes">
      <li><Node id="monitor" state={agents.monitor} /></li>
      <Connector />
      <li>
        <div className="relative grid grid-cols-2 gap-2">
          <Node id="diagnostico" state={agents.diagnostico} />
          <Node id="restaurantes" state={agents.restaurantes} />
        </div>
        <p className="mt-1.5 text-center text-[11px] text-ink-faint">rodam em paralelo</p>
      </li>
      <Connector />
      <li><Node id="acoes" state={agents.acoes} /></li>
      <Connector />
      <li><Node id="relatorio" state={agents.relatorio} /></li>
    </ol>
  );
}
