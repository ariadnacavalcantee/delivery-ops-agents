import type { byRestaurant, byZone, overview } from "@/lib/analysis";

export type ZoneStat = ReturnType<typeof byZone>[number];
export type RestaurantStat = ReturnType<typeof byRestaurant>[number];
export type Overview = ReturnType<typeof overview>;

const nf1 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
export const n1 = (n: number) => nf1.format(n);
export const brl = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(n);

export function lateTone(ratePct: number) {
  if (ratePct >= 40) return "bad" as const;
  if (ratePct >= 15) return "warn" as const;
  return "ok" as const;
}

export const toneVar = { ok: "var(--ok)", warn: "var(--warn)", bad: "var(--bad)" };
