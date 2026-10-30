"use client";

import { cn } from "@/lib/utils";
import { n1 } from "./format";

type Week = { label: string; inPeriod: boolean; lateRatePct: number };

// Atraso semanal: semanas da linha de base + do período analisado (faixa destacada).
export function LineChart({ weeks, baseline }: { weeks: Week[]; baseline: number }) {
  const W = 300, H = 110, pad = 6;
  const values = weeks.map((w) => w.lateRatePct);
  const max = Math.max(15, ...values) * 1.12;
  const step = (W - pad * 2) / Math.max(values.length - 1, 1);
  const x = (i: number) => pad + i * step;
  const y = (v: number) => H - pad - (v / max) * (H - pad * 2);
  const d = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const area = `${d} L${x(values.length - 1)} ${H - pad} L${x(0)} ${H - pad} Z`;
  const first = weeks.findIndex((w) => w.inPeriod);
  const peak = values.indexOf(Math.max(...values));
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-28 w-full overflow-visible" role="img" aria-label="Atraso semanal antes e durante o período">
        {first >= 0 && (
          <rect x={x(first) - step / 2} y={0} width={W - pad - (x(first) - step / 2)} height={H - pad} className="fill-muted" rx={4} />
        )}
        {[0.33, 0.66].map((f) => (
          <line key={f} x1={pad} x2={W - pad} y1={H * f} y2={H * f} className="stroke-border" strokeDasharray="2 3" />
        ))}
        <line x1={pad} x2={W - pad} y1={y(baseline)} y2={y(baseline)} className="stroke-muted-foreground/60" strokeDasharray="4 3" />
        <path d={area} className="fill-primary/10" />
        <path d={d} fill="none" className="stroke-primary" strokeWidth={1.8} strokeLinejoin="round" />
        <circle cx={x(peak)} cy={y(values[peak])} r={3.2} className="fill-background stroke-primary" strokeWidth={1.8} />
      </svg>
      <figcaption className="mt-1 flex justify-between text-[11px] text-muted-foreground">
        <span>{weeks[0]?.label}</span>
        <span>pico na semana de {weeks[peak]?.label}, {n1(values[peak])}%</span>
        <span>{weeks[weeks.length - 1]?.label}</span>
      </figcaption>
    </figure>
  );
}

// Heatmap estado × semana, na escala da cor principal.
export function Heatmap({ rows, weeks }: { rows: { state: string; hot: boolean; cells: number[] }[]; weeks: Week[] }) {
  const tone = (v: number) => {
    if (v >= 40) return "bg-primary";
    if (v >= 25) return "bg-primary/75";
    if (v >= 12) return "bg-primary/45";
    if (v >= 5) return "bg-primary/20";
    return "bg-primary/[0.06]";
  };
  const cols = { gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))` };
  const first = weeks.findIndex((w) => w.inPeriod);
  return (
    <div className="grid grid-cols-[3.25rem_1fr] gap-x-2 gap-y-1">
      {rows.map((r) => (
        <div key={r.state} className="contents">
          <span className={cn("flex items-center text-xs", r.hot ? "font-semibold text-foreground" : "text-muted-foreground")}>{r.state}</span>
          <div className="grid gap-1" style={cols}>
            {r.cells.map((v, i) => (
              <span
                key={i}
                className={cn("h-6 rounded-[4px]", tone(v), i === first && "ml-1")}
                title={`${r.state}, semana de ${weeks[i]?.label}: ${n1(v)}% de atraso`}
              />
            ))}
          </div>
        </div>
      ))}
      <span />
      <div className="mt-1.5 grid gap-1 text-[10px] text-muted-foreground" style={cols}>
        {weeks.map((w, i) => (
          <span key={w.label} className={cn("whitespace-nowrap", i === first && "ml-1")}>
            {i === first ? "▲ início" : i % 2 === 0 && i < first - 1 ? w.label : ""}
          </span>
        ))}
      </div>
    </div>
  );
}
