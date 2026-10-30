"use client";

import { n1 } from "./format";

// Linha da taxa de atraso ao longo da noite, com linha tracejada da média dos 14 dias.
export function LineChart({ values, labels, baseline }: { values: number[]; labels: string[]; baseline: number }) {
  const W = 300, H = 110, pad = 6;
  const max = Math.max(60, ...values) * 1.05;
  const x = (i: number) => pad + (i * (W - pad * 2)) / (values.length - 1);
  const y = (v: number) => H - pad - (v / max) * (H - pad * 2);
  const d = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const area = `${d} L${x(values.length - 1)} ${H - pad} L${x(0)} ${H - pad} Z`;
  const peak = values.indexOf(Math.max(...values));
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-28 w-full overflow-visible" role="img" aria-label="Taxa de atraso a cada 10 minutos">
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1={pad} x2={W - pad} y1={H * f} y2={H * f} className="stroke-border" strokeDasharray="2 3" />
        ))}
        <line x1={pad} x2={W - pad} y1={y(baseline)} y2={y(baseline)} className="stroke-muted-foreground/60" strokeDasharray="4 3" />
        <path d={area} className="fill-primary/10" />
        <path d={d} fill="none" className="stroke-primary" strokeWidth={1.8} strokeLinejoin="round" />
        <circle cx={x(peak)} cy={y(values[peak])} r={3.2} className="fill-background stroke-primary" strokeWidth={1.8} />
      </svg>
      <figcaption className="mt-1 flex justify-between text-[11px] text-muted-foreground">
        <span>{labels[0]}</span>
        <span>pico {labels[peak]}, {n1(values[peak])}%</span>
        <span>21:00</span>
      </figcaption>
    </figure>
  );
}

// Heatmap zona × horário, na escala do laranja da marca.
export function Heatmap({ rows, labels }: { rows: { zone: string; raining: boolean; cells: number[] }[]; labels: string[] }) {
  const tone = (v: number) => {
    if (v >= 80) return "bg-primary";
    if (v >= 55) return "bg-primary/75";
    if (v >= 30) return "bg-primary/45";
    if (v >= 10) return "bg-primary/20";
    return "bg-primary/[0.06]";
  };
  return (
    <div>
      <div className="grid grid-cols-[5.5rem_1fr] gap-x-2 gap-y-1">
        {rows.map((r) => (
          <div key={r.zone} className="contents">
            <span className="flex items-center truncate text-xs text-muted-foreground">
              {r.zone}
              {r.raining && <span className="ml-1 text-info" title="Chovendo">●</span>}
            </span>
            <div className="grid grid-cols-12 gap-1">
              {r.cells.map((v, i) => (
                <span key={i} className={`h-6 rounded-[4px] ${tone(v)}`} title={`${r.zone}, ${labels[i]}: ${n1(v)}% de atraso`} />
              ))}
            </div>
          </div>
        ))}
        <span />
        <div className="mt-1.5 grid grid-cols-12 gap-1 whitespace-nowrap text-[10px] text-muted-foreground">
          {labels.map((l, i) => <span key={l}>{i % 3 === 0 ? l : ""}</span>)}
        </div>
      </div>
    </div>
  );
}
