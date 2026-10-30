"use client";

import { TrendingDown, TrendingUp, Minus } from "lucide-react";
import type { ActionsOutput, Alert, DiagnosisOutput, MonitorOutput, RestaurantsOutput } from "@/lib/types";
import { lateTone, n1, toneVar } from "./format";

const SEV = {
  critico: { label: "Crítico", color: "var(--bad)" },
  alto: { label: "Alto", color: "var(--warn)" },
  medio: { label: "Médio", color: "var(--rain)" },
};

export function SectionHead({ title, by, summary }: { title: string; by: string; summary?: string }) {
  return (
    <header className="mb-4">
      <div className="flex items-baseline gap-3">
        <h2 className="font-display text-xl font-semibold">{title}</h2>
        <span className="text-xs text-ink-faint">por {by}</span>
      </div>
      {summary && <p className="mt-1.5 max-w-[68ch] text-sm leading-relaxed text-ink-soft">{summary}</p>}
    </header>
  );
}

export function Alerts({ data, onHover }: { data: MonitorOutput; onHover: (a: Alert | null) => void }) {
  return (
    <section className="arrive">
      <SectionHead title="Alertas" by="Monitor" summary={data.summary} />
      <ul className="divide-y divide-sea-700 border-y border-sea-700">
        {data.alerts.map((a) => (
          <li
            key={a.id}
            onMouseEnter={() => onHover(a)}
            onMouseLeave={() => onHover(null)}
            onFocus={() => onHover(a)}
            onBlur={() => onHover(null)}
            tabIndex={0}
            className="flex gap-3 py-3 outline-none hover:bg-sea-800/60 focus-visible:bg-sea-800/60"
          >
            <span className="w-1 shrink-0 rounded-full" style={{ background: SEV[a.severity].color }} aria-hidden />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-xs font-semibold" style={{ color: SEV[a.severity].color }}>{SEV[a.severity].label}</span>
                <span className="font-medium">{a.title}</span>
              </div>
              <p className="mt-0.5 text-sm text-ink-soft">{a.detail}</p>
            </div>
            <span className="shrink-0 self-center text-right text-xs text-ink-faint">
              <b className="block font-display text-lg text-ink">{a.affectedOrders}</b>pedidos
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

const CAT_COLOR: Record<string, string> = {
  cozinha: "var(--bad)", clima: "var(--rain)", entregador: "var(--warn)", demanda: "var(--warn)", endereco: "#b79be8", outro: "var(--ink-faint)",
};

export function Causes({ data }: { data: DiagnosisOutput }) {
  const total = data.causes.reduce((s, c) => s + c.share, 0) || 1;
  return (
    <section className="arrive">
      <SectionHead title="Por que está atrasando" by="Diagnóstico" summary={data.summary} />
      <div className="flex h-3 overflow-hidden rounded-full" role="img" aria-label="Participação de cada causa nos atrasos">
        {data.causes.map((c) => (
          <div key={c.cause} style={{ width: `${(c.share / total) * 100}%`, background: CAT_COLOR[c.category] }} title={c.cause} />
        ))}
      </div>
      <ul className="mt-4 space-y-4">
        {data.causes.map((c) => (
          <li key={c.cause} className="grid grid-cols-[3.5rem_1fr] gap-3">
            <span className="font-display text-2xl font-semibold" style={{ color: CAT_COLOR[c.category] }}>
              {Math.round(c.share * 100)}%
            </span>
            <div>
              <p className="font-medium">
                {c.cause} <span className="text-xs font-normal text-ink-faint">confiança {({ alta: "alta", media: "média", baixa: "baixa" } as Record<string, string>)[c.confidence] ?? c.confidence}</span>
              </p>
              <p className="mt-0.5 text-sm text-ink-soft">{c.evidence}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

const TREND = {
  piorando: { icon: TrendingUp, label: "Piorando", color: "var(--bad)" },
  estavel: { icon: Minus, label: "Estável", color: "var(--ink-soft)" },
  melhorando: { icon: TrendingDown, label: "Melhorando", color: "var(--ok)" },
};
const RISK = { alto: "var(--bad)", medio: "var(--warn)", baixo: "var(--ok)" };

export function Restaurants({ data, onHover }: { data: RestaurantsOutput; onHover: (id: string | null) => void }) {
  return (
    <section className="arrive">
      <SectionHead title="Restaurantes" by="Restaurantes" summary={data.summary} />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-sea-700 text-left text-xs text-ink-faint">
              <th className="py-2 pr-3 font-medium">Restaurante</th>
              <th className="py-2 pr-3 text-right font-medium">Hoje</th>
              <th className="py-2 pr-3 text-right font-medium">14 dias</th>
              <th className="py-2 pr-3 font-medium">Tendência</th>
              <th className="py-2 font-medium">Leitura do agente</th>
            </tr>
          </thead>
          <tbody>
            {data.findings.map((f) => {
              const T = TREND[f.trend];
              return (
                <tr
                  key={f.restaurantId}
                  className="border-b border-sea-700/60 align-top hover:bg-sea-800/60"
                  onMouseEnter={() => onHover(f.restaurantId)}
                  onMouseLeave={() => onHover(null)}
                >
                  <td className="py-3 pr-3">
                    <span className="flex items-center gap-2 font-medium">
                      <i className="size-2 shrink-0 rounded-full" style={{ background: RISK[f.risk] }} aria-label={`risco ${f.risk}`} />
                      {f.restaurantName}
                    </span>
                  </td>
                  <td className="py-3 pr-3 text-right font-semibold" style={{ color: toneVar[lateTone(f.lateRateToday)] }}>{n1(f.lateRateToday)}%</td>
                  <td className="py-3 pr-3 text-right" style={{ color: toneVar[lateTone(f.lateRate14d)] }}>{n1(f.lateRate14d)}%</td>
                  <td className="py-3 pr-3">
                    <span className="flex items-center gap-1 text-xs" style={{ color: T.color }}><T.icon className="size-3.5" />{T.label}</span>
                  </td>
                  <td className="py-3 text-ink-soft">{f.pattern}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const URGENCY = [
  { key: "agora", label: "Agora", hint: "Resolve a noite" },
  { key: "hoje", label: "Hoje", hint: "Antes do próximo pico" },
  { key: "esta_semana", label: "Esta semana", hint: "Evita que volte" },
] as const;
const OWNER: Record<string, string> = { operacoes: "Operações", logistica: "Logística", comercial: "Comercial", produto: "Produto" };

export function Actions({ data }: { data: ActionsOutput }) {
  return (
    <section className="arrive">
      <SectionHead title="Plano de ação" by="Ações" summary={data.summary} />
      <div className="grid gap-4 md:grid-cols-3">
        {URGENCY.map((u) => (
          <div key={u.key} className="rounded-xl bg-sea-800 p-3">
            <h3 className="font-display font-semibold">
              {u.label} <span className="ml-1 text-xs font-normal text-ink-faint">{u.hint}</span>
            </h3>
            <ul className="mt-3 space-y-2.5">
              {data.actions.filter((a) => a.urgency === u.key).map((a) => (
                <li key={a.title} className="rounded-lg border border-sea-700 bg-sea-900/50 p-3">
                  <p className="text-sm font-medium leading-snug">{a.title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-ink-soft">{a.description}</p>
                  <p className="mt-2 text-xs text-ok">{a.expectedImpact}</p>
                  <p className="mt-2 text-[11px] text-ink-faint">Responsável: {OWNER[a.owner] ?? a.owner}</p>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

// Renderizador mínimo de markdown (títulos, listas, negrito, parágrafos).
function inline(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") ? <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong> : part,
  );
}

export function Report({ markdown }: { markdown: string }) {
  const blocks = markdown.split(/\n{2,}/);
  return (
    <section className="arrive">
      <SectionHead title="Relatório da noite" by="Relatório" />
      <article className="max-w-[70ch] rounded-2xl bg-ink px-6 py-6 text-[15px] leading-relaxed text-sea-900 sm:px-9 sm:py-8">
        {blocks.map((b, i) => {
          if (b.startsWith("## ")) return <h3 key={i} className="font-display text-2xl font-semibold leading-tight">{b.slice(3)}</h3>;
          if (b.startsWith("### ")) {
            const [head, ...rest] = b.split("\n");
            return (
              <div key={i} className="mt-5">
                <h4 className="font-display text-base font-semibold">{head.slice(4)}</h4>
                {rest.length > 0 && <Body text={rest.join("\n")} />}
              </div>
            );
          }
          return <Body key={i} text={b} />;
        })}
      </article>
    </section>
  );
}

function Body({ text }: { text: string }) {
  const lines = text.split("\n").filter(Boolean);
  if (lines.every((l) => l.startsWith("- ")))
    return (
      <ul className="mt-2 list-disc space-y-1.5 pl-5 marker:text-sea-600">
        {lines.map((l, i) => <li key={i}>{inline(l.slice(2))}</li>)}
      </ul>
    );
  return <p className="mt-3">{inline(text)}</p>;
}
