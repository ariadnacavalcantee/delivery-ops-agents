import raw from "@/data/scenarios.json";
import type { Dataset, Scenario } from "./types";

export const dataset = raw as unknown as Dataset;
export const scenarios: Scenario[] = dataset.scenarios;
export const getScenario = (id: string) => scenarios.find((s) => s.id === id) ?? scenarios[0];

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
export function fmtDate(iso: string, opts: { year?: boolean } = {}) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MESES[m - 1]}${opts.year ? ` ${y}` : ""}`;
}
// fim exclusivo → último dia incluído
export function periodLabel(start: string, end: string) {
  const e = new Date(`${end}T12:00:00Z`);
  e.setUTCDate(e.getUTCDate() - 1);
  return `${fmtDate(start)} a ${fmtDate(e.toISOString().slice(0, 10), { year: true })}`;
}
