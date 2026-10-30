import type {
  ActionsOutput, AgentId, Alert, Cause, DiagnosisOutput, MonitorOutput, ReportOutput, Scenario,
  SellerFinding, SellersOutput, Action,
} from "../types";
import { periodLabel } from "../data";
import { callJSON } from "./llm";

export type Ctx = {
  sc: Scenario;
  monitor?: MonitorOutput;
  diagnostico?: DiagnosisOutput;
  vendedores?: SellersOutput;
  acoes?: ActionsOutput;
  relatorio?: ReportOutput;
};

export type Log = (msg: string) => void;

export type AgentDef = {
  id: AgentId;
  run: (ctx: Ctx, live: boolean, log: Log) => Promise<{ output: unknown; tokens?: number }>;
};

const r1 = (n: number) => Math.round(n * 10) / 10;
const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} e ${xs[xs.length - 1]}`);

// Estados que pioraram de verdade: volume relevante e atraso pelo menos 2x a linha de base.
export function hotStates(sc: Scenario) {
  return sc.states
    .filter((s) => s.orders >= 100 && s.lateRatePct >= 20 && s.lateRatePct >= 2 * (s.baselineLateRatePct ?? 0))
    .sort((a, b) => b.lateRatePct - a.lateRatePct);
}

// Dados enviados ao modelo: só o que importa, nada de pedidos crus.
function compact(sc: Scenario) {
  return {
    periodo: periodLabel(sc.start, sc.end),
    linhaDeBase: periodLabel(sc.baseStart, sc.baseEnd),
    visaoGeral: sc.overview,
    etapasEmDias: sc.stages,
    causasPorPedido: sc.causes,
    semanas: sc.timeline.map((t) => ({ semana: t.label, noPeriodo: t.inPeriod, atrasoPct: t.lateRatePct })),
    estados: sc.states.slice(0, 14),
    vendedores: sc.sellers.slice(0, 15),
  };
}

// ───────────────────────── Agente 1 · Monitor ─────────────────────────
function detectAlerts(sc: Scenario): Alert[] {
  const o = sc.overview;
  const p = sc.stages.period;
  const b = sc.stages.baseline;
  const alerts: Alert[] = [];

  if (o.lateRatePct >= 10 && o.lateRatePct >= 2 * o.baselineLateRatePct)
    alerts.push({
      id: "geral", severity: "critico", affectedOrders: o.lateOrders,
      title: `Atraso ${r1(o.lateRatePct / o.baselineLateRatePct)}x acima do normal`,
      detail: `${o.lateRatePct}% dos pedidos chegaram depois da data prometida, contra ${o.baselineLateRatePct}% na linha de base.`,
    });

  const dt = p.transit - b.transit;
  if (dt >= 2)
    alerts.push({
      id: "transporte", severity: dt >= 3 ? "critico" : "alto", affectedOrders: o.lateOrders,
      title: `Transporte ${r1(dt)} dias mais lento`,
      detail: `Da transportadora até o cliente: ${p.transit} dias em média, contra ${b.transit} na linha de base.`,
    });

  for (const s of hotStates(sc).slice(0, 3))
    alerts.push({
      id: `estado-${s.state}`, severity: s.lateRatePct >= 35 ? "critico" : "alto",
      affectedOrders: Math.round((s.orders * s.lateRatePct) / 100),
      title: `${s.state}: ${s.lateRatePct}% dos pedidos atrasados`,
      detail: `Era ${s.baselineLateRatePct}% na linha de base. Transporte para o estado em ${s.transitDays} dias (antes ${s.baselineTransitDays}).`,
    });

  if (o.sellerLatePct - o.baselineSellerLatePct >= 4)
    alerts.push({
      id: "postagem", severity: "alto", affectedOrders: Math.round((o.orders * o.sellerLatePct) / 100),
      title: "Vendedores postando fora do prazo",
      detail: `${o.sellerLatePct}% dos pedidos foram entregues à transportadora depois do limite, contra ${o.baselineSellerLatePct}% antes.`,
    });

  if (b.promised - p.promised >= 2 && o.lateRatePct > o.baselineLateRatePct)
    alerts.push({
      id: "prazo", severity: "medio", affectedOrders: o.lateOrders,
      title: `Prazo prometido encurtou ${r1(b.promised - p.promised)} dias`,
      detail: `A estimativa mostrada ao cliente caiu de ${b.promised} para ${p.promised} dias enquanto o transporte ficou mais lento.`,
    });

  if (o.baselineReview - o.review >= 0.3)
    alerts.push({
      id: "nota", severity: "medio", affectedOrders: o.lateOrders,
      title: `Nota média caiu para ${o.review}`,
      detail: `Era ${o.baselineReview}. Pedidos atrasados recebem nota ${o.reviewLate}; no prazo, ${o.reviewOnTime}.`,
    });

  const badSellers = sc.sellers.filter((s) => s.lateRatePct >= 40 && s.postedLatePct >= 30);
  if (badSellers.length)
    alerts.push({
      id: "vendedores", severity: "medio", affectedOrders: badSellers.reduce((n, s) => n + Math.round((s.orders * s.lateRatePct) / 100), 0),
      title: `${badSellers.length} ${badSellers.length > 1 ? "vendedores" : "vendedor"} com atraso acima de 40% por postagem`,
      detail: `${list(badSellers.map((s) => `${s.sellerId} (${s.state})`))} postam depois do limite na maioria dos pedidos.`,
    });

  const rank = { critico: 0, alto: 1, medio: 2 };
  return alerts.sort((a, b2) => rank[a.severity] - rank[b2.severity]);
}

const monitor: AgentDef = {
  id: "monitor",
  async run(ctx, live, log) {
    const o = ctx.sc.overview;
    log(`Lendo ${o.orders.toLocaleString("pt-BR")} pedidos entregues entre ${periodLabel(ctx.sc.start, ctx.sc.end)}`);
    const alerts = detectAlerts(ctx.sc);
    log(`${o.lateOrders} atrasados (${o.lateRatePct}%), ${alerts.length} alertas detectados por regra`);
    const base = { lateOrders: o.lateOrders, lateRate: o.lateRatePct };

    if (!live) {
      const summary = alerts.length
        ? `${o.lateRatePct}% dos pedidos chegaram atrasados, contra ${o.baselineLateRatePct}% na linha de base. ${alerts.filter((a) => a.severity === "critico").length} alertas críticos, puxados por ${alerts[0].title.toLowerCase()}.`
        : o.lateRatePct < o.baselineLateRatePct
          ? `Operação recuperada: ${o.lateRatePct}% de atraso, abaixo dos ${o.baselineLateRatePct}% das semanas anteriores. Nenhum alerta.`
          : `Operação dentro do normal: ${o.lateRatePct}% de atraso. Nenhum alerta.`;
      return { output: { ...base, alerts, summary } satisfies MonitorOutput };
    }
    log("Pedindo ao modelo para priorizar os alertas");
    const { data, tokens } = await callJSON<{ summary: string; order: string[] }>({
      system: "Você é o Agente Monitor. Recebe os indicadores de um período e os alertas detectados por regras. Reordene os alertas pelo impacto na operação e escreva um resumo de 2 frases para a gestora. Se não houver alertas, diga se a operação está normal ou se recuperou.",
      input: { visaoGeral: ctx.sc.overview, alertas: alerts },
      schemaHint: `{"summary": string, "order": string[] /* ids dos alertas em ordem de prioridade */}`,
    });
    const sorted = data.order.map((id) => alerts.find((a) => a.id === id)).filter(Boolean) as Alert[];
    const rest = alerts.filter((a) => !data.order.includes(a.id));
    return { output: { ...base, summary: data.summary, alerts: [...sorted, ...rest] } satisfies MonitorOutput, tokens };
  },
};

// ───────────────────────── Agente 2 · Diagnóstico ─────────────────────────
const CAUSE_CAT: Record<string, Cause["category"]> = {
  transporte: "transporte", postagem_do_vendedor: "vendedor", prazo_prometido_curto: "prazo", aprovacao_do_pagamento: "pagamento",
};

const diagnostico: AgentDef = {
  id: "diagnostico",
  async run(ctx, live, log) {
    const { sc } = ctx;
    const o = sc.overview, p = sc.stages.period, b = sc.stages.baseline;
    log(`Separando ${o.lateOrders} atrasos em aprovação, postagem, transporte e prazo prometido`);

    if (!live) {
      const hot = hotStates(sc).slice(0, 4);
      const evidence: Record<string, string> = {
        transporte: `Transporte médio de ${b.transit} para ${p.transit} dias.` + (hot.length ? ` Pior em ${list(hot.map((s) => `${s.state} (${s.lateRatePct}%)`))}.` : " Sem estado fora da curva."),
        vendedor: `Postagem fora do limite em ${o.sellerLatePct}% dos pedidos (antes ${o.baselineSellerLatePct}%). Tempo até postar: ${b.handover} → ${p.handover} dias.`,
        prazo: `Prazo prometido médio de ${b.promised} para ${p.promised} dias.`,
        pagamento: `Aprovação do pagamento em ${p.approve} dias (antes ${b.approve}).`,
      };
      const causes: Cause[] = sc.causes
        .filter((c) => c.sharePct >= 1)
        .map((c) => {
          const cat = CAUSE_CAT[c.component] ?? "outro";
          // o rótulo só fala em piora quando a etapa piorou de fato
          const label = {
            transporte: p.transit > b.transit + 0.5 ? "Transporte mais lento até o cliente" : "Transporte (atrasos pontuais)",
            vendedor: o.sellerLatePct > o.baselineSellerLatePct + 2 ? "Vendedores demorando para postar" : "Postagem do vendedor",
            prazo: b.promised - p.promised >= 1 ? "Prazo prometido curto demais" : "Prazo prometido apertado em casos isolados",
            pagamento: "Demora na aprovação do pagamento",
          }[cat as string] ?? c.component;
          return {
            cause: label, category: cat, share: Math.round(c.sharePct * 10) / 1000, evidence: evidence[cat] ?? "",
            confidence: c.sharePct >= 40 ? "alta" : c.sharePct >= 10 ? "media" : "baixa",
          };
        });
      const top = causes[0];
      const recovering = o.lateRatePct < o.baselineLateRatePct;
      const summary = recovering
        ? `Os atrasos caíram e o transporte voltou a ${p.transit} dias. Os poucos atrasos restantes seguem concentrados no transporte, sem padrão novo.`
        : top.category === "transporte" && o.sellerLatePct - o.baselineSellerLatePct >= 4
          ? `Duas coisas ao mesmo tempo: o transporte ficou ${r1(p.transit - b.transit)} dias mais lento e os vendedores passaram a postar fora do prazo com mais frequência. O transporte explica a maior parte.`
          : top.category === "transporte"
            ? `O problema está depois do vendedor: ele postou no prazo de sempre, mas o transporte ficou ${r1(p.transit - b.transit)} dias mais lento${b.promised - p.promised >= 2 ? `, e o prazo prometido ainda encurtou ${r1(b.promised - p.promised)} dias` : ""}.`
            : `A principal causa é ${top.cause.toLowerCase()}.`;
      return { output: { summary, causes } satisfies DiagnosisOutput };
    }
    log("Cruzando etapas da entrega com estados e vendedores");
    const { data, tokens } = await callJSON<DiagnosisOutput>({
      system: "Você é o Agente de Diagnóstico de um marketplace. Descubra as causas-raiz dos atrasos comparando o período com a linha de base. Diferencie: transporte (transportadora até o cliente), vendedor (demora para postar), prazo prometido curto demais e aprovação do pagamento. Use causasPorPedido para as participações. Para cada causa, traga evidência numérica e confiança. Se o período estiver melhor que a linha de base, diga isso.",
      input: compact(sc),
      schemaHint: `{"summary": string, "causes": [{"cause": string, "category": "transporte"|"vendedor"|"prazo"|"pagamento"|"demanda"|"outro", "share": number /* 0 a 1 */, "evidence": string, "confidence": "alta"|"media"|"baixa"}]}`,
    });
    return { output: data, tokens };
  },
};

// ───────────────────────── Agente 3 · Vendedores ─────────────────────────
const RISK_ORDER = { alto: 0, medio: 1, baixo: 2 };

const vendedores: AgentDef = {
  id: "vendedores",
  async run(ctx, live, log) {
    const { sc } = ctx;
    log(`Comparando ${sc.sellers.length} vendedores com volume no período com os 90 dias anteriores`);

    if (!live) {
      const findings: SellerFinding[] = sc.sellers
        .map((s): SellerFinding | null => {
          const origin = s.postedLatePct >= 30 ? "postagem" : "transporte";
          const hasHist = s.orders90d >= 15 && s.lateRate90dPct !== null;
          const delta = hasHist ? s.lateRatePct - (s.lateRate90dPct as number) : 0;
          const trend: SellerFinding["trend"] = !hasHist ? "estavel" : delta > 15 ? "piorando" : delta < -10 ? "melhorando" : "estavel";
          const chronic = hasHist && (s.lateRate90dPct as number) >= 15;
          if (!(s.lateRatePct >= 30 || (chronic && s.lateRatePct >= 15))) return null;

          let pattern: string;
          if (origin === "postagem")
            pattern = `Postou depois do limite em ${s.postedLatePct}% dos pedidos (${s.handoverDays} dias até postar). ` +
              (chronic ? `Já atrasava ${s.lateRate90dPct}% antes: problema crônico.` : hasHist ? `Antes atrasava só ${s.lateRate90dPct}%: problema novo no período.` : "Sem histórico suficiente antes do período.");
          else
            pattern = `Postou no prazo (${s.postedLatePct}% fora do limite), mas ${s.outsideSpPct}% das vendas foram para fora de SP. O atraso vem do transporte, não do vendedor.`;

          const risk: SellerFinding["risk"] = origin === "postagem" ? (chronic || trend === "piorando" || s.lateRatePct >= 50 ? "alto" : "medio") : "baixo";
          return {
            sellerId: s.sellerId, state: s.state, pattern, origin, trend,
            lateRate90d: hasHist ? s.lateRate90dPct : null, lateRateNow: s.lateRatePct, risk,
          };
        })
        .filter((f): f is SellerFinding => f !== null)
        .sort((a, b) => RISK_ORDER[a.risk] - RISK_ORDER[b.risk] || b.lateRateNow - a.lateRateNow)
        .slice(0, 6);

      const byPost = findings.filter((f) => f.origin === "postagem").length;
      const byTransit = findings.length - byPost;
      const summary = !findings.length
        ? "Nenhum vendedor com atraso fora do normal neste período."
        : `${byPost} ${byPost === 1 ? "vendedor atrasa" : "vendedores atrasam"} por demora na postagem e ${byPost === 1 ? "precisa" : "precisam"} de contato. ${byTransit ? `Em outros ${byTransit}, o atraso vem do transporte e não é culpa deles.` : ""}`.trim();
      return { output: { summary, findings } satisfies SellersOutput };
    }
    log("Classificando vendedores: atraso na postagem ou no transporte");
    const { data, tokens } = await callJSON<SellersOutput>({
      system: "Você é o Agente de Vendedores. Para os vendedores com atraso relevante, diga se o atraso nasce na postagem (postedLatePct alto: culpa do vendedor) ou no transporte (postou no prazo, mas vende para regiões afetadas). Compare com os 90 dias anteriores para separar problema crônico, problema novo e pico pontual. Use o id curto do vendedor. Máximo de 6 vendedores, do maior risco para o menor.",
      input: { periodo: periodLabel(sc.start, sc.end), vendedores: sc.sellers.slice(0, 20), estadosMaisAfetados: hotStates(sc).map((s) => s.state) },
      schemaHint: `{"summary": string, "findings": [{"sellerId": string, "state": string, "pattern": string, "origin": "postagem"|"transporte", "trend": "piorando"|"estavel"|"melhorando", "lateRate90d": number|null, "lateRateNow": number, "risk": "alto"|"medio"|"baixo"}]}`,
    });
    return { output: data, tokens };
  },
};

// ───────────────────────── Agente 4 · Ações ─────────────────────────
const acoes: AgentDef = {
  id: "acoes",
  async run(ctx, live, log) {
    const { sc } = ctx;
    const o = sc.overview, p = sc.stages.period, b = sc.stages.baseline;
    log("Lendo diagnóstico e análise de vendedores");

    if (!live) {
      const hot = hotStates(sc).slice(0, 4).map((s) => s.state);
      const postSellers = ctx.vendedores?.findings.filter((f) => f.origin === "postagem").map((f) => f.sellerId) ?? [];
      const actions: Action[] = [];
      log("Priorizando por urgência e impacto");

      if (p.transit - b.transit >= 2) {
        actions.push({
          title: `Cobrar as transportadoras nas rotas para ${list(hot.length ? hot : ["os estados mais afetados"])}`,
          description: "Levar os números de transporte por estado e pedir plano de normalização, ou redistribuir volume para outra transportadora nessas rotas.",
          owner: "logistica", urgency: "agora", expectedImpact: `Trazer o transporte de volta para perto de ${b.transit} dias.`, target: hot.join(", "),
        });
        actions.push({
          title: `Ampliar o prazo exibido para ${list(hot.length ? hot : ["as rotas afetadas"])}`,
          description: "Enquanto o transporte não normaliza, prometer um prazo realista no checkout. Atraso que o cliente já esperava não vira nota baixa.",
          owner: "produto", urgency: "agora", expectedImpact: "Menos pedidos marcados como atrasados e menos reclamações.", target: hot.join(", "),
        });
      }
      if (o.lateRatePct >= 10)
        actions.push({
          title: "Avisar os clientes de pedidos atrasados antes que reclamem",
          description: "Mensagem proativa com a nova previsão para cada pedido que passou da data estimada.",
          owner: "atendimento", urgency: "agora", expectedImpact: `Proteger a nota: pedidos atrasados recebem ${o.reviewLate}, no prazo ${o.reviewOnTime}.`,
        });
      if (b.promised - p.promised >= 2)
        actions.push({
          title: "Revisar o cálculo do prazo prometido",
          description: `O prazo médio caiu de ${b.promised} para ${p.promised} dias justamente quando o transporte desacelerou. Incluir o tempo de transporte recente por estado na estimativa.`,
          owner: "produto", urgency: "esta_semana", expectedImpact: "Estimativa que acompanha a realidade da rota.",
        });
      if (postSellers.length)
        actions.push({
          title: `Contato com vendedores que postam fora do prazo: ${list(postSellers)}`,
          description: "Mostrar os pedidos postados depois do limite e combinar um plano. Para reincidentes, reduzir a exposição até normalizar.",
          owner: "comercial", urgency: "esta_semana", expectedImpact: "Menos atraso que nasce antes da transportadora.", target: postSellers.join(", "),
        });
      if (o.sellerLatePct - o.baselineSellerLatePct >= 4)
        actions.push({
          title: "Plano de capacidade com vendedores antes do próximo pico",
          description: "Em datas como Black Friday, pedir previsão de volume e confirmar capacidade de postagem dos maiores vendedores com antecedência.",
          owner: "comercial", urgency: "proximo_pico", expectedImpact: "Evitar que a postagem dobre de atraso no pico.",
        });
      actions.push({
        title: "Alerta automático por estado",
        description: `Disparar este fluxo de agentes quando o transporte de um estado passar 2 dias da média ou o atraso semanal dobrar.`,
        owner: "operacoes", urgency: "proximo_pico", expectedImpact: "Detectar a próxima crise na primeira semana, não na quarta.",
      });
      if (o.lateRatePct < o.baselineLateRatePct)
        actions.unshift({
          title: "Registrar o que fez a operação se recuperar",
          description: "Comparar transportadoras, prazos e vendedores com o período de crise para transformar a recuperação em regra.",
          owner: "operacoes", urgency: "esta_semana", expectedImpact: "Repetir o que funcionou na próxima crise.",
        });

      const now = actions.filter((a) => a.urgency === "agora").length;
      return {
        output: {
          summary: now ? `${now} ${now === 1 ? "ação para agora" : "ações para agora"}, focadas em transporte e cliente; o resto evita que se repita.` : "Nada urgente. As ações abaixo consolidam a recuperação e preparam o próximo pico.",
          actions,
        } satisfies ActionsOutput,
      };
    }
    log("Gerando plano de ação priorizado");
    const { data, tokens } = await callJSON<ActionsOutput>({
      system: "Você é o Agente de Ações de um marketplace. Com base nos alertas, no diagnóstico e na análise de vendedores, proponha de 3 a 7 ações concretas para a gestora de operações. Cada ação tem dono (time), urgência e impacto esperado. 'agora' resolve o período atual; 'esta_semana' corrige a causa; 'proximo_pico' prepara a próxima data de pico. Cite estados e ids de vendedores pelo nome.",
      input: { visaoGeral: sc.overview, alertas: ctx.monitor?.alerts, diagnostico: ctx.diagnostico, vendedores: ctx.vendedores },
      schemaHint: `{"summary": string, "actions": [{"title": string, "description": string, "owner": "operacoes"|"logistica"|"comercial"|"produto"|"atendimento", "urgency": "agora"|"esta_semana"|"proximo_pico", "expectedImpact": string, "target": string}]}`,
    });
    return { output: data, tokens };
  },
};

// ───────────────────────── Agente 5 · Relatório ─────────────────────────
const relatorio: AgentDef = {
  id: "relatorio",
  async run(ctx, live, log) {
    const { sc } = ctx;
    const o = sc.overview;
    log("Consolidando a saída dos outros 4 agentes");
    if (!live) {
      const now = ctx.acoes?.actions.filter((a) => a.urgency === "agora") ?? [];
      const sellers = ctx.vendedores?.findings.filter((f) => f.risk !== "baixo") ?? [];
      const md = `## ${sc.title}

**${o.lateRatePct}% dos ${o.orders.toLocaleString("pt-BR")} pedidos chegaram atrasados** (linha de base: ${o.baselineLateRatePct}%). Os atrasados passaram em média ${o.avgDelayLateDays} dias da data prometida, e a nota média ficou em ${o.review}.

### O que aconteceu
${ctx.diagnostico?.causes.slice(0, 3).map((c) => `- **${c.cause}** (${Math.round(c.share * 100)}% dos atrasos). ${c.evidence}`).join("\n")}

### Vendedores que pedem atenção
${sellers.length ? sellers.map((f) => `- **${f.sellerId} (${f.state})**: ${f.pattern}`).join("\n") : "Nenhum vendedor com problema de postagem relevante."}

### Decisões para agora
${now.length ? now.map((a) => `- ${a.title}. ${a.expectedImpact}`).join("\n") : "Nenhuma decisão urgente."}

### Para acompanhar
${ctx.diagnostico?.summary ?? ""}`;
      return { output: { markdown: md } satisfies ReportOutput };
    }
    const { data, tokens } = await callJSON<ReportOutput>({
      system: "Você é o Agente de Relatório. Escreva um relatório executivo em markdown para a liderança de operações, com: título (##), resumo em uma frase com números, '### O que aconteceu', '### Vendedores que pedem atenção', '### Decisões para agora' e '### Para acompanhar'. Linguagem direta, no máximo 250 palavras.",
      input: { titulo: sc.title, periodo: periodLabel(sc.start, sc.end), visaoGeral: o, monitor: ctx.monitor?.summary, diagnostico: ctx.diagnostico, vendedores: ctx.vendedores, acoes: ctx.acoes },
      schemaHint: `{"markdown": string}`,
      maxTokens: 2500,
    });
    return { output: data, tokens };
  },
};

export const AGENTS: Record<AgentId, AgentDef> = { monitor, diagnostico, vendedores, acoes, relatorio };
