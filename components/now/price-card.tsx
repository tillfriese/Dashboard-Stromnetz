"use client";

import { useState } from "react";
import { Card, CardError } from "@/components/ui/card";
import { HoverTooltip, svgPoint } from "@/components/ui/hover-tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { TableDetails } from "@/components/ui/table-details";
import { formatBerlin, formatNumber } from "@/lib/format";
import type { PriceData } from "@/lib/queries/prices";
import { useNow } from "@/lib/hooks/use-now";
import { QUARTER_HOUR_MS } from "@/lib/time";

const W = 360;
const H = 92;
const PAD_L = 26;
const VIEWBOX = { x: 0, y: -14, w: W, h: H + 32 };

/** Day-ahead price now plus a 15-minute bar chart for today and tomorrow. */
export function PriceCard({ data, error }: { data: PriceData | null; error: string | null }) {
  return (
    <Card labelledBy="price-title" compact className="min-h-80 flex-1">
      <div className="flex items-start justify-between">
        <h2 id="price-title" className="text-sm font-medium text-slate-500">
          Day-Ahead-Preis
        </h2>
        <span className="text-xs text-slate-500">DE-LU · 15 min</span>
      </div>
      {data == null ? (
        error ? <CardError /> : <Skeleton className="mt-3 h-60 w-full" />
      ) : (
        <PriceBody data={data} />
      )}
    </Card>
  );
}

function PriceBody({ data }: { data: PriceData }) {
  const now = useNow(30_000);
  const [hoverTs, setHoverTs] = useState<number | null>(null);
  const start = data.dayBoundaries[0]!;
  const end = data.tomorrowAvailable ? data.dayBoundaries[2]! : data.dayBoundaries[1]!;
  const pts = data.points.filter(([ts]) => ts < end);

  if (pts.length === 0) return <CardError message="Noch keine Preise für heute." />;
  const values = pts.map(([, v]) => v);
  const max = Math.max(50, ...values);
  const min = Math.min(0, ...values);
  const span = max - min;
  const x = (ts: number) => PAD_L + ((ts - start) / (end - start)) * (W - PAD_L);
  const y = (v: number) => H - ((v - min) / span) * H;
  const bw = Math.max(0.6, ((W - PAD_L) * QUARTER_HOUR_MS) / (end - start) - 0.4);
  const ticks = niceTicks(min, max);
  const hovered = hoverTs == null ? null : pts.find(([ts]) => ts === hoverTs) ?? null;

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const p = svgPoint(e, VIEWBOX);
    if (p.x < PAD_L) return setHoverTs(null);
    const t = start + ((p.x - PAD_L) / (W - PAD_L)) * (end - start);
    const q = Math.floor(t / QUARTER_HOUR_MS) * QUARTER_HOUR_MS;
    setHoverTs(pts.some(([ts]) => ts === q) ? q : null);
  };

  return (
    <>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <p className="text-3xl font-semibold tracking-tight tabular-nums">
          {data.now ? formatNumber(data.now.price, 2) : "–"}
          <span className="ml-1.5 text-base font-medium text-slate-500">€/MWh</span>
        </p>
        <dl className="flex gap-4 text-right text-xs">
          <div>
            <dt className="text-slate-500">Heute Ø</dt>
            <dd className="text-sm font-semibold tabular-nums">{formatNumber(data.avgToday, 2)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Morgen Ø</dt>
            <dd className="text-sm font-semibold tabular-nums">{data.tomorrowAvailable ? formatNumber(data.avgTomorrow, 2) : "ab ca. 13 Uhr"}</dd>
          </div>
        </dl>
      </div>

      <div className="relative mt-3">
      <svg
        viewBox={`${VIEWBOX.x} ${VIEWBOX.y} ${VIEWBOX.w} ${VIEWBOX.h}`}
        className="w-full cursor-crosshair"
        onMouseMove={onMove}
        onMouseLeave={() => setHoverTs(null)}
        role="img"
        aria-label={`Day-Ahead-Preise in 15-Minuten-Auflösung, heute${data.tomorrowAvailable ? " und morgen" : ""}. Aktuell ${data.now ? formatNumber(data.now.price, 2) : "unbekannt"} Euro pro Megawattstunde.`}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD_L} x2={W} y1={y(t)} y2={y(t)} className="stroke-slate-100" />
            <text x={PAD_L - 4} y={y(t) + 3} textAnchor="end" className="fill-slate-400 text-[8px] tabular-nums">
              {t}
            </text>
          </g>
        ))}
        {pts.map(([ts, v]) => {
          const past = ts + QUARTER_HOUR_MS <= now;
          const cls = v < 0 ? "fill-indigo-500" : past ? "fill-slate-300" : "fill-slate-700";
          return <rect key={ts} x={x(ts)} width={bw} y={Math.min(y(v), y(0))} height={Math.max(0.5, Math.abs(y(v) - y(0)))} className={cls} />;
        })}
        {now >= start && now < end ? (
          <g>
            <line x1={x(now)} x2={x(now)} y1={-6} y2={H} className="stroke-indigo-600" strokeWidth={1.2} />
            <text x={x(now)} y={-8} textAnchor="middle" className="fill-indigo-600 text-[8px] font-medium">
              jetzt
            </text>
          </g>
        ) : null}
        {data.dayBoundaries.slice(0, data.tomorrowAvailable ? 2 : 1).flatMap((d, i) => [
          <text key={`d${i}`} x={x(d) + 2} y={H + 14} className="fill-slate-400 text-[8px]">
            {i === 0 ? "heute" : "morgen"}
          </text>,
          <text key={`n${i}`} x={x(d + 12 * 3600_000)} y={H + 14} textAnchor="middle" className="fill-slate-400 text-[8px]">
            12:00
          </text>,
        ])}
        {data.tomorrowAvailable ? <line x1={x(data.dayBoundaries[1]!)} x2={x(data.dayBoundaries[1]!)} y1={0} y2={H} className="stroke-slate-200" /> : null}
        {hovered ? (
          <rect
            x={x(hovered[0]) - 0.8}
            width={bw + 1.6}
            y={Math.min(y(hovered[1]), y(0)) - 0.8}
            height={Math.max(0.5, Math.abs(y(hovered[1]) - y(0))) + 1.6}
            className="fill-none stroke-indigo-600"
            strokeWidth={1}
            pointerEvents="none"
          />
        ) : null}
      </svg>
      {hovered ? (
        <HoverTooltip xPct={((x(hovered[0]) + bw / 2 - VIEWBOX.x) / VIEWBOX.w) * 100} yPct={((Math.min(y(hovered[1]), y(0)) - VIEWBOX.y) / VIEWBOX.h) * 100}>
          <span className="text-slate-500">
            {formatBerlin(hovered[0], "EEE HH:mm")}–{formatBerlin(hovered[0] + QUARTER_HOUR_MS, "HH:mm")}
          </span>{" "}
          <span className={`font-semibold ${hovered[1] < 0 ? "text-indigo-700" : "text-slate-900"}`}>{formatNumber(hovered[1], 2)} €/MWh</span>
        </HoverTooltip>
      ) : null}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
        <Legend cls="bg-slate-700" label="kommend" />
        <Legend cls="bg-slate-300" label="vergangen" />
        <Legend cls="bg-indigo-500" label="negativ" />
      </div>
      <TableDetails
        head={["Zeit", "€/MWh"]}
        rows={pts.map(([ts, v]) => [formatBerlin(ts, "EEE HH:mm"), formatNumber(v, 2)])}
      />
    </>
  );
}

function Legend({ cls, label }: { cls: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden className={`size-2.5 rounded-sm ${cls}`} />
      {label}
    </span>
  );
}

function niceTicks(min: number, max: number): number[] {
  const step = [10, 20, 25, 50, 100, 200].find((s) => (max - min) / s <= 4) ?? 500;
  const out: number[] = [];
  for (let t = Math.ceil(min / step) * step; t <= max; t += step) out.push(t);
  return out;
}
