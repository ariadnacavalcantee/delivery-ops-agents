"use client";

import { useState, type ReactNode } from "react";
import {
  ArrowDownRight, ArrowUpRight, Bell, CalendarClock, ChevronDown, Moon, Package, Play, RotateCcw, Search,
  Sparkles, Sun, TriangleAlert, Wallet,
} from "lucide-react";
import type {
  ActionsOutput, AgentId, DiagnosisOutput, MonitorOutput, ReportOutput, RestaurantsOutput, RunEvent,
} from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import Sidebar, { AGENT_META, type AgentStatus } from "./Sidebar";
import { Heatmap, LineChart } from "./charts";
import { brl, n1, signed, type Overview, type StageTimes, type Timeline } from "./format";

const IDS: AgentId[] = ["monitor", "diagnostico", "restaurantes", "acoes", "relatorio"];
const allIdle = () => Object.fromEntries(IDS.map((id) => [id, "aguardando"])) as Record<AgentId, AgentStatus>;

type Outputs = {
  monitor?: MonitorOutput;
  diagnostico?: DiagnosisOutput;
  restaurantes?: RestaurantsOutput;
  acoes?: ActionsOutput;
  relatorio?: ReportOutput;
};

type Props = {
  city: string;
  overview: Overview;
  baseline: number;
  timeline: Timeline;
  stages: StageTimes;
  live: boolean;
  model: string;
};

// ───────── peças pequenas ─────────

function Delta({ children, tone }: { children: ReactNode; tone: "bad" | "good" | "neutral" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full px-1.5 py-0.5 text-xs font-medium",
        tone === "bad" && "bg-critical-soft text-critical",
        tone === "good" && "bg-success-soft text-success",
        tone === "neutral" && "bg-muted text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

function Metric({ value, delta }: { value: ReactNode; delta?: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[28px] font-semibold leading-none tracking-tight">{value}</span>
      {delta}
    </div>
  );
}

function AgentPending({ agent, status, log, lines = 4 }: { agent: AgentId; status: AgentStatus; log?: string; lines?: number }) {
  if (status === "rodando")
    return (
      <div className="space-y-3" aria-live="polite">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Sparkles className="size-4 animate-pulse text-primary" />
          {log ?? `${AGENT_META[agent].name} trabalhando`}
        </p>
        {Array.from({ length: lines }, (_, i) => <Skeleton key={i} className="h-8 w-full" style={{ opacity: 1 - i * 0.18 }} />)}
      </div>
    );
  return (
    <div className="grid h-full min-h-40 place-items-center rounded-lg border border-dashed px-6 text-center">
      <div>
        <p className="text-sm font-medium">Agente {AGENT_META[agent].name}</p>
        <p className="mt-1 text-sm text-muted-foreground">{AGENT_META[agent].role}. Rode os agentes para ver o resultado.</p>
      </div>
    </div>
  );
}

const SEV = {
  critico: { label: "Crítico", cls: "bg-critical-soft text-critical", dot: "bg-critical" },
  alto: { label: "Alto", cls: "bg-warning-soft text-warning", dot: "bg-warning" },
  medio: { label: "Médio", cls: "bg-info-soft text-info", dot: "bg-info" },
};

const CAT = {
  cozinha: { label: "Cozinha", cls: "bg-primary" },
  clima: { label: "Clima", cls: "bg-info" },
  entregador: { label: "Entregadores", cls: "bg-warning" },
  demanda: { label: "Demanda", cls: "bg-warning" },
  endereco: { label: "Endereço", cls: "bg-violet-500" },
  outro: { label: "Outro", cls: "bg-muted-foreground" },
} as const;

const CONF: Record<string, string> = { alta: "Alta", media: "Média", baixa: "Baixa" };
const OWNER: Record<string, string> = { operacoes: "Operações", logistica: "Logística", comercial: "Comercial", produto: "Produto" };

// ───────── página ─────────

export default function Dashboard({ city, overview, baseline, timeline, stages, live, model }: Props) {
  const [status, setStatus] = useState(allIdle);
  const [lastLog, setLastLog] = useState<Partial<Record<AgentId, string>>>({});
  const [times, setTimes] = useState<Partial<Record<AgentId, number>>>({});
  const [outputs, setOutputs] = useState<Outputs>({});
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAllAlerts, setShowAllAlerts] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  function apply(e: RunEvent) {
    if (e.type === "agent_start") setStatus((s) => ({ ...s, [e.agent]: "rodando" }));
    else if (e.type === "agent_log") setLastLog((l) => ({ ...l, [e.agent]: e.message }));
    else if (e.type === "agent_done") {
      setStatus((s) => ({ ...s, [e.agent]: "concluido" }));
      setTimes((t) => ({ ...t, [e.agent]: e.ms }));
      setOutputs((o) => ({ ...o, [e.agent]: e.output }));
    } else if (e.type === "agent_error") {
      setStatus((s) => ({ ...s, [e.agent]: "erro" }));
      setError(`O agente ${AGENT_META[e.agent].name} falhou: ${e.message}`);
    }
  }

  async function run() {
    setStatus(allIdle());
    setLastLog({});
    setTimes({});
    setOutputs({});
    setError(null);
    setReportOpen(false);
    setRunning(true);
    try {
      const res = await fetch("/api/run", { method: "POST" });
      if (!res.body) throw new Error("O servidor não respondeu.");
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
      setError(err instanceof Error ? err.message : "Não foi possível rodar os agentes.");
    } finally {
      setRunning(false);
    }
  }

  function toggleTheme() {
    const dark = document.documentElement.classList.toggle("dark");
    try { localStorage.setItem("theme", dark ? "dark" : "light"); } catch {}
  }

  const started = IDS.some((id) => status[id] !== "aguardando");
  const hotZones = timeline.zones.filter((z) => {
    const avg = z.cells.reduce((a, b) => a + b, 0) / z.cells.length;
    return avg >= 40;
  });
  const { monitor, diagnostico, restaurantes, acoes, relatorio } = outputs;
  const crit = monitor?.alerts.filter((a) => a.severity === "critico").length ?? 0;
  const attention = restaurantes?.findings.filter((f) => f.risk !== "baixo").length ?? 0;
  const topCause = diagnostico?.causes[0];
  const stageColor = ["bg-primary", "bg-warning", "bg-info"];

  return (
    <div className="flex min-h-dvh bg-surface">
      <Sidebar status={status} times={times} />

      <main className="min-w-0 flex-1">
        {/* cabeçalho */}
        <header className="flex flex-wrap items-center gap-3 border-b bg-background px-4 py-4 sm:px-8">
          <div className="grid size-11 place-items-center rounded-full bg-primary/15 font-semibold text-primary">ML</div>
          <div className="mr-auto min-w-0">
            <h1 className="text-lg font-semibold leading-tight">Boa noite, Marina</h1>
            <p className="text-sm text-muted-foreground">Pico do jantar em {city.split(",")[0]}, sexta das 19h às 21h</p>
          </div>
          <Button variant="ghost" size="icon" aria-label="Buscar"><Search /></Button>
          <Button variant="ghost" size="icon" aria-label="Notificações" className="relative">
            <Bell />
            <span className="absolute right-2.5 top-2 size-1.5 rounded-full bg-critical" />
          </Button>
          <Button variant="ghost" size="icon" aria-label="Alternar tema claro e escuro" onClick={toggleTheme}>
            <Sun className="dark:hidden" />
            <Moon className="hidden dark:block" />
          </Button>
          <Button variant="outline" className="hidden sm:inline-flex">
            <CalendarClock /> Hoje, 19h–21h <ChevronDown className="text-muted-foreground" />
          </Button>
          <Button onClick={run} disabled={running}>
            {running ? <Sparkles className="animate-pulse" /> : started ? <RotateCcw /> : <Play />}
            {running ? "Agentes trabalhando" : started ? "Rodar de novo" : "Rodar agentes"}
          </Button>
        </header>

        <div className="space-y-4 px-4 py-6 sm:px-8">
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className={cn("size-1.5 rounded-full", live ? "bg-success" : "bg-muted-foreground")} />
            {live
              ? `Agentes conectados ao Claude (${model})`
              : "Modo simulado: os agentes usam lógica local. Adicione ANTHROPIC_API_KEY para usar o Claude."}
          </p>

          {error && (
            <p role="alert" className="flex items-center gap-2 rounded-lg border border-critical/40 bg-critical-soft px-4 py-3 text-sm text-critical">
              <TriangleAlert className="size-4" /> {error}
            </p>
          )}

          {/* linha 1: operação */}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Card className="gap-4">
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">Taxa de atraso</CardTitle>
                <CardAction><Button variant="outline" size="sm">Detalhes</Button></CardAction>
                <Metric value={`${n1(overview.lateRatePct)}%`} delta={<Delta tone="bad">{signed(overview.lateRatePct - baseline)} p.p.</Delta>} />
              </CardHeader>
              <CardContent className="space-y-4">
                <LineChart values={timeline.overall.map((b) => b.ratePct)} labels={timeline.labels} baseline={baseline} />
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="w-4 border-t border-dashed border-muted-foreground" /> média dos últimos 14 dias, {n1(baseline)}%
                </p>
                <ul className="space-y-2.5 border-t pt-4 text-sm">
                  <li className="flex items-center gap-2.5"><Package className="size-4 text-muted-foreground" />Pedidos na janela<span className="ml-auto font-medium">{overview.totalOrders}</span></li>
                  <li className="flex items-center gap-2.5"><TriangleAlert className="size-4 text-muted-foreground" />Atrasados<span className="ml-auto font-medium">{overview.lateOrders}</span></li>
                  <li className="flex items-center gap-2.5"><Wallet className="size-4 text-muted-foreground" />Em risco de cupom ou cancelamento<span className="ml-auto font-medium">{brl(overview.gmvAtRisk)}</span></li>
                </ul>
              </CardContent>
            </Card>

            <Card className="gap-4">
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">Tempo médio de entrega</CardTitle>
                <CardAction><Button variant="outline" size="sm">Detalhes</Button></CardAction>
                <Metric value={`${n1(stages.totalMin)} min`} delta={<Delta tone="bad">{signed(stages.totalMin - stages.promisedMin)} min</Delta>} />
              </CardHeader>
              <CardContent className="flex flex-1 flex-col">
                <p className="text-xs text-muted-foreground">Prometido ao cliente: {n1(stages.promisedMin)} min em média</p>
                <div className="mt-4 grid flex-1 grid-cols-3 divide-x border-t pt-4">
                  {stages.stages.map((s, i) => (
                    <div key={s.key} className={cn("flex flex-col", i > 0 && "pl-3", i < 2 && "pr-3")}>
                      <span className="text-xs text-muted-foreground">{s.label}</span>
                      <span className="mt-1 text-xl font-semibold">{n1(s.min)} min</span>
                      <span className="mt-auto flex items-center gap-1 pt-6 text-xs text-critical">
                        {signed(s.deltaMin)} min <ArrowUpRight className="size-3.5" />
                      </span>
                      <span className="mt-1 text-[11px] text-muted-foreground">vs. o normal</span>
                      <span className={cn("mt-3 h-1.5 rounded-full", stageColor[i])} />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="gap-4 md:col-span-2 xl:col-span-1">
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">Atraso por zona</CardTitle>
                <CardAction><Button variant="outline" size="sm">Detalhes</Button></CardAction>
                <Metric value={`${hotZones.length} zonas`} delta={<Delta tone="bad">acima de 40%</Delta>} />
              </CardHeader>
              <CardContent>
                <Heatmap rows={timeline.zones} labels={timeline.labels} />
              </CardContent>
              <CardFooter className="mt-auto">
                <p className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 rounded-md border px-3 py-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <span className="flex gap-0.5">{["bg-primary/[0.06]", "bg-primary/20", "bg-primary/45", "bg-primary/75", "bg-primary"].map((c) => <i key={c} className={cn("size-2.5 rounded-[2px]", c)} />)}</span>
                    0% a 100% de atraso
                  </span>
                  <span className="flex items-center gap-1"><span className="text-info">●</span> chovendo</span>
                </p>
              </CardFooter>
            </Card>
          </div>

          {/* linha 2: saída dos agentes */}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Card className="gap-4">
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">Alertas do Monitor</CardTitle>
                {monitor && <CardAction><Button variant="outline" size="sm" onClick={() => setShowAllAlerts((v) => !v)}>{showAllAlerts ? "Ver menos" : "Ver todos"}</Button></CardAction>}
                {monitor && <Metric value={`${monitor.alerts.length} alertas`} delta={<Delta tone="bad">{crit} críticos</Delta>} />}
              </CardHeader>
              <CardContent className="flex-1">
                {monitor ? (
                  <>
                    <p className="mb-3 line-clamp-3 text-sm text-muted-foreground">{monitor.summary}</p>
                    <ul className="divide-y border-t">
                      {(showAllAlerts ? monitor.alerts : monitor.alerts.slice(0, 4)).map((a) => (
                        <li key={a.id} className="flex items-start gap-3 py-2.5">
                          <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", SEV[a.severity].dot)} aria-label={SEV[a.severity].label} />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium leading-snug">{a.title}</p>
                            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{a.detail}</p>
                          </div>
                          <span className="shrink-0 text-xs text-muted-foreground"><b className="font-semibold text-foreground">{a.affectedOrders}</b> ped.</span>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : <AgentPending agent="monitor" status={status.monitor} log={lastLog.monitor} />}
              </CardContent>
            </Card>

            <Card className="gap-4">
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">Causas do atraso</CardTitle>
                {diagnostico && topCause && (
                  <Metric value={`${Math.round(topCause.share * 100)}%`} delta={<Delta tone="neutral">{CAT[topCause.category]?.label ?? topCause.category}</Delta>} />
                )}
              </CardHeader>
              <CardContent className="flex-1">
                {diagnostico ? (
                  <>
                    <p className="text-sm text-muted-foreground">{diagnostico.summary}</p>
                    <div className="mt-4 flex h-2 gap-1" role="img" aria-label="Participação de cada causa nos atrasos">
                      {diagnostico.causes.map((c) => (
                        <span key={c.cause} className={cn("rounded-full", CAT[c.category]?.cls ?? "bg-muted-foreground")} style={{ width: `${c.share * 100}%`, minWidth: 6 }} />
                      ))}
                    </div>
                    <Table className="mt-4">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="h-8 pl-0 text-xs">Causa</TableHead>
                          <TableHead className="h-8 text-right text-xs">Atrasos</TableHead>
                          <TableHead className="h-8 pr-0 text-right text-xs">Confiança</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {diagnostico.causes.map((c) => (
                          <TableRow key={c.cause} className="hover:bg-transparent">
                            <TableCell className="whitespace-normal py-2.5 pl-0" title={c.evidence}>
                              <span className="flex items-start gap-2">
                                <i className={cn("mt-1.5 size-2 shrink-0 rounded-full", CAT[c.category]?.cls)} />
                                <span>
                                  <span className="block text-sm">{c.cause}</span>
                                  <span className="line-clamp-2 text-xs text-muted-foreground">{c.evidence}</span>
                                </span>
                              </span>
                            </TableCell>
                            <TableCell className="py-2.5 text-right align-top font-medium">{Math.round(c.share * 100)}%</TableCell>
                            <TableCell className="py-2.5 pr-0 text-right align-top text-muted-foreground">{CONF[c.confidence] ?? c.confidence}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </>
                ) : <AgentPending agent="diagnostico" status={status.diagnostico} log={lastLog.diagnostico} />}
              </CardContent>
            </Card>

            <Card className="gap-4 md:col-span-2 xl:col-span-1">
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">Restaurantes</CardTitle>
                {restaurantes && <Metric value={`${attention} pedem atenção`} delta={<Delta tone="bad">{restaurantes.findings.filter((f) => f.trend === "piorando").length} piorando</Delta>} />}
              </CardHeader>
              <CardContent className="flex-1">
                {restaurantes ? (
                  <>
                    <p className="line-clamp-3 text-sm text-muted-foreground">{restaurantes.summary}</p>
                    <Table className="mt-4">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="h-8 pl-0 text-xs">Restaurante</TableHead>
                          <TableHead className="h-8 text-right text-xs">Hoje</TableHead>
                          <TableHead className="h-8 pr-0 text-right text-xs">14 dias</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {restaurantes.findings.map((f) => (
                          <TableRow key={f.restaurantId} className="hover:bg-transparent">
                            <TableCell className="whitespace-normal py-2.5 pl-0">
                              <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium">
                                {f.restaurantName}
                                {f.trend === "piorando" && <Delta tone="bad">piorando</Delta>}
                                {f.risk === "baixo" && <Delta tone="neutral">pontual</Delta>}
                              </span>
                              <span className="mt-0.5 line-clamp-2 text-xs text-muted-foreground" title={f.pattern}>{f.pattern}</span>
                            </TableCell>
                            <TableCell className="py-2.5 text-right align-top font-medium">{n1(f.lateRateToday)}%</TableCell>
                            <TableCell className="py-2.5 pr-0 text-right align-top">
                              <span className="inline-flex items-center gap-0.5 text-muted-foreground">
                                {n1(f.lateRate14d)}%
                                {f.trend === "piorando" ? <ArrowUpRight className="size-3.5 text-critical" /> : f.trend === "melhorando" ? <ArrowDownRight className="size-3.5 text-success" /> : null}
                              </span>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </>
                ) : <AgentPending agent="restaurantes" status={status.restaurantes} log={lastLog.restaurantes} />}
              </CardContent>
            </Card>
          </div>

          {/* linha 3: plano e relatório */}
          <div className="grid gap-4 xl:grid-cols-3">
            <Card className="gap-4 xl:col-span-2">
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">Plano de ação</CardTitle>
                {acoes && <Metric value={`${acoes.actions.length} ações`} delta={<Delta tone="neutral">{acoes.actions.filter((a) => a.urgency === "agora").length} para agora</Delta>} />}
              </CardHeader>
              <CardContent className="flex-1">
                {acoes ? (
                  <Tabs defaultValue="agora">
                    <TabsList>
                      {(["agora", "hoje", "esta_semana"] as const).map((u) => (
                        <TabsTrigger key={u} value={u}>
                          {u === "agora" ? "Agora" : u === "hoje" ? "Hoje" : "Esta semana"}
                          <span className="ml-1 rounded-full bg-muted px-1.5 text-xs text-muted-foreground">{acoes.actions.filter((a) => a.urgency === u).length}</span>
                        </TabsTrigger>
                      ))}
                    </TabsList>
                    {(["agora", "hoje", "esta_semana"] as const).map((u) => (
                      <TabsContent key={u} value={u} className="mt-2">
                        <ul className="divide-y">
                          {acoes.actions.filter((a) => a.urgency === u).map((a) => (
                            <li key={a.title} className="grid gap-x-6 gap-y-1 py-3.5 sm:grid-cols-[1fr_auto]">
                              <div>
                                <p className="text-sm font-medium">{a.title}</p>
                                <p className="mt-0.5 text-sm text-muted-foreground">{a.description}</p>
                                <p className="mt-1.5 text-xs text-success">{a.expectedImpact}</p>
                              </div>
                              <span className="self-start rounded-md border px-2 py-0.5 text-xs text-muted-foreground">{OWNER[a.owner] ?? a.owner}</span>
                            </li>
                          ))}
                        </ul>
                      </TabsContent>
                    ))}
                  </Tabs>
                ) : <AgentPending agent="acoes" status={status.acoes} log={lastLog.acoes} lines={3} />}
              </CardContent>
            </Card>

            <Card className="gap-4">
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">Relatório da noite</CardTitle>
                {relatorio && <CardAction><Button variant="outline" size="sm" onClick={() => setReportOpen((v) => !v)}>{reportOpen ? "Recolher" : "Ler completo"}</Button></CardAction>}
              </CardHeader>
              <CardContent className="flex-1">
                {relatorio ? (
                  <div className={cn("relative overflow-hidden", !reportOpen && "max-h-80")}>
                    <Markdown text={relatorio.markdown} />
                    {!reportOpen && <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-card to-transparent" />}
                  </div>
                ) : <AgentPending agent="relatorio" status={status.relatorio} log={lastLog.relatorio} lines={3} />}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}

// Markdown mínimo: títulos, listas, negrito e parágrafos.
function inline(t: string) {
  return t.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith("**") ? <strong key={i} className="font-semibold">{p.slice(2, -2)}</strong> : p));
}
function Markdown({ text }: { text: string }) {
  return (
    <div className="space-y-3 text-sm leading-relaxed">
      {text.split(/\n{2,}/).map((b, i) => {
        if (b.startsWith("## ")) return <h3 key={i} className="text-base font-semibold">{b.slice(3)}</h3>;
        const [first, ...rest] = b.split("\n");
        const head = first.startsWith("### ") ? <h4 className="font-medium">{first.slice(4)}</h4> : null;
        const lines = (head ? rest : [first, ...rest]).filter(Boolean);
        const body = lines.length && lines.every((l) => l.startsWith("- "))
          ? <ul className="mt-1 list-disc space-y-1 pl-4 text-muted-foreground marker:text-primary">{lines.map((l, j) => <li key={j}>{inline(l.slice(2))}</li>)}</ul>
          : lines.length ? <p className="text-muted-foreground">{inline(lines.join(" "))}</p> : null;
        return <div key={i}>{head}{body}</div>;
      })}
    </div>
  );
}
