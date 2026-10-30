import type { byRestaurant, overview, stageTimes, timeline } from "@/lib/analysis";

export type RestaurantStat = ReturnType<typeof byRestaurant>[number];
export type Overview = ReturnType<typeof overview>;
export type Timeline = ReturnType<typeof timeline>;
export type StageTimes = ReturnType<typeof stageTimes>;

const nf1 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
export const n1 = (n: number) => nf1.format(n);
export const brl = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(n);
export const signed = (n: number) => `${n > 0 ? "+" : ""}${n1(n)}`;
