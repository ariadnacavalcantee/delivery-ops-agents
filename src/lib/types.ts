export type Zone = {
  id: string;
  name: string;
  raining: boolean;
  activeCouriers: number;
  openOrders: number;
};

export type Restaurant = {
  id: string;
  name: string;
  cuisine: string;
  zoneId: string;
  basePrepMin: number;
  rating: number;
};

export type Order = {
  id: string;
  restaurantId: string;
  zoneId: string;
  placedAt: string; // ISO
  promisedMin: number; // tempo prometido ao cliente
  prepMin: number; // tempo real de preparo
  pickupWaitMin: number; // entregador esperando no restaurante ou restaurante esperando entregador
  courierAssignMin: number; // tempo até achar entregador
  travelMin: number;
  distanceKm: number;
  totalMin: number;
  delayMin: number; // totalMin - promisedMin (positivo = atrasado)
  value: number;
  addressIssue: boolean;
  status: "entregue" | "em_rota" | "preparando";
};

export type RestaurantHistory = {
  restaurantId: string;
  days: { date: string; orders: number; lateRate: number; avgPrepMin: number; cancellations: number }[];
};

export type Operation = {
  city: string;
  window: string;
  generatedAt: string;
  zones: Zone[];
  restaurants: Restaurant[];
  orders: Order[];
  history: RestaurantHistory[];
};

// ---- Saídas dos agentes ----

export type Alert = {
  id: string;
  severity: "critico" | "alto" | "medio";
  title: string;
  detail: string;
  zoneId?: string;
  restaurantId?: string;
  affectedOrders: number;
};

export type MonitorOutput = {
  summary: string;
  lateOrders: number;
  lateRate: number;
  avgDelayMin: number;
  alerts: Alert[];
};

export type Cause = {
  cause: string;
  category: "cozinha" | "entregador" | "clima" | "demanda" | "endereco" | "outro";
  share: number; // 0-1 dos atrasos explicados
  evidence: string;
  confidence: "alta" | "media" | "baixa";
};

export type DiagnosisOutput = {
  summary: string;
  causes: Cause[];
};

export type RestaurantFinding = {
  restaurantId: string;
  restaurantName: string;
  pattern: string;
  trend: "piorando" | "estavel" | "melhorando";
  lateRate14d: number;
  lateRateToday: number;
  risk: "alto" | "medio" | "baixo";
};

export type RestaurantsOutput = {
  summary: string;
  findings: RestaurantFinding[];
};

export type Action = {
  title: string;
  description: string;
  owner: "operacoes" | "logistica" | "comercial" | "produto";
  urgency: "agora" | "hoje" | "esta_semana";
  expectedImpact: string;
  target?: string;
};

export type ActionsOutput = {
  summary: string;
  actions: Action[];
};

export type ReportOutput = {
  markdown: string;
};

export type AgentId = "monitor" | "diagnostico" | "restaurantes" | "acoes" | "relatorio";

export type RunEvent =
  | { type: "run_start"; mode: "live" | "simulado"; model?: string }
  | { type: "agent_start"; agent: AgentId }
  | { type: "agent_log"; agent: AgentId; message: string }
  | { type: "agent_done"; agent: AgentId; output: unknown; ms: number; tokens?: number }
  | { type: "agent_error"; agent: AgentId; message: string }
  | { type: "run_done"; ms: number };
