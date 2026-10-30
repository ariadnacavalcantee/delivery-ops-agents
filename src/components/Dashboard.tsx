"use client";

import { useMemo, useState } from "react";
import { Play, RotateCcw } from "lucide-react";
import type {
  ActionsOutput, AgentId, Alert, DiagnosisOutput, MonitorOutput, ReportOutput, RestaurantsOutput, RunEvent,
} from "@/lib/types";
import ZoneMap from "./ZoneMap";
import Pipeline, { type AgentState } from "./Pipeline";
import { Actions, Alerts, Causes, Report, Restaurants } from "./Results";
import { brl, n1, type Overview, type RestaurantStat, type ZoneStat } from "./format";

const IDS: AgentId[] = ["monitor", "diagnostico", "restaurantes", "acoes", "relatorio"];
const idle = (): Record<AgentId, AgentState> =>
  Object.fromEntries(IDS.map((id) => [id, { status: "aguardando", logs: [] }])) as unknown as Record<AgentId, AgentState>;

type Outputs = {
  monitor?: MonitorOutput;
  diagnostico?: DiagnosisOutput;
  restaurantes?: RestaurantsOutput;
  acoes?: ActionsOutput;
  relatorio?: ReportOutput;
};

type Props = {
  city: string;
  window: string;
  overview: Overview;
  zones: ZoneStat[];
  restaurants: RestaurantStat[];
  live: boolean;
  model: string;
};

export default function Dashboard({ city, window: win, overview, zones, restaurants, live, model }: Props) {
  const [agents, setAgents] = useState(idle);
  const [outputs, setOutputs] = useState<Outputs>({});
  const [running, setRunning] = useState(false);
  const [totalMs, setTotalMs] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hoverAlert, setHoverAlert] = useState<Alert | null>(null);
  const [hoverRest, setHoverRest] = useState<string | null>(null);
  const [selectedZone, setSelectedZone] = useState<string | null>(null);

  const flagged = useMemo(
    () => new Set((outputs.monitor?.alerts ?? []).map((a) => a.restaurantId).filter(Boolean) as string[]),
    [outputs.monitor],
  );

  function apply(e: RunEvent) {
    if (e.type === "agent_start")
      setAgents((s) => ({ ...s, [e.agent]: { ...s[e.agent], status: "rodando" } }));
    else if (e.type === "agent_log")
      setAgents((s) => ({ ...s, [e.agent]: { ...s[e.agent], logs: [...s[e.agent].logs, e.message] } }));
    else if (e.type === "agent_done") {
      setAgents((s) => ({ ...s, [e.agent]: { ...s[e.agent], status: "concluido", ms: e.ms, tokens: e.tokens } }));
      setOutputs((o) => ({ ...o, [e.agent]: e.output }));
    } else if (e.type === "agent_error") {
      setAgents((s) => ({ ...s, [e.agent]: { ...s[e.agent], status: "erro", logs: [...s[e.agent].logs, e.message] } }));
      setError(`O agente ${e.agent} falhou: ${e.message}`);
    } else if (e.type === "run_done") setTotalMs(e.ms);
  }

  async function run() {
    setAgents(idle());
    setOutputs({});
    setTotalMs(null);
    setError(null);
    setRunning(true);
    try {
      const res = await fetch("/api/run", { method: "POST" });
      if (!res.body) throw new Error("Sem resposta do servidor.");
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const l of lines) if (l.trim()) apply(JSON.parse(l));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao rodar os agentes.");
    } finally {
      setRunning(false);
    }
  }

  const zone = zones.find((z) => z.zoneId === selectedZone);
  const started = Object.values(agents).some((a) => a.status !== "aguardando");

  return (
    <main className="mx-auto max-w-[1240px] px-4 pb-24 sm:px-8">
      <header className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-sea-700 py-5">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">FoodOps AI</h1>
          <p className="text-sm text-ink-soft">{city}, {win}</p>
        </div>
        <span
          className="rounded-full border px-3 py-1 text-xs"
          style={{ borderColor: live ? "var(--ok)" : "var(--sea-600)", color: live ? "var(--ok)" : "var(--ink-soft)" }}
          title={live ? undefined : "Defina ANTHROPIC_API_KEY para os agentes usarem o Claude"}
        >
          {live ? `Claude ao vivo (${model})` : "Modo simulado, sem chave de API"}
        </span>
        <button
          onClick={run}
          disabled={running}
          className="ml-auto flex items-center gap-2 rounded-full bg-warn px-5 py-2.5 text-sm font-semibold text-sea-900 transition hover:brightness-110 disabled:cursor-progress disabled:opacity-60"
        >
          {started && !running ? <RotateCcw className="size-4" /> : <Play className="size-4" fill="currentColor" />}
          {running ? "Agentes trabalhando" : started ? "Rodar de novo" : "Rodar agentes"}
        </button>
      </header>

      <section className="grid grid-cols-[minmax(0,1fr)] gap-8 py-8 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div>
          <dl className="mb-6 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
            <Stat label="pedidos atrasados" value={`${overview.lateOrders}`} sub={`de ${overview.totalOrders}`} />
            <Stat label="taxa de atraso" value={`${n1(overview.lateRatePct)}%`} tone="var(--bad)" />
            <Stat label="atraso médio" value={`${n1(overview.avgDelayLateMin)} min`} sub="além do prometido" />
            <Stat label="em risco" value={brl(overview.gmvAtRisk)} sub="cancelamento ou cupom" />
          </dl>
          <ZoneMap
            zones={zones}
            restaurants={restaurants}
            highlightZone={hoverAlert?.zoneId ?? restaurants.find((r) => r.restaurantId === (hoverAlert?.restaurantId ?? hoverRest))?.zoneId}
            highlightRestaurant={hoverAlert?.restaurantId ?? hoverRest}
            flaggedRestaurants={flagged}
            onSelectZone={setSelectedZone}
            selectedZone={selectedZone}
          />
          <div className="mt-3 min-h-[3.5rem] text-sm text-ink-soft" aria-live="polite">
            {zone ? (
              <p>
                <b className="text-ink">{zone.zone}</b>: {zone.orders} pedidos, {zone.openOrders} em aberto para {zone.activeCouriers} entregadores.
                Alocação média de {n1(zone.avgAssignMin)} min, trajeto de {n1(zone.avgTravelMin)} min, {n1(zone.addressIssuePct)}% com problema de endereço.
              </p>
            ) : (
              <p>Toque numa zona para ver os detalhes. Depois de rodar os agentes, passe o cursor nos alertas para localizá-los no mapa.</p>
            )}
          </div>
        </div>

        <aside>
          <h2 className="font-display text-lg font-semibold">Agentes</h2>
          <p className="mb-4 text-sm text-ink-soft">
            {running ? "Trabalhando nos dados desta noite." : totalMs ? `Concluído em ${(totalMs / 1000).toFixed(1).replace(".", ",")} s.` : "Cinco agentes leem a operação e entregam um plano."}
          </p>
          <Pipeline agents={agents} />
        </aside>
      </section>

      {error && <p role="alert" className="mb-6 rounded-lg border border-bad px-4 py-3 text-sm text-bad">{error}</p>}

      {!started && (
        <div className="rounded-2xl border border-dashed border-sea-600 px-6 py-10 text-center">
          <p className="font-display text-lg">{Math.round(overview.lateRatePct)}% dos pedidos atrasaram nas últimas duas horas.</p>
          <p className="mt-1 text-sm text-ink-soft">Rode os agentes para descobrir por quê e o que fazer agora.</p>
        </div>
      )}

      <div className="space-y-14">
        {outputs.monitor && <Alerts data={outputs.monitor} onHover={setHoverAlert} />}
        {(outputs.diagnostico || outputs.restaurantes) && (
          <div className="grid grid-cols-[minmax(0,1fr)] gap-14 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
            {outputs.diagnostico && <Causes data={outputs.diagnostico} />}
            {outputs.restaurantes && <Restaurants data={outputs.restaurantes} onHover={setHoverRest} />}
          </div>
        )}
        {outputs.acoes && <Actions data={outputs.acoes} />}
        {outputs.relatorio && <Report markdown={outputs.relatorio.markdown} />}
      </div>
    </main>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div>
      <dt className="text-xs text-ink-soft">{label}</dt>
      <dd className="font-display text-3xl font-semibold leading-tight" style={{ color: tone }}>{value}</dd>
      {sub && <dd className="text-xs text-ink-faint">{sub}</dd>}
    </div>
  );
}
