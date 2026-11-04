"use client";

import { Card, CardError } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TableDetails } from "@/components/ui/table-details";
import { formatBerlin, formatNumber } from "@/lib/format";
import type { PriceData } from "@/lib/queries/prices";
import { useNow } from "@/lib/hooks/use-now";
import { QUARTER_HOUR_MS } from "@/lib/time";

const W = 360;
const H = 120;
const PAD_L = 26;

/** Day-ahead price now plus a 15-minute bar chart for today and tomorrow. */
export function PriceCard({ data, error }: { data: PriceData | null; error: string | null }) {
  return (
    <Card labelledBy="price-title" className="min-h-[420px]">
      <div className="flex items-start justify-between">
        <h2 id="price-title" className="text-sm font-medium text-slate-500">
          Day-Ahead-Preis
        </h2>
        <span className="text-xs text-slate-500">DE-LU · 15 min</span>
      </div>
      {data == null ? (
        error ? <CardError /> : <Skeleton className="mt-4 h-72 w-full" />
      ) : (
        <PriceBody data={data} />
      )}
    </Card>
  );
}

function PriceBody({ data }: { data: PriceData }) {
  const now = useNow(30_000);
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

  return (
    <>
      <p className="mt-3 text-4xl font-semibold tracking-tight tabular-nums">
        {data.now ? formatNumber(data.now.price, 2) : "–"}
        <span className="ml-1.5 text-lg font-medium text-slate-500">€/MWh</span>
      </p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-slate-50 px-3 py-2">
          <p className="text-xs text-slate-500">Heute Ø</p>
          <p className="font-semibold tabular-nums">{formatNumber(data.avgToday, 2)}</p>
        </div>
        <div className="rounded-xl bg-slate-50 px-3 py-2">
          <p className="text-xs text-slate-500">Morgen Ø</p>
          <p className="font-semibold tabular-nums">{data.tomorrowAvailable ? formatNumber(data.avgTomorrow, 2) : "ab ca. 13 Uhr"}</p>
        </div>
      </div>

      <svg
        viewBox={`0 -14 ${W} ${H + 32}`}
        className="mt-4 w-full"
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
      </svg>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
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
