"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowDownRight, ArrowUpRight, Bell, CircleCheck, Database, KeyRound, Moon, Package, Play, RotateCcw, Search,
  Sparkles, Star, Sun, Timer, TriangleAlert, X,
} from "lucide-react";
import type {
  ActionsOutput, AgentId, DiagnosisOutput, MonitorOutput, ReportOutput, RunEvent, SellersOutput,
} from "@/lib/types";
import { dataset, getScenario, periodLabel, scenarios } from "@/lib/data";
import { runPipeline } from "@/lib/agents/orchestrator";
import { hotStates } from "@/lib/agents/agents";
import { MODEL, setApiKey } from "@/lib/agents/llm";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import Sidebar, { AGENT_META, type AgentStatus } from "./Sidebar";
import { Heatmap, LineChart } from "./charts";
import { int, n1, signed } from "./format";

const IDS: AgentId[] = ["monitor", "diagnostico", "vendedores", "acoes", "relatorio"];
const allIdle = () => Object.fromEntries(IDS.map((id) => [id, "aguardando"])) as Record<AgentId, AgentStatus>;
const KEY_STORAGE = "delivery_ops_anthropic_key";

type Outputs = {
  monitor?: MonitorOutput;
  diagnostico?: DiagnosisOutput;
  vendedores?: SellersOutput;
  acoes?: ActionsOutput;
  relatorio?: ReportOutput;
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
    <div className="flex flex-wrap items-center gap-2">
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
  critico: { label: "Crítico", dot: "bg-critical" },
  alto: { label: "Alto", dot: "bg-warning" },
  medio: { label: "Médio", dot: "bg-info" },
};

const CAT: Record<string, { label: string; cls: string }> = {
  transporte: { label: "Transporte", cls: "bg-primary" },
  vendedor: { label: "Vendedor", cls: "bg-warning" },
  prazo: { label: "Prazo prometido", cls: "bg-violet-500" },
  pagamento: { label: "Pagamento", cls: "bg-info" },
  demanda: { label: "Demanda", cls: "bg-info" },
  outro: { label: "Outro", cls: "bg-muted-foreground" },
};

const CONF: Record<string, string> = { alta: "Alta", media: "Média", baixa: "Baixa" };
const OWNER: Record<string, string> = { operacoes: "Operações", logistica: "Logística", comercial: "Comercial", produto: "Produto", atendimento: "Atendimento" };
const URGENCY = [
  { key: "agora", label: "Agora" },
  { key: "esta_semana", label: "Esta semana" },
  { key: "proximo_pico", label: "Próximo pico" },
] as const;

// ───────── página ─────────

export default function Dashboard() {
  const [scenarioId, setScenarioId] = useState(scenarios[0].id);
  const sc = getScenario(scenarioId);
  const [live, setLive] = useState(false);
  const [keyFormOpen, setKeyFormOpen] = useState(false);
  const [keyDraft, setKeyDraft] = useState("");
  const [status, setStatus] = useState(allIdle);
  const [lastLog, setLastLog] = useState<Partial<Record<AgentId, string>>>({});
  const [times, setTimes] = useState<Partial<Record<AgentId, number>>>({});
  const [outputs, setOutputs] = useState<Outputs>({});
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAllAlerts, setShowAllAlerts] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const runId = useRef(0);

  useEffect(() => {
    try {
      const k = localStorage.getItem(KEY_STORAGE);
      if (k) { setApiKey(k); setLive(true); }
    } catch {}
  }, []);

  function saveKey() {
    const k = keyDraft.trim();
    if (!k) return;
    setApiKey(k);
    setLive(true);
    setKeyFormOpen(false);
    setKeyDraft("");
    try { localStorage.setItem(KEY_STORAGE, k); } catch {}
  }

  function removeKey() {
    setApiKey(null);
    setLive(false);
    try { localStorage.removeItem(KEY_STORAGE); } catch {}
  }

  function reset() {
    setStatus(allIdle());
    setLastLog({});
    setTimes({});
    setOutputs({});
    setError(null);
    setReportOpen(false);
    setShowAllAlerts(false);
  }

  function changeScenario(id: string) {
    runId.current++; // descarta eventos de uma execução anterior
    setRunning(false);
    reset();
    setScenarioId(id);
  }

  async function run() {
    const id = ++runId.current;
    reset();
    setRunning(true);
    const apply = (e: RunEvent) => {
      if (id !== runId.current) return;
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
    };
    try {
      // Os agentes rodam no navegador: o site é estático (GitHub Pages).
      await runPipeline(sc, apply);
    } catch (err) {
      if (id === runId.current) setError((prev) => prev ?? (err instanceof Error ? err.message : "Não foi possível rodar os agentes."));
    } finally {
      if (id === runId.current) setRunning(false);
    }
  }

  function toggleTheme() {
    const dark = document.documentElement.classList.toggle("dark");
    try { localStorage.setItem("theme", dark ? "dark" : "light"); } catch {}
  }

  const o = sc.overview;
  const p = sc.stages.period;
  const b = sc.stages.baseline;
  const started = IDS.some((id) => status[id] !== "aguardando");
  const hot = new Set(hotStates(sc).map((s) => s.state));
  const lateDelta = o.lateRatePct - o.baselineLateRatePct;
  const { monitor, diagnostico, vendedores, acoes, relatorio } = outputs;
  const crit = monitor?.alerts.filter((a) => a.severity === "critico").length ?? 0;
  const attention = vendedores?.findings.filter((f) => f.origin === "postagem").length ?? 0;
  const topCause = diagnostico?.causes[0];

  const stages = [
    { label: "Até postar", hint: "pagamento + vendedor", now: p.approve + p.handover, before: b.approve + b.handover, badWhen: "up" as const, bar: "bg-warning" },
    { label: "Transporte", hint: "transportadora → cliente", now: p.transit, before: b.transit, badWhen: "up" as const, bar: "bg-primary" },
    { label: "Prazo prometido", hint: "o que o cliente viu", now: p.promised, before: b.promised, badWhen: "down" as const, bar: "bg-violet-500" },
  ];

  return (
    <div className="flex min-h-dvh bg-surface">
      <Sidebar status={status} times={times} />

      <main className="min-w-0 flex-1">
        {/* cabeçalho */}
        <header className="flex flex-wrap items-center gap-3 border-b bg-background px-4 py-4 sm:px-8">
          <div className="grid size-11 place-items-center rounded-full bg-primary/15 font-semibold text-primary">ML</div>
          <div className="mr-auto min-w-0">
            <h1 className="text-lg font-semibold leading-tight">Olá, Marina</h1>
            <p className="text-sm text-muted-foreground">{sc.title}, {periodLabel(sc.start, sc.end)}</p>
          </div>
          <Button variant="ghost" size="icon" aria-label="Buscar" className="hidden sm:inline-flex"><Search /></Button>
          <Button variant="ghost" size="icon" aria-label="Notificações" className="relative hidden sm:inline-flex">
            <Bell />
            <span className="absolute right-2.5 top-2 size-1.5 rounded-full bg-critical" />
          </Button>
          <Button variant="ghost" size="icon" aria-label="Alternar tema claro e escuro" onClick={toggleTheme}>
            <Sun className="dark:hidden" />
            <Moon className="hidden dark:block" />
          </Button>
          <Select value={scenarioId} onValueChange={changeScenario}>
            <SelectTrigger className="w-[190px]" aria-label="Período analisado">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              {scenarios.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={run} disabled={running}>
            {running ? <Sparkles className="animate-pulse" /> : started ? <RotateCcw /> : <Play />}
            {running ? "Agentes trabalhando" : started ? "Rodar de novo" : "Rodar agentes"}
          </Button>
        </header>

        <div className="space-y-4 px-4 py-6 sm:px-8">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-2">
              <span className={cn("size-1.5 rounded-full", live ? "bg-success" : "bg-muted-foreground")} />
              {live ? `Agentes conectados ao Claude (${MODEL}) com a sua chave` : "Modo simulado: os agentes usam lógica local, sem IA."}
            </span>
            {live ? (
              <button onClick={removeKey} className="underline underline-offset-2 hover:text-foreground">Remover chave</button>
            ) : !keyFormOpen ? (
              <button onClick={() => setKeyFormOpen(true)} className="flex items-center gap-1 font-medium text-primary underline-offset-2 hover:underline">
                <KeyRound className="size-3.5" /> Usar o Claude com a minha chave
              </button>
            ) : null}
          </div>

          {keyFormOpen && !live && (
            <form
              onSubmit={(e) => { e.preventDefault(); saveKey(); }}
              className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-end"
            >
              <label className="flex-1 text-sm">
                <span className="font-medium">Chave da API da Anthropic</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">Fica salva só neste navegador e vai direto para a Anthropic. Este site não tem servidor.</span>
                <input
                  type="password"
                  autoComplete="off"
                  value={keyDraft}
                  onChange={(e) => setKeyDraft(e.target.value)}
                  placeholder="sk-ant-..."
                  className="mt-2 h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                />
              </label>
              <div className="flex gap-2">
                <Button type="button" variant="ghost" onClick={() => setKeyFormOpen(false)}><X /> Cancelar</Button>
                <Button type="submit" disabled={!keyDraft.trim()}>Salvar chave</Button>
              </div>
            </form>
          )}

          {error && (
            <p role="alert" className="flex items-center gap-2 rounded-lg border border-critical/40 bg-critical-soft px-4 py-3 text-sm text-critical">
              <TriangleAlert className="size-4" /> {error}
            </p>
          )}

          {/* linha 1: o período em números */}
          <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Card className="gap-4">
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">Taxa de atraso</CardTitle>
                <Metric
                  value={`${n1(o.lateRatePct)}%`}
                  delta={<Delta tone={lateDelta > 1 ? "bad" : lateDelta < -1 ? "good" : "neutral"}>{signed(lateDelta)} p.p.</Delta>}
                />
              </CardHeader>
              <CardContent className="space-y-4">
                <LineChart weeks={sc.timeline} baseline={o.baselineLateRatePct} />
                <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5"><span className="w-4 border-t border-dashed border-muted-foreground" /> linha de base, {n1(o.baselineLateRatePct)}%</span>
                  <span className="flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-sm bg-muted" /> período analisado</span>
                </p>
                <ul className="space-y-2.5 border-t pt-4 text-sm">
                  <li className="flex items-center gap-2.5"><Package className="size-4 text-muted-foreground" />Pedidos entregues<span className="ml-auto font-medium">{int(o.orders)}</span></li>
                  <li className="flex items-center gap-2.5"><Timer className="size-4 text-muted-foreground" />Atrasados, em média {n1(o.avgDelayLateDays)} dias além<span className="ml-auto font-medium">{int(o.lateOrders)}</span></li>
                  <li className="flex items-center gap-2.5"><Star className="size-4 text-muted-foreground" />Nota média dos clientes<span className="ml-auto font-medium">{n1(o.review)} <span className="font-normal text-muted-foreground">(antes {n1(o.baselineReview)})</span></span></li>
                </ul>
              </CardContent>
            </Card>

            <Card className="gap-4">
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">Tempo até o cliente</CardTitle>
                <Metric value={`${n1(p.total)} dias`} delta={<Delta tone={p.total - b.total > 0.5 ? "bad" : p.total - b.total < -0.5 ? "good" : "neutral"}>{signed(p.total - b.total)} dias</Delta>} />
              </CardHeader>
              <CardContent className="flex flex-1 flex-col">
                <p className="text-xs text-muted-foreground">Comparado com a linha de base, {periodLabel(sc.baseStart, sc.baseEnd)}</p>
                <div className="mt-4 grid flex-1 grid-cols-3 divide-x border-t pt-4">
                  {stages.map((s, i) => {
                    const delta = s.now - s.before;
                    const bad = s.badWhen === "up" ? delta > 0.4 : delta < -0.4;
                    const good = s.badWhen === "up" ? delta < -0.4 : delta > 0.4;
                    return (
                      <div key={s.label} className={cn("flex flex-col", i > 0 && "pl-3", i < 2 && "pr-3")}>
                        <span className="text-xs text-muted-foreground">{s.label}</span>
                        <span className="mt-1 whitespace-nowrap text-lg font-semibold">{n1(s.now)} dias</span>
                        <span className="text-[11px] text-muted-foreground">{s.hint}</span>
                        <span className={cn("mt-auto flex items-center gap-1 pt-6 text-xs", bad ? "text-critical" : good ? "text-success" : "text-muted-foreground")}>
                          {signed(delta)} dias {delta > 0 ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
                        </span>
                        <span className="mt-1 text-[11px] text-muted-foreground">antes {n1(s.before)}</span>
                        <span className={cn("mt-3 h-1.5 rounded-full", s.bar)} />
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            <Card className="gap-4 md:col-span-2 xl:col-span-1">
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">Atraso por estado de destino</CardTitle>
                <Metric
                  value={hot.size ? `${hot.size} ${hot.size === 1 ? "estado" : "estados"}` : "Nenhum estado"}
                  delta={hot.size ? <Delta tone="bad">2x acima do normal</Delta> : <Delta tone="good">fora da curva</Delta>}
                />
              </CardHeader>
              <CardContent>
                <Heatmap rows={sc.heatmap.map((h) => ({ ...h, hot: hot.has(h.state) }))} weeks={sc.timeline} />
              </CardContent>
              <CardFooter className="mt-auto">
                <p className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 rounded-md border px-3 py-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <span className="flex gap-0.5">{["bg-primary/[0.06]", "bg-primary/20", "bg-primary/45", "bg-primary/75", "bg-primary"].map((c) => <i key={c} className={cn("size-2.5 rounded-[2px]", c)} />)}</span>
                    0% a 40%+ de atraso por semana
                  </span>
                  <span>8 estados com mais pedidos</span>
                </p>
              </CardFooter>
            </Card>
          </div>

          {/* linha 2: saída dos agentes */}
          <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Card className="gap-4">
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">Alertas do Monitor</CardTitle>
                {monitor && monitor.alerts.length > 4 && (
                  <CardAction><Button variant="outline" size="sm" onClick={() => setShowAllAlerts((v) => !v)}>{showAllAlerts ? "Ver menos" : "Ver todos"}</Button></CardAction>
                )}
                {monitor && (
                  <Metric
                    value={monitor.alerts.length ? `${monitor.alerts.length} alertas` : "Sem alertas"}
                    delta={monitor.alerts.length ? <Delta tone="bad">{crit} críticos</Delta> : <Delta tone="good">operação normal</Delta>}
                  />
                )}
              </CardHeader>
              <CardContent className="flex-1">
                {monitor ? (
                  <>
                    <p className="mb-3 line-clamp-3 text-sm text-muted-foreground">{monitor.summary}</p>
                    {monitor.alerts.length ? (
                      <ul className="divide-y border-t">
                        {(showAllAlerts ? monitor.alerts : monitor.alerts.slice(0, 4)).map((a) => (
                          <li key={a.id} className="flex items-start gap-3 py-2.5">
                            <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", SEV[a.severity].dot)} aria-label={SEV[a.severity].label} />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium leading-snug">{a.title}</p>
                              <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{a.detail}</p>
                            </div>
                            <span className="shrink-0 text-xs text-muted-foreground"><b className="font-semibold text-foreground">{int(a.affectedOrders)}</b> ped.</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="flex items-center gap-2 rounded-lg bg-success-soft px-3 py-3 text-sm text-success">
                        <CircleCheck className="size-4" /> Nenhum indicador fora do normal.
                      </p>
                    )}
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
                            <TableCell className="whitespace-normal py-2.5 pl-0">
                              <span className="flex items-start gap-2">
                                <i className={cn("mt-1.5 size-2 shrink-0 rounded-full", CAT[c.category]?.cls)} />
                                <span>
                                  <span className="block text-sm">{c.cause}</span>
                                  <span className="line-clamp-2 text-xs text-muted-foreground" title={c.evidence}>{c.evidence}</span>
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
                <CardTitle className="text-sm font-medium text-muted-foreground">Vendedores</CardTitle>
                {vendedores && (
                  <Metric
                    value={attention ? `${attention} ${attention === 1 ? "pede" : "pedem"} contato` : "Nenhum contato"}
                    delta={<Delta tone={attention ? "bad" : "good"}>{attention ? "atraso na postagem" : "postagens no prazo"}</Delta>}
                  />
                )}
              </CardHeader>
              <CardContent className="flex-1">
                {vendedores ? (
                  <>
                    <p className="line-clamp-3 text-sm text-muted-foreground">{vendedores.summary}</p>
                    {vendedores.findings.length > 0 && (
                      <Table className="mt-4">
                        <TableHeader>
                          <TableRow>
                            <TableHead className="h-8 pl-0 text-xs">Vendedor</TableHead>
                            <TableHead className="h-8 text-right text-xs">Agora</TableHead>
                            <TableHead className="h-8 pr-0 text-right text-xs">90 dias</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {vendedores.findings.map((f) => (
                            <TableRow key={f.sellerId} className="hover:bg-transparent">
                              <TableCell className="whitespace-normal py-2.5 pl-0">
                                <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium">
                                  <span className="font-mono text-[13px]">{f.sellerId}</span>
                                  <span className="text-xs font-normal text-muted-foreground">{f.state}</span>
                                  {f.origin === "postagem" ? <Delta tone="bad">postagem</Delta> : <Delta tone="neutral">transporte</Delta>}
                                </span>
                                <span className="mt-0.5 line-clamp-2 text-xs text-muted-foreground" title={f.pattern}>{f.pattern}</span>
                              </TableCell>
                              <TableCell className="py-2.5 text-right align-top font-medium">{n1(f.lateRateNow)}%</TableCell>
                              <TableCell className="py-2.5 pr-0 text-right align-top">
                                <span className="inline-flex items-center gap-0.5 text-muted-foreground">
                                  {f.lateRate90d === null ? "–" : `${n1(f.lateRate90d)}%`}
                                  {f.trend === "piorando" ? <ArrowUpRight className="size-3.5 text-critical" /> : f.trend === "melhorando" ? <ArrowDownRight className="size-3.5 text-success" /> : null}
                                </span>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </>
                ) : <AgentPending agent="vendedores" status={status.vendedores} log={lastLog.vendedores} />}
              </CardContent>
            </Card>
          </div>

          {/* linha 3: plano e relatório */}
          <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-3">
            <Card className="gap-4 xl:col-span-2">
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">Plano de ação</CardTitle>
                {acoes && (
                  <Metric
                    value={`${acoes.actions.length} ações`}
                    delta={<Delta tone="neutral">{acoes.actions.filter((a) => a.urgency === "agora").length} para agora</Delta>}
                  />
                )}
              </CardHeader>
              <CardContent className="flex-1">
                {acoes ? (
                  <Tabs key={sc.id + acoes.actions.length} defaultValue={acoes.actions.some((a) => a.urgency === "agora") ? "agora" : "esta_semana"}>
                    <TabsList className="w-full sm:w-fit">
                      {URGENCY.map((u) => (
                        <TabsTrigger key={u.key} value={u.key}>
                          {u.label}
                          <span className="ml-1 hidden rounded-full sm:inline bg-muted px-1.5 text-xs text-muted-foreground">{acoes.actions.filter((a) => a.urgency === u.key).length}</span>
                        </TabsTrigger>
                      ))}
                    </TabsList>
                    {URGENCY.map((u) => {
                      const items = acoes.actions.filter((a) => a.urgency === u.key);
                      return (
                        <TabsContent key={u.key} value={u.key} className="mt-2">
                          {items.length ? (
                            <ul className="divide-y">
                              {items.map((a) => (
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
                          ) : (
                            <p className="py-6 text-sm text-muted-foreground">Nenhuma ação com essa urgência.</p>
                          )}
                        </TabsContent>
                      );
                    })}
                  </Tabs>
                ) : <AgentPending agent="acoes" status={status.acoes} log={lastLog.acoes} lines={3} />}
              </CardContent>
            </Card>

            <Card className="gap-4">
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">Relatório do período</CardTitle>
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

          <footer className="flex flex-wrap items-center gap-x-2 gap-y-1 pt-2 text-xs text-muted-foreground">
            <Database className="size-3.5" />
            Dados reais de {int(dataset.source.deliveredOrders)} pedidos entregues:
            <a href={dataset.source.url} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-foreground">{dataset.source.name}</a>
            ({dataset.source.license}). Ids de vendedores anonimizados pela própria base.
          </footer>
        </div>
      </main>
    </div>
  );
}

// Markdown mínimo: títulos, listas, negrito e parágrafos.
function inline(t: string) {
  return t.split(/(\*\*[^*]+\*\*)/g).map((part, i) => (part.startsWith("**") ? <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong> : part));
}
function Markdown({ text }: { text: string }) {
  return (
    <div className="space-y-3 text-sm leading-relaxed">
      {text.split(/\n{2,}/).map((blk, i) => {
        if (blk.startsWith("## ")) return <h3 key={i} className="text-base font-semibold">{blk.slice(3)}</h3>;
        const [first, ...rest] = blk.split("\n");
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
