import type { Operation, Order } from "./types";

// Camada determinística: transforma ~460 pedidos em indicadores compactos.
// Os agentes recebem esses agregados (não os pedidos crus) — mais barato e mais confiável.

export const LATE_THRESHOLD_MIN = 5;
export const isLate = (o: Order) => o.delayMin > LATE_THRESHOLD_MIN;

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const r1 = (n: number) => Math.round(n * 10) / 10;
const pct = (n: number) => Math.round(n * 1000) / 10;

export function overview(op: Operation) {
  const late = op.orders.filter(isLate);
  return {
    totalOrders: op.orders.length,
    lateOrders: late.length,
    lateRatePct: pct(late.length / op.orders.length),
    avgDelayLateMin: r1(avg(late.map((o) => o.delayMin))),
    gmvAtRisk: Math.round(late.reduce((s, o) => s + o.value, 0)),
  };
}

export function byZone(op: Operation) {
  return op.zones.map((z) => {
    const os = op.orders.filter((o) => o.zoneId === z.id);
    const late = os.filter(isLate);
    return {
      zone: z.name,
      zoneId: z.id,
      raining: z.raining,
      activeCouriers: z.activeCouriers,
      openOrders: z.openOrders,
      ordersPerCourier: r1(z.openOrders / Math.max(z.activeCouriers, 1)),
      orders: os.length,
      lateRatePct: pct(late.length / Math.max(os.length, 1)),
      avgAssignMin: r1(avg(os.map((o) => o.courierAssignMin))),
      avgTravelMin: r1(avg(os.map((o) => o.travelMin))),
      addressIssuePct: pct(os.filter((o) => o.addressIssue).length / Math.max(os.length, 1)),
    };
  });
}

export function byRestaurant(op: Operation) {
  return op.restaurants.map((r) => {
    const os = op.orders.filter((o) => o.restaurantId === r.id);
    const late = os.filter(isLate);
    return {
      restaurant: r.name,
      restaurantId: r.id,
      zoneId: r.zoneId,
      orders: os.length,
      lateRatePct: pct(late.length / Math.max(os.length, 1)),
      basePrepMin: r.basePrepMin,
      avgPrepMin: r1(avg(os.map((o) => o.prepMin))),
      prepOverBasePct: pct(avg(os.map((o) => o.prepMin)) / r.basePrepMin - 1),
      avgPickupWaitMin: r1(avg(os.map((o) => o.pickupWaitMin))),
    };
  });
}

// Para cada pedido atrasado, qual etapa mais estourou em relação ao "normal".
export function delayComponents(op: Operation) {
  const late = op.orders.filter(isLate);
  const counts: Record<string, number> = {
    preparo_lento: 0,
    falta_de_entregador: 0,
    espera_na_coleta: 0,
    deslocamento_lento: 0,
    problema_de_endereco: 0,
  };
  for (const o of late) {
    const r = op.restaurants.find((x) => x.id === o.restaurantId)!;
    const excess = {
      preparo_lento: o.prepMin - r.basePrepMin,
      falta_de_entregador: o.courierAssignMin - 3,
      espera_na_coleta: o.pickupWaitMin - 2,
      deslocamento_lento: o.travelMin - o.distanceKm * 3.7 - (o.addressIssue ? 9 : 0),
      problema_de_endereco: o.addressIssue ? 9.5 : 0,
    };
    const top = Object.entries(excess).sort((a, b) => b[1] - a[1])[0][0];
    counts[top]++;
  }
  return Object.entries(counts)
    .map(([k, v]) => ({ component: k, lateOrders: v, sharePct: pct(v / Math.max(late.length, 1)) }))
    .sort((a, b) => b.lateOrders - a.lateOrders);
}

export function restaurantTrends(op: Operation) {
  return op.history.map((h) => {
    const r = op.restaurants.find((x) => x.id === h.restaurantId)!;
    const first = h.days.slice(0, 7);
    const last = h.days.slice(7);
    return {
      restaurant: r.name,
      restaurantId: r.id,
      lateRate14dPct: pct(avg(h.days.map((d) => d.lateRate))),
      lateRateWeek1Pct: pct(avg(first.map((d) => d.lateRate))),
      lateRateWeek2Pct: pct(avg(last.map((d) => d.lateRate))),
      avgPrepWeek1: r1(avg(first.map((d) => d.avgPrepMin))),
      avgPrepWeek2: r1(avg(last.map((d) => d.avgPrepMin))),
      cancellations14d: h.days.reduce((s, d) => s + d.cancellations, 0),
    };
  });
}
