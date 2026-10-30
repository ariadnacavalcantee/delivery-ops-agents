"use client";

import { Truck, ChevronRight, LayoutGrid, LifeBuoy, Loader2, MapPin, Package, Settings, Store, Check, CircleAlert } from "lucide-react";
import type { AgentId } from "@/lib/types";
import { cn } from "@/lib/utils";

export type AgentStatus = "aguardando" | "rodando" | "concluido" | "erro";

export const AGENT_META: Record<AgentId, { name: string; role: string }> = {
  monitor: { name: "Monitor", role: "Vigia os pedidos e levanta alertas" },
  diagnostico: { name: "Diagnóstico", role: "Descobre por que estão atrasando" },
  vendedores: { name: "Vendedores", role: "Separa atraso de postagem de atraso de transporte" },
  acoes: { name: "Ações", role: "Transforma diagnóstico em plano" },
  relatorio: { name: "Relatório", role: "Escreve o resumo da noite" },
};

const NAV = [
  { label: "Visão geral", icon: LayoutGrid, active: true },
  { label: "Pedidos", icon: Package },
  { label: "Vendedores", icon: Store },
  { label: "Transportadoras", icon: Truck },
  { label: "Estados", icon: MapPin },
];

function StatusIcon({ s }: { s: AgentStatus }) {
  if (s === "rodando") return <Loader2 className="size-4 animate-spin text-primary" aria-label="rodando" />;
  if (s === "concluido") return <span className="grid size-4 place-items-center rounded-full bg-success text-white" aria-label="concluído"><Check className="size-2.5" strokeWidth={3.5} /></span>;
  if (s === "erro") return <CircleAlert className="size-4 text-critical" aria-label="erro" />;
  return <span className="size-4 rounded-full border-[1.5px] border-dashed border-muted-foreground/50" aria-label="aguardando" />;
}

export default function Sidebar({ status, times }: { status: Record<AgentId, AgentStatus>; times: Partial<Record<AgentId, number>> }) {
  const order: AgentId[] = ["monitor", "diagnostico", "vendedores", "acoes", "relatorio"];
  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r bg-background lg:flex">
      <div className="flex items-center gap-3 border-b px-5 py-4">
        <div className="grid size-9 place-items-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">D</div>
        <div className="min-w-0 flex-1">
          <p className="whitespace-nowrap text-sm font-semibold leading-tight">Delivery Ops Agents</p>
          <p className="text-xs text-muted-foreground">Dados reais da Olist</p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <p className="px-2 pb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Principal</p>
        <ul className="space-y-0.5">
          {NAV.map((n) => (
            <li key={n.label}>
              <a
                href="#"
                aria-current={n.active ? "page" : undefined}
                className={cn(
                  "relative flex items-center gap-2.5 rounded-md px-2 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground",
                  n.active && "bg-accent font-medium text-foreground",
                )}
              >
                {n.active && <span className="absolute -left-3 top-1.5 bottom-1.5 w-1 rounded-r bg-primary" aria-hidden />}
                <n.icon className={cn("size-4", n.active && "text-primary")} />
                {n.label}
                {n.active && <ChevronRight className="ml-auto size-4 text-muted-foreground" />}
              </a>
            </li>
          ))}
        </ul>

        <p className="px-2 pb-2 pt-6 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Agentes</p>
        <ol className="relative space-y-0.5">
          {order.map((id) => (
            <li key={id} className="flex items-center gap-2.5 rounded-md px-2 py-2 text-sm">
              <StatusIcon s={status[id]} />
              <span className={cn(status[id] === "aguardando" ? "text-muted-foreground" : "text-foreground")}>{AGENT_META[id].name}</span>
              {times[id] !== undefined && (
                <span className="ml-auto text-xs text-muted-foreground">{(times[id]! / 1000).toFixed(1).replace(".", ",")} s</span>
              )}
            </li>
          ))}
        </ol>
        <p className="px-2 pt-2 text-xs leading-relaxed text-muted-foreground">
          Diagnóstico e Vendedores rodam em paralelo depois do Monitor.
        </p>
      </nav>

      <div className="space-y-0.5 px-3 pb-3">
        <a href="#" className="flex items-center gap-2.5 rounded-md px-2 py-2 text-sm text-muted-foreground hover:bg-accent"><Settings className="size-4" />Configurações</a>
        <a href="#" className="flex items-center gap-2.5 rounded-md px-2 py-2 text-sm text-muted-foreground hover:bg-accent"><LifeBuoy className="size-4" />Suporte</a>
      </div>
      <div className="flex items-center gap-3 border-t px-5 py-4">
        <div className="grid size-9 place-items-center rounded-full bg-primary/15 text-sm font-semibold text-primary">ML</div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">Marina Lopes</p>
          <p className="truncate text-xs text-muted-foreground">Gestora de operações</p>
        </div>
        <ChevronRight className="size-4 text-muted-foreground" />
      </div>
    </aside>
  );
}
