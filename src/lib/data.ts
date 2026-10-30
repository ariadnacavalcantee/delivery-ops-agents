import type { Operation, Order, Restaurant, RestaurantHistory, Zone } from "./types";

// Gerador determinístico: mesma seed, mesma operação. Facilita demo e testes.
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ZONES: Omit<Zone, "openOrders">[] = [
  { id: "aldeota", name: "Aldeota", raining: false, activeCouriers: 38 },
  { id: "meireles", name: "Meireles", raining: false, activeCouriers: 31 },
  { id: "coco", name: "Cocó", raining: false, activeCouriers: 22 },
  { id: "benfica", name: "Benfica", raining: false, activeCouriers: 18 },
  { id: "fatima", name: "Fátima", raining: false, activeCouriers: 16 },
  { id: "parangaba", name: "Parangaba", raining: true, activeCouriers: 9 },
  { id: "messejana", name: "Messejana", raining: true, activeCouriers: 7 },
];

// Restaurantes fictícios. Alguns carregam "problemas plantados" que os agentes devem encontrar.
const RESTAURANTS: Restaurant[] = [
  { id: "r01", name: "Brasa do Cocó", cuisine: "Churrasco", zoneId: "coco", basePrepMin: 30, rating: 4.3 },
  { id: "r02", name: "Sushi Kaze", cuisine: "Japonesa", zoneId: "aldeota", basePrepMin: 22, rating: 4.7 },
  { id: "r03", name: "Pizzaria Forno Velho", cuisine: "Pizza", zoneId: "meireles", basePrepMin: 20, rating: 4.5 },
  { id: "r04", name: "Tapioca da Praia", cuisine: "Regional", zoneId: "meireles", basePrepMin: 10, rating: 4.8 },
  { id: "r05", name: "Burger Mandacaru", cuisine: "Hambúrguer", zoneId: "aldeota", basePrepMin: 15, rating: 4.6 },
  { id: "r06", name: "Cantina Benfica", cuisine: "Italiana", zoneId: "benfica", basePrepMin: 18, rating: 4.4 },
  { id: "r07", name: "Açaí Jangada", cuisine: "Açaí", zoneId: "fatima", basePrepMin: 8, rating: 4.7 },
  { id: "r08", name: "Panelada da Vó", cuisine: "Regional", zoneId: "parangaba", basePrepMin: 16, rating: 4.5 },
  { id: "r09", name: "Poke Iracema", cuisine: "Havaiana", zoneId: "meireles", basePrepMin: 12, rating: 4.6 },
  { id: "r10", name: "Espetinho Messejana", cuisine: "Espetinho", zoneId: "messejana", basePrepMin: 14, rating: 4.2 },
  { id: "r11", name: "Wok Fátima", cuisine: "Chinesa", zoneId: "fatima", basePrepMin: 17, rating: 4.1 },
  { id: "r12", name: "Marmita Express", cuisine: "Caseira", zoneId: "benfica", basePrepMin: 9, rating: 4.3 },
];

const round = (n: number) => Math.round(n * 10) / 10;

export function generateOperation(seed = 2026): Operation {
  const rand = mulberry32(seed);
  const between = (a: number, b: number) => a + rand() * (b - a);
  const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)];

  // sexta-feira, pico do jantar
  const start = new Date("2026-10-30T19:00:00-03:00").getTime();
  const windowMin = 120;

  // peso de demanda por restaurante (Aldeota e Sushi bombam na sexta)
  const weights: Record<string, number> = {
    r01: 1.2, r02: 2.2, r03: 1.8, r04: 1.0, r05: 2.0, r06: 0.8,
    r07: 1.1, r08: 0.9, r09: 1.0, r10: 0.8, r11: 0.9, r12: 0.7,
  };
  const weighted = RESTAURANTS.flatMap((r) => Array(Math.round(weights[r.id] * 10)).fill(r) as Restaurant[]);

  const orders: Order[] = [];
  const total = 460;

  for (let i = 0; i < total; i++) {
    const r = pick(weighted);
    // a maioria entrega na própria zona; um pouco cruza zonas
    const zoneId = rand() < 0.8 ? r.zoneId : pick(ZONES).id;
    const zone = ZONES.find((z) => z.id === zoneId)!;
    const minute = Math.floor(between(0, windowMin));
    const placedAt = new Date(start + minute * 60_000);
    const peak = minute >= 30 && minute <= 85; // 19h30–20h25

    // --- preparo ---
    let prep = r.basePrepMin * between(0.85, 1.15);
    if (r.id === "r01") prep *= between(1.4, 1.9); // cozinha lenta recorrente
    if (r.id === "r02" && peak) prep *= between(1.5, 2.0); // sushi estoura no pico (pontual)
    if (peak) prep *= 1.08;

    // --- alocação de entregador ---
    const pressure = zone.raining ? 3.2 : zoneId === "aldeota" && peak ? 1.9 : 1;
    let assign = between(1, 4) * pressure;
    if (zone.raining) assign += between(4, 10);

    // --- espera na coleta ---
    let pickupWait = between(0, 3);
    if (r.id === "r03") pickupWait += between(6, 11); // pedido marcado como pronto antes da hora

    // --- deslocamento ---
    const distanceKm = between(1.2, zoneId === r.zoneId ? 4.5 : 8.5);
    let travel = distanceKm * between(3.2, 4.2);
    if (zone.raining) travel *= between(1.35, 1.6);

    // --- endereço ---
    const addressIssue = zoneId === "meireles" ? rand() < 0.22 : rand() < 0.03;
    if (addressIssue) travel += between(6, 12);

    const promised = Math.round(r.basePrepMin + 6 + distanceKm * 4 + 5);
    const totalMin = prep + assign + pickupWait + travel;
    const elapsed = windowMin - minute;
    const status: Order["status"] =
      elapsed > totalMin ? "entregue" : elapsed > prep ? "em_rota" : "preparando";

    orders.push({
      id: `P${(10450 + i).toString()}`,
      restaurantId: r.id,
      zoneId,
      placedAt: placedAt.toISOString(),
      promisedMin: promised,
      prepMin: round(prep),
      pickupWaitMin: round(pickupWait),
      courierAssignMin: round(assign),
      travelMin: round(travel),
      distanceKm: round(distanceKm),
      totalMin: round(totalMin),
      delayMin: round(totalMin - promised),
      value: round(between(28, 140)),
      addressIssue,
      status,
    });
  }

  const zones: Zone[] = ZONES.map((z) => ({
    ...z,
    openOrders: orders.filter((o) => o.zoneId === z.id && o.status !== "entregue").length,
  }));

  // --- histórico de 14 dias por restaurante ---
  const history: RestaurantHistory[] = RESTAURANTS.map((r) => {
    const days = Array.from({ length: 14 }, (_, d) => {
      const date = new Date(start - (14 - d) * 86_400_000).toISOString().slice(0, 10);
      let lateRate = between(0.06, 0.14);
      let prep = r.basePrepMin * between(0.95, 1.08);
      let cancellations = Math.floor(between(0, 3));
      if (r.id === "r01") {
        // piorando ao longo das duas semanas
        lateRate = 0.18 + d * 0.022 + between(-0.03, 0.03);
        prep = r.basePrepMin * (1.25 + d * 0.035);
        cancellations = Math.floor(between(2, 4 + d / 3));
      }
      if (r.id === "r11") {
        lateRate = between(0.2, 0.27); // ruim, mas estável
        cancellations = Math.floor(between(1, 5));
      }
      if (r.id === "r03") lateRate = between(0.14, 0.2);
      return {
        date,
        orders: Math.round(weights[r.id] * between(55, 75)),
        lateRate: Math.round(lateRate * 1000) / 1000,
        avgPrepMin: round(prep),
        cancellations,
      };
    });
    return { restaurantId: r.id, days };
  });

  return {
    city: "Fortaleza, CE",
    window: "Sexta, 19h00–21h00 (pico do jantar)",
    generatedAt: new Date(start + windowMin * 60_000).toISOString(),
    zones,
    restaurants: RESTAURANTS,
    orders,
    history,
  };
}
