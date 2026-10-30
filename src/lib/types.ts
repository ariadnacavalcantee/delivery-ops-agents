// ───────── Dados (gerados por scripts/build_data.py a partir da base pública da Olist) ─────────

export type StageBlock = { approve: number; handover: number; transit: number; total: number; promised: number };

export type StateStat = {
  state: string;
  orders: number;
  lateRatePct: number;
  baselineLateRatePct: number | null;
  transitDays: number;
  baselineTransitDays: number | null;
  promisedDays: number;
  baselinePromisedDays: number | null;
  review: number | null;
};

export type SellerStat = {
  sellerId: string;
  state: string;
  orders: number;
  lateRatePct: number;
  postedLatePct: number; // postou depois do limite combinado
  handoverDays: number;
  outsideSpPct: number;
  orders90d: number;
  lateRate90dPct: number | null;
  postedLate90dPct: number | null;
};

export type Scenario = {
  id: string;
  label: string;
  title: string;
  start: string;
  end: string;
  baseStart: string;
  baseEnd: string;
  overview: {
    orders: number;
    lateOrders: number;
    lateRatePct: number;
    baselineLateRatePct: number;
    avgDelayLateDays: number;
    review: number;
    baselineReview: number;
    reviewLate: number;
    reviewOnTime: number;
    sellerLatePct: number;
    baselineSellerLatePct: number;
  };
  stages: { period: StageBlock; baseline: StageBlock };
  causes: { component: string; lateOrders: number; sharePct: number }[];
  timeline: { week: string; label: string; inPeriod: boolean; orders: number; lateRatePct: number }[];
  states: StateStat[];
  heatmap: { state: string; cells: number[] }[];
  sellers: SellerStat[];
};

export type Dataset = {
  source: { name: string; url: string; license: string; deliveredOrders: number; reviewLate: number; reviewOnTime: number };
  scenarios: Scenario[];
};

// ───────── Saídas dos agentes ─────────

export type Alert = {
  id: string;
  severity: "critico" | "alto" | "medio";
  title: string;
  detail: string;
  affectedOrders: number;
};

export type MonitorOutput = {
  summary: string;
  lateOrders: number;
  lateRate: number;
  alerts: Alert[];
};

export type Cause = {
  cause: string;
  category: "transporte" | "vendedor" | "prazo" | "pagamento" | "demanda" | "outro";
  share: number; // 0-1 dos atrasos explicados
  evidence: string;
  confidence: "alta" | "media" | "baixa";
};

export type DiagnosisOutput = { summary: string; causes: Cause[] };

export type SellerFinding = {
  sellerId: string;
  state: string;
  pattern: string;
  origin: "postagem" | "transporte";
  trend: "piorando" | "estavel" | "melhorando";
  lateRate90d: number | null;
  lateRateNow: number;
  risk: "alto" | "medio" | "baixo";
};

export type SellersOutput = { summary: string; findings: SellerFinding[] };

export type Action = {
  title: string;
  description: string;
  owner: "operacoes" | "logistica" | "comercial" | "produto" | "atendimento";
  urgency: "agora" | "esta_semana" | "proximo_pico";
  expectedImpact: string;
  target?: string;
};

export type ActionsOutput = { summary: string; actions: Action[] };

export type ReportOutput = { markdown: string };

export type AgentId = "monitor" | "diagnostico" | "vendedores" | "acoes" | "relatorio";

export type RunEvent =
  | { type: "run_start"; mode: "live" | "simulado"; model?: string }
  | { type: "agent_start"; agent: AgentId }
  | { type: "agent_log"; agent: AgentId; message: string }
  | { type: "agent_done"; agent: AgentId; output: unknown; ms: number; tokens?: number }
  | { type: "agent_error"; agent: AgentId; message: string }
  | { type: "run_done"; ms: number };
