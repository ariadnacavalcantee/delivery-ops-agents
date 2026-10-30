"use client";

import { lateTone, n1, toneVar, type RestaurantStat, type ZoneStat } from "./format";

// Mapa esquemático de Fortaleza: posições aproximadas, não geográficas.
const LAYOUT: Record<string, { x: number; y: number; w: number; h: number }> = {
  meireles: { x: 318, y: 58, w: 168, h: 78 },
  aldeota: { x: 318, y: 146, w: 168, h: 86 },
  coco: { x: 410, y: 242, w: 150, h: 84 },
  fatima: { x: 196, y: 162, w: 112, h: 80 },
  benfica: { x: 70, y: 120, w: 116, h: 92 },
  parangaba: { x: 92, y: 252, w: 152, h: 88 },
  messejana: { x: 270, y: 342, w: 180, h: 84 },
};

type Props = {
  zones: ZoneStat[];
  restaurants: RestaurantStat[];
  highlightZone?: string | null;
  highlightRestaurant?: string | null;
  flaggedRestaurants: Set<string>;
  onSelectZone: (id: string | null) => void;
  selectedZone: string | null;
};

export default function ZoneMap({
  zones, restaurants, highlightZone, highlightRestaurant, flaggedRestaurants, onSelectZone, selectedZone,
}: Props) {
  return (
    <figure className="relative">
      <svg viewBox="0 0 600 440" className="w-full h-auto" role="img" aria-label="Mapa de atraso por zona de Fortaleza">
        <defs>
          <pattern id="rain" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(20)">
            <line x1="0" y1="0" x2="0" y2="9" stroke="var(--rain)" strokeWidth="1.2" opacity="0.32" />
          </pattern>
        </defs>

        {/* litoral */}
        <path d="M0 34 C 120 22, 210 44, 300 34 S 470 14, 600 40 L600 0 L0 0 Z" fill="var(--sea-800)" />
        <path d="M0 34 C 120 22, 210 44, 300 34 S 470 14, 600 40" fill="none" stroke="var(--sea-600)" strokeWidth="1.5" />
        <text x="16" y="20" fill="var(--ink-faint)" fontSize="11" fontStyle="italic">Oceano Atlântico</text>

        {zones.map((z) => {
          const box = LAYOUT[z.zoneId];
          if (!box) return null;
          const tone = toneVar[lateTone(z.lateRatePct)];
          const active = highlightZone === z.zoneId || selectedZone === z.zoneId;
          const zr = restaurants.filter((r) => r.zoneId === z.zoneId);
          return (
            <g
              key={z.zoneId}
              tabIndex={0}
              role="button"
              aria-pressed={selectedZone === z.zoneId}
              aria-label={`${z.zone}: ${n1(z.lateRatePct)}% de atraso${z.raining ? ", chovendo" : ""}`}
              onClick={() => onSelectZone(selectedZone === z.zoneId ? null : z.zoneId)}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSelectZone(selectedZone === z.zoneId ? null : z.zoneId)}
              className="cursor-pointer outline-none"
            >
              <rect
                x={box.x} y={box.y} width={box.w} height={box.h} rx={14}
                fill={tone} fillOpacity={active ? 0.32 : 0.18}
                stroke={tone} strokeWidth={active ? 2.5 : 1.2}
                style={{ transition: "fill-opacity .2s, stroke-width .2s" }}
              />
              {z.raining && <rect x={box.x} y={box.y} width={box.w} height={box.h} rx={14} fill="url(#rain)" pointerEvents="none" />}
              <text x={box.x + 12} y={box.y + 22} fill="var(--ink)" fontSize="13" fontWeight="600">{z.zone}</text>
              <text x={box.x + 12} y={box.y + 52} fill={tone} fontSize="26" fontWeight="700" style={{ fontFamily: "var(--font-bricolage)" }}>
                {n1(z.lateRatePct)}%
              </text>
              <text x={box.x + 12} y={box.y + 68} fill="var(--ink-soft)" fontSize="10.5">
                {z.activeCouriers} entregadores{z.raining ? ", chovendo" : ""}
              </text>
              {zr.map((r, i) => {
                const flagged = flaggedRestaurants.has(r.restaurantId);
                const hl = highlightRestaurant === r.restaurantId;
                const cx = box.x + box.w - 16 - i * 16;
                const cy = box.y + 18;
                return (
                  <g key={r.restaurantId}>
                    <title>{`${r.restaurant}: ${n1(r.lateRatePct)}% de atraso`}</title>
                    {(flagged || hl) && <circle cx={cx} cy={cy} r={hl ? 9 : 7.5} fill="none" stroke="var(--bad)" strokeWidth={1.6} />}
                    <circle cx={cx} cy={cy} r={4} fill={toneVar[lateTone(r.lateRatePct)]} />
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink-soft">
        <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-sm bg-ok" /> até 15% de atraso</span>
        <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-sm bg-warn" /> 15–40%</span>
        <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-sm bg-bad" /> acima de 40%</span>
        <span className="flex items-center gap-1.5"><i className="h-2.5 w-3 rounded-sm" style={{ background: "repeating-linear-gradient(110deg, var(--rain) 0 1.5px, transparent 1.5px 5px)" }} /> chuva</span>
        <span className="flex items-center gap-1.5"><i className="size-2 rounded-full bg-ink-soft" /> restaurante</span>
      </figcaption>
    </figure>
  );
}
