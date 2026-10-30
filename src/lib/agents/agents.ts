import type {
  ActionsOutput, AgentId, Alert, DiagnosisOutput, MonitorOutput, Operation,
  ReportOutput, RestaurantFinding, RestaurantsOutput,
} from "../types";
import * as A from "../analysis";
import { callJSON } from "./llm";

export type Ctx = {
  op: Operation;
  monitor?: MonitorOutput;
  diagnostico?: DiagnosisOutput;
  restaurantes?: RestaurantsOutput;
  acoes?: ActionsOutput;
  relatorio?: ReportOutput;
};

export type Log = (msg: string) => void;

export type AgentDef = {
  id: AgentId;
  name: string;
  role: string;
  run: (ctx: Ctx, live: boolean, log: Log) => Promise<{ output: unknown; tokens?: number }>;
};

// ───────────────────────── Agente 1 · Monitor ─────────────────────────
// Detecção por regras (rápida, auditável) + LLM para priorizar e resumir.
function detectAlerts(op: Operation): Alert[] {
  const alerts: Alert[] = [];
  for (const z of A.byZone(op)) {
    if (z.raining && z.lateRatePct > 40) {
      alerts.push({
        id: `zona-${z.zoneId}`, severity: "critico", zoneId: z.zoneId,
        title: `${z.zone}: chuva + falta de entregadores`,
        detail: `${z.lateRatePct}% dos pedidos atrasados, ${z.ordersPerCourier} pedidos abertos por entregador, alocação média de ${z.avgAssignMin} min.`,
        affectedOrders: Math.round((z.orders * z.lateRatePct) / 100),
      });
    } else if (z.ordersPerCourier >= 1.2 && z.lateRatePct > 20) {
      alerts.push({
        id: `zona-${z.zoneId}`, severity: "alto", zoneId: z.zoneId,
        title: `${z.zone}: demanda acima da capacidade`,
        detail: `${z.openOrders} pedidos abertos para ${z.activeCouriers} entregadores; ${z.lateRatePct}% de atraso.`,
        affectedOrders: Math.round((z.orders * z.lateRatePct) / 100),
      });
    }
    if (z.addressIssuePct > 15) {
      alerts.push({
        id: `endereco-${z.zoneId}`, severity: "medio", zoneId: z.zoneId,
        title: `${z.zone}: endereços com problema`,
        detail: `${z.addressIssuePct}% dos pedidos com dificuldade de localização na entrega.`,
        affectedOrders: Math.round((z.orders * z.addressIssuePct) / 100),
      });
    }
  }
  for (const r of A.byRestaurant(op)) {
    if (r.orders >= 15 && r.lateRatePct > 40 && r.prepOverBasePct > 25) {
      alerts.push({
        id: `rest-${r.restaurantId}`, severity: r.lateRatePct > 70 ? "critico" : "alto",
        restaurantId: r.restaurantId,
        title: `${r.restaurant}: preparo muito acima do normal`,
        detail: `Preparo médio de ${r.avgPrepMin} min (normal: ${r.basePrepMin} min); ${r.lateRatePct}% de atraso.`,
        affectedOrders: Math.round((r.orders * r.lateRatePct) / 100),
      });
    }
    if (r.avgPickupWaitMin > 6) {
      alerts.push({
        id: `coleta-${r.restaurantId}`, severity: "medio", restaurantId: r.restaurantId,
        title: `${r.restaurant}: entregadores esperando na coleta`,
        detail: `Espera média de ${r.avgPickupWaitMin} min no balcão após o pedido ser marcado como pronto.`,
        affectedOrders: r.orders,
      });
    }
  }
  const rank = { critico: 0, alto: 1, medio: 2 };
  return alerts.sort((a, b) => rank[a.severity] - rank[b.severity] || b.affectedOrders - a.affectedOrders);
}

const monitor: AgentDef = {
  id: "monitor",
  name: "Monitor",
  role: "Vigia a operação em tempo real e levanta alertas",
  async run(ctx, live, log) {
    const ov = A.overview(ctx.op);
    log(`Lendo ${ov.totalOrders} pedidos de ${ctx.op.zones.length} zonas`);
    const alerts = detectAlerts(ctx.op);
    log(`${ov.lateOrders} pedidos atrasados (${ov.lateRatePct}%), ${alerts.length} alertas detectados por regra`);
    const base = { lateOrders: ov.lateOrders, lateRate: ov.lateRatePct, avgDelayMin: ov.avgDelayLateMin };

    if (!live) {
      const crit = alerts.filter((a) => a.severity === "critico");
      return {
        output: {
          ...base, alerts,
          summary: `${ov.lateRatePct}% dos pedidos estão atrasados, ${ov.avgDelayLateMin} min em média. ${crit.length} alertas críticos: ${crit.map((a) => a.title.split(":")[0]).join(", ")}. R$ ${ov.gmvAtRisk.toLocaleString("pt-BR")} em pedidos com risco de cancelamento ou cupom.`,
        } satisfies MonitorOutput,
      };
    }
    log("Pedindo ao modelo para priorizar os alertas");
    const { data, tokens } = await callJSON<{ summary: string; order: string[] }>({
      system: "Você é o Agente Monitor. Recebe indicadores e alertas detectados por regras. Reordene os alertas por impacto real na operação AGORA e escreva um resumo de 2 frases para o gestor.",
      input: { overview: ov, alerts },
      schemaHint: `{"summary": string, "order": string[] /* ids dos alertas em ordem de prioridade */}`,
    });
    const sorted = data.order.map((id) => alerts.find((a) => a.id === id)).filter(Boolean) as Alert[];
    const rest = alerts.filter((a) => !data.order.includes(a.id));
    return { output: { ...base, summary: data.summary, alerts: [...sorted, ...rest] } satisfies MonitorOutput, tokens };
  },
};

// ───────────────────────── Agente 2 · Diagnóstico ─────────────────────────
const diagnostico: AgentDef = {
  id: "diagnostico",
  name: "Diagnóstico",
  role: "Investiga por que os pedidos estão atrasando",
  async run(ctx, live, log) {
    const comps = A.delayComponents(ctx.op);
    const zones = A.byZone(ctx.op);
    const rests = A.byRestaurant(ctx.op);
    log(`Decompondo ${ctx.monitor?.lateOrders} atrasos em preparo, alocação, coleta, trajeto e endereço`);

    if (!live) {
      const share = (k: string) => (comps.find((c) => c.component === k)?.sharePct ?? 0) / 100;
      const slowKitchens = rests.filter((r) => r.prepOverBasePct > 25).sort((a, b) => b.prepOverBasePct - a.prepOverBasePct);
      const rainy = zones.filter((z) => z.raining);
      const addr = zones.filter((z) => z.addressIssuePct > 15);
      const pickup = rests.filter((r) => r.avgPickupWaitMin > 6);
      return {
        output: {
          summary: `Mais da metade dos atrasos nasce na cozinha, concentrada em ${slowKitchens.length} restaurantes. O segundo foco é a falta de entregadores nas zonas com chuva.`,
          causes: [
            {
              cause: "Preparo lento em restaurantes específicos", category: "cozinha", share: share("preparo_lento"), confidence: "alta",
              evidence: slowKitchens.map((r) => `${r.restaurant} +${r.prepOverBasePct}% no preparo`).join("; "),
            },
            {
              cause: "Chuva reduzindo a oferta de entregadores", category: "clima", share: share("falta_de_entregador"), confidence: "alta",
              evidence: rainy.map((z) => `${z.zone}: ${z.activeCouriers} entregadores, alocação de ${z.avgAssignMin} min`).join("; "),
            },
            {
              cause: "Endereços difíceis de localizar", category: "endereco", share: share("problema_de_endereco"), confidence: "media",
              evidence: addr.map((z) => `${z.zone}: ${z.addressIssuePct}% dos pedidos`).join("; ") + ". Padrão típico de condomínios e prédios sem portaria identificada.",
            },
            {
              cause: "Pedido marcado como pronto antes da hora", category: "cozinha", share: share("espera_na_coleta"), confidence: "media",
              evidence: pickup.map((r) => `${r.restaurant}: ${r.avgPickupWaitMin} min de espera no balcão`).join("; ") + ". Prende entregadores que poderiam atender outros pedidos.",
            },
          ],
        } satisfies DiagnosisOutput,
      };
    }
    log("Cruzando etapas do atraso com zonas e restaurantes");
    const { data, tokens } = await callJSON<DiagnosisOutput>({
      system: "Você é o Agente de Diagnóstico. Identifique as causas-raiz dos atrasos. Diferencie causas na cozinha, na logística, no clima, na demanda e no endereço. Para cada causa, traga evidência numérica dos dados e um grau de confiança. Ordene da causa que mais explica atrasos para a que menos explica.",
      input: { componentesDoAtraso: comps, zonas: zones, restaurantes: rests, alertas: ctx.monitor?.alerts },
      schemaHint: `{"summary": string, "causes": [{"cause": string, "category": "cozinha"|"entregador"|"clima"|"demanda"|"endereco"|"outro", "share": number /* 0 a 1 */, "evidence": string, "confidence": "alta"|"media"|"baixa"}]}`,
    });
    return { output: data, tokens };
  },
};

// ───────────────────────── Agente 3 · Restaurantes ─────────────────────────
const RISK_ORDER = { alto: 0, medio: 1, baixo: 2 };
const restaurantes: AgentDef = {
  id: "restaurantes",
  name: "Restaurantes",
  role: "Separa o problema de hoje do problema crônico",
  async run(ctx, live, log) {
    const trends = A.restaurantTrends(ctx.op);
    const today = A.byRestaurant(ctx.op);
    log(`Comparando hoje com os últimos 14 dias de ${trends.length} restaurantes`);
    const rainyZones = new Set(ctx.op.zones.filter((z) => z.raining).map((z) => z.id));
    const joined = trends.map((t) => {
      const td = today.find((x) => x.restaurantId === t.restaurantId)!;
      return { ...t, lateRateTodayPct: td.lateRatePct, prepOverBaseTodayPct: td.prepOverBasePct, zoneRaining: rainyZones.has(td.zoneId) };
    });

    if (!live) {
      const findings = joined
        .map((t) => {
          const delta = t.lateRateWeek2Pct - t.lateRateWeek1Pct;
          const trend: RestaurantFinding["trend"] = delta > 5 ? "piorando" : delta < -5 ? "melhorando" : "estavel";
          const chronic = t.lateRate14dPct > 15;
          const spike = t.lateRateTodayPct > 30 && !chronic;
          let pattern = "";
          if (chronic && trend === "piorando")
            pattern = `Atraso subiu de ${t.lateRateWeek1Pct}% para ${t.lateRateWeek2Pct}% em uma semana; preparo foi de ${t.avgPrepWeek1} para ${t.avgPrepWeek2} min. ${t.cancellations14d} cancelamentos em 14 dias. Problema crônico e acelerando.`;
          else if (chronic)
            pattern = `Atraso alto e estável (${t.lateRate14dPct}% em 14 dias) com ${t.cancellations14d} cancelamentos. ` +
              (t.lateRateTodayPct < t.lateRate14dPct
                ? `Hoje foi uma noite boa (${t.lateRateTodayPct}%), o que pode esconder o problema.`
                : `Hoje segue o padrão (${t.lateRateTodayPct}%).`);
          else if (spike && t.zoneRaining && t.prepOverBaseTodayPct < 15)
            pattern = `Histórico saudável (${t.lateRate14dPct}%) e cozinha no tempo normal. O atraso de hoje (${t.lateRateTodayPct}%) vem da chuva na zona, não do restaurante.`;
          else if (spike)
            pattern = `Histórico saudável (${t.lateRate14dPct}%), mas hoje está em ${t.lateRateTodayPct}% com preparo ${t.prepOverBaseTodayPct}% acima do normal. Pico pontual de demanda, não é problema estrutural.`;
          else return null;
          const risk: RestaurantFinding["risk"] = chronic && trend === "piorando" ? "alto" : chronic ? "medio" : "baixo";
          const f: RestaurantFinding = {
            restaurantId: t.restaurantId, restaurantName: t.restaurant, pattern, trend,
            lateRate14d: t.lateRate14dPct, lateRateToday: t.lateRateTodayPct, risk,
          };
          return f;
        })
        .filter((f): f is RestaurantFinding => f !== null)
        .sort((a, b) => RISK_ORDER[a.risk] - RISK_ORDER[b.risk]);
      return {
        output: {
          summary: "Um restaurante está piorando rápido e precisa de contato hoje. Outro tem atraso crônico mascarado por uma noite boa. Os demais picos de hoje são pontuais ou causados pela chuva.",
          findings,
        } satisfies RestaurantsOutput,
      };
    }
    log("Classificando restaurantes: crônico, pontual ou saudável");
    const { data, tokens } = await callJSON<RestaurantsOutput>({
      system: "Você é o Agente de Restaurantes. Compare o desempenho de hoje com o histórico de 14 dias. Separe problemas crônicos (histórico ruim), tendências de piora e picos pontuais de hoje. Ignore restaurantes saudáveis. Atrasos causados por chuva na zona do restaurante NÃO são culpa do restaurante; mencione isso quando for o caso.",
      input: { restaurantes: joined, zonasComChuva: ctx.op.zones.filter((z) => z.raining).map((z) => z.id), mapaZona: Object.fromEntries(ctx.op.restaurants.map((r) => [r.name, r.zoneId])) },
      schemaHint: `{"summary": string, "findings": [{"restaurantId": string, "restaurantName": string, "pattern": string, "trend": "piorando"|"estavel"|"melhorando", "lateRate14d": number, "lateRateToday": number, "risk": "alto"|"medio"|"baixo"}]}`,
    });
    return { output: data, tokens };
  },
};

// ───────────────────────── Agente 4 · Ações ─────────────────────────
const acoes: AgentDef = {
  id: "acoes",
  name: "Ações",
  role: "Transforma diagnóstico em próximos passos",
  async run(ctx, live, log) {
    log("Lendo diagnóstico e análise de restaurantes");
    if (!live) {
      const rainy = ctx.op.zones.filter((z) => z.raining).map((z) => z.name);
      const worst = ctx.restaurantes?.findings.find((f) => f.risk === "alto");
      const chronic = ctx.restaurantes?.findings.find((f) => f.risk === "medio");
      // pico de cozinha (não de chuva): é o caso em que reduzir capacidade ajuda
      const spike = ctx.restaurantes?.findings.find((f) => f.risk === "baixo" && f.pattern.includes("Pico pontual"));
      log("Priorizando por urgência e impacto");
      return {
        output: {
          summary: "Duas ações para agora (chuva e cozinha), duas para hoje e duas estruturais para a semana.",
          actions: [
            { title: `Ativar incentivo de chuva em ${rainy.join(" e ")}`, description: "Bônus por entrega nas zonas com chuva e notificação para entregadores de zonas vizinhas com folga (Benfica e Fátima).", owner: "logistica", urgency: "agora", expectedImpact: "Reduzir o tempo de alocação, hoje acima de 15 min nessas zonas.", target: rainy.join(", ") },
            { title: "Aumentar o tempo prometido nas zonas com chuva", description: "Ajustar a estimativa exibida ao cliente enquanto durar a chuva, para trocar atraso por expectativa correta.", owner: "produto", urgency: "agora", expectedImpact: "Menos reclamações e cupons de compensação.", target: rainy.join(", ") },
            ...(spike ? [{ title: `Pausar temporariamente ${spike.restaurantName} no pico`, description: "Ativar modo de capacidade reduzida por 30 min para a cozinha zerar a fila.", owner: "operacoes" as const, urgency: "agora" as const, expectedImpact: "Fila de preparo volta ao normal sem cancelar pedidos.", target: spike.restaurantName }] : []),
            ...(worst ? [{ title: `Contato do comercial com ${worst.restaurantName}`, description: "Apresentar a piora das duas últimas semanas e entender se houve mudança na cozinha (equipe, cardápio, volume).", owner: "comercial" as const, urgency: "hoje" as const, expectedImpact: "Interromper a tendência antes de virar perda de parceiro e de clientes.", target: worst.restaurantName }] : []),
            { title: "Corrigir o tempo de 'pedido pronto' da Pizzaria Forno Velho", description: "Restaurante marca pronto antes da hora e o entregador espera no balcão. Orientar o uso correto do botão.", owner: "operacoes", urgency: "hoje", expectedImpact: "Liberar entregadores presos na coleta durante o pico.", target: "Pizzaria Forno Velho" },
            { title: "Complemento de endereço obrigatório no Meireles", description: "Pedir bloco, torre e referência no checkout para endereços em condomínios.", owner: "produto", urgency: "esta_semana", expectedImpact: "Menos tempo perdido procurando o cliente na entrega.", target: "Meireles" },
            ...(chronic ? [{ title: `Plano de melhoria com ${chronic.restaurantName}`, description: "Atraso crônico estável. Revisar tempo de preparo cadastrado e capacidade nos horários de pico.", owner: "comercial" as const, urgency: "esta_semana" as const, expectedImpact: "Reduzir cancelamentos recorrentes.", target: chronic.restaurantName }] : []),
          ],
        } satisfies ActionsOutput,
      };
    }
    log("Gerando plano de ação priorizado");
    const { data, tokens } = await callJSON<ActionsOutput>({
      system: "Você é o Agente de Ações. Com base no diagnóstico e na análise de restaurantes, proponha de 4 a 7 ações concretas para o gestor de operações. Cada ação precisa de dono (time), urgência e impacto esperado. Ações 'agora' resolvem a noite; 'hoje' e 'esta_semana' evitam que o problema volte. Seja específico: cite zonas e restaurantes pelo nome.",
      input: { alertas: ctx.monitor?.alerts, diagnostico: ctx.diagnostico, restaurantes: ctx.restaurantes },
      schemaHint: `{"summary": string, "actions": [{"title": string, "description": string, "owner": "operacoes"|"logistica"|"comercial"|"produto", "urgency": "agora"|"hoje"|"esta_semana", "expectedImpact": string, "target": string}]}`,
    });
    return { output: data, tokens };
  },
};

// ───────────────────────── Agente 5 · Relatório ─────────────────────────
const relatorio: AgentDef = {
  id: "relatorio",
  name: "Relatório",
  role: "Escreve o resumo da noite para a liderança",
  async run(ctx, live, log) {
    log("Consolidando a saída dos outros 4 agentes");
    const ov = A.overview(ctx.op);
    if (!live) {
      const now = ctx.acoes?.actions.filter((a) => a.urgency === "agora") ?? [];
      const md = `## Resumo do pico: ${ctx.op.window.toLowerCase()}

**${ov.lateRatePct}% dos ${ov.totalOrders} pedidos atrasaram**, em média ${ov.avgDelayLateMin} min além do prometido. R$ ${ov.gmvAtRisk.toLocaleString("pt-BR")} em pedidos estão em risco de cancelamento ou cupom.

### O que aconteceu
${ctx.diagnostico?.causes.slice(0, 3).map((c) => `- **${c.cause}** (${Math.round(c.share * 100)}% dos atrasos). ${c.evidence}`).join("\n")}

### Restaurantes que pedem atenção
${ctx.restaurantes?.findings.filter((f) => f.risk !== "baixo").map((f) => `- **${f.restaurantName}**: ${f.pattern}`).join("\n")}

### Decisões para agora
${now.map((a) => `- ${a.title}. ${a.expectedImpact}`).join("\n")}

### Para acompanhar
O atraso desta noite tem duas naturezas diferentes: a chuva é pontual e se resolve com incentivo e ajuste de expectativa; a cozinha lenta é estrutural e exige conversa com o parceiro esta semana.`;
      return { output: { markdown: md } satisfies ReportOutput };
    }
    const { data, tokens } = await callJSON<ReportOutput>({
      system: "Você é o Agente de Relatório. Escreva um relatório executivo em markdown para a liderança de operações, com as seções: resumo em uma frase com números, 'O que aconteceu', 'Restaurantes que pedem atenção', 'Decisões para agora' e 'Para acompanhar'. Linguagem direta, sem jargão, no máximo 250 palavras.",
      input: { janela: ctx.op.window, visaoGeral: ov, monitor: ctx.monitor?.summary, diagnostico: ctx.diagnostico, restaurantes: ctx.restaurantes, acoes: ctx.acoes },
      schemaHint: `{"markdown": string}`,
      maxTokens: 2500,
    });
    return { output: data, tokens };
  },
};

export const AGENTS: Record<AgentId, AgentDef> = { monitor, diagnostico, restaurantes, acoes, relatorio };
