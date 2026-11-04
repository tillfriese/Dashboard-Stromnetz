"use client";

import { useState } from "react";
import { Card, CardError } from "@/components/ui/card";
import { HoverTooltip, svgPoint } from "@/components/ui/hover-tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBerlin, formatNumber, formatSigned } from "@/lib/format";
import { useNow } from "@/lib/hooks/use-now";
import { usePolling } from "@/lib/hooks/use-polling";

type Freq = { available: boolean; error?: string | null; source?: string; latest?: { ts: number; hz: number }; deviationMHz?: number; points?: [number, number][] };

const W = 320;
const H = 64;
const RANGE = 0.1; // ±100 mHz

/** Grid frequency, polled every 5 s, with a 5-minute sparkline around the 50 Hz setpoint. */
export function FrequencyCard() {
  const { data, error, loading } = usePolling<Freq>("/api/frequency", 5_000);
  const pts = data?.points ?? [];
  const t0 = pts[0]?.[0] ?? 0;
  const t1 = pts.at(-1)?.[0] ?? 1;
  const x = (t: number) => ((t - t0) / Math.max(1, t1 - t0)) * W;
  const y = (hz: number) => H / 2 - ((hz - 50) / RANGE) * (H / 2);
  const line = pts.map(([t, hz]) => `${x(t).toFixed(1)},${Math.max(0, Math.min(H, y(hz))).toFixed(1)}`).join(" ");
  const now = useNow(5_000);
  const [hoverTs, setHoverTs] = useState<number | null>(null);
  const hovered = hoverTs == null ? null : (pts.find(([t]) => t === hoverTs) ?? null);
  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!pts.length) return;
    const { x: vx } = svgPoint(e, { x: 0, y: 0, w: W, h: H });
    const t = t0 + (vx / W) * (t1 - t0);
    // nearest sample (1-second resolution)
    let best = pts[0]!;
    for (const p of pts) if (Math.abs(p[0] - t) < Math.abs(best[0] - t)) best = p;
    setHoverTs(best[0]);
  };
  const ageS = data?.latest ? Math.round((now - data.latest.ts) / 1000) : null;

  return (
    <Card labelledBy="freq-title" compact className="min-h-48">
      <div className="flex items-start justify-between">
        <h2 id="freq-title" className="text-sm font-medium text-slate-500">
          Netzfrequenz
        </h2>
        {data?.available ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
            <span aria-hidden className="size-1.5 rounded-full bg-emerald-500" />
            live · 1 s{data.source === "energycharts" ? " · ca. " + Math.max(1, Math.round((ageS ?? 60) / 60)) + " min Verzug" : ""}
          </span>
        ) : null}
      </div>
      {loading ? (
        <Skeleton className="mt-3 h-24 w-full" />
      ) : !data?.available || !data.latest ? (
        <CardError
          message={
            error || data?.error
              ? "Frequenzquelle derzeit nicht verfügbar."
              : "Frequenzwerte werden geladen …" /* buffer still empty, e.g. right after a restart */
          }
        />
      ) : (
        <>
          <div className="mt-2 flex items-baseline justify-between">
            <p className="font-mono text-3xl font-semibold tracking-tight tabular-nums">
              {formatNumber(data.latest.hz, 3)}
              <span className="ml-1.5 font-sans text-base font-medium text-slate-500">Hz</span>
            </p>
            <p className={`font-mono text-sm tabular-nums ${Math.abs(data.deviationMHz ?? 0) > 50 ? "text-amber-700" : "text-slate-600"}`}>
              {formatSigned(data.deviationMHz ?? 0, 0)} mHz
            </p>
          </div>
          <div className="relative mt-3">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="h-14 w-full cursor-crosshair"
            preserveAspectRatio="none"
            onMouseMove={onMove}
            onMouseLeave={() => setHoverTs(null)}
            role="img" aria-label={`Netzfrequenz der letzten 5 Minuten, aktuell ${formatNumber(data.latest.hz, 3)} Hertz`}>
            <rect x={0} y={y(50.02)} width={W} height={y(49.98) - y(50.02)} className="fill-slate-50" />
            <line x1={0} x2={W} y1={y(50)} y2={y(50)} className="stroke-slate-300" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
            <polyline points={line} fill="none" className="stroke-slate-900" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
            {pts.length ? <circle cx={x(t1)} cy={y(pts.at(-1)![1])} r={2.5} className="fill-indigo-600" /> : null}
            {hovered ? (
              <line x1={x(hovered[0])} x2={x(hovered[0])} y1={0} y2={H} className="stroke-indigo-300" vectorEffect="non-scaling-stroke" pointerEvents="none" />
            ) : null}
          </svg>
          {hovered ? (
            <>
              {/* HTML dot: the SVG is stretched (preserveAspectRatio="none"), a circle would distort. */}
              <span
                aria-hidden
                className="pointer-events-none absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-600 ring-2 ring-surface"
                style={{ left: `${(x(hovered[0]) / W) * 100}%`, top: `${(Math.max(0, Math.min(H, y(hovered[1]))) / H) * 100}%` }}
              />
              <HoverTooltip xPct={(x(hovered[0]) / W) * 100} yPct={0}>
                <span className="text-slate-500">{formatBerlin(hovered[0], "HH:mm:ss")} Uhr</span>{" "}
                <span className="font-semibold text-slate-900">{formatNumber(hovered[1], 3)} Hz</span>{" "}
                <span className="text-slate-500">({formatSigned((hovered[1] - 50) * 1000, 0)} mHz)</span>
              </HoverTooltip>
            </>
          ) : null}
          </div>
          <div className="mt-1.5 flex justify-between text-xs text-slate-500">
            <span>−5 min</span>
            <span>Sollwert 50,000 Hz</span>
            <span>jetzt</span>
          </div>
        </>
      )}
    </Card>
  );
}
