"use client";

import { useState } from "react";
import { Area, ComposedChart, Line, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardError, CardTitle } from "@/components/ui/card";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { TableDetails } from "@/components/ui/table-details";
import { CARRIERS } from "@/lib/carriers";
import { formatBerlin, formatNumber } from "@/lib/format";
import { usePolling } from "@/lib/hooks/use-polling";
import type { MixData, MixPoint, MixWindow } from "@/lib/queries/mix";
import { addBerlinDays, startOfBerlinDay } from "@/lib/time";

const WINDOWS = [
  { value: "24h", label: "24 h" },
  { value: "48h", label: "48 h" },
  { value: "7d", label: "7 Tage" },
] as const;

const TITLES: Record<MixWindow, string> = { "24h": "letzte 24 Stunden", "48h": "letzte 48 Stunden", "7d": "letzte 7 Tage" };
// null (not undefined) makes Recharts draw a gap instead of stacking a missing value as 0.
const gw = (mw: number | undefined) => (mw == null ? null : mw / 1000);

export function MixChart({ initial, onWindowChange }: { initial: MixData | null; onWindowChange?: (w: MixWindow) => void }) {
  const [window, setWindow] = useState<MixWindow>("48h");
  const { data, error } = usePolling<MixData>(`/api/mix?window=${window}`, 60_000, window === "48h" ? initial : null);

  return (
    <Card labelledBy="mix-title" className="mt-6">
      <CardTitle
        id="mix-title"
        sub="Nettoerzeugung in GW je Viertelstunde · rechts vom Strich Day-Ahead-Prognosen der Übertragungsnetzbetreiber"
        right={
          <Segmented
            label="Zeitfenster"
            value={window}
            options={WINDOWS}
            onChange={(w) => {
              setWindow(w);
              onWindowChange?.(w);
            }}
          />
        }
      >
        Strommix · {TITLES[window]} und Prognose
      </CardTitle>

      <ul className="mt-5 flex flex-wrap gap-x-4 gap-y-2 text-sm text-slate-600" aria-label="Legende">
        {CARRIERS.map((c) => (
          <li key={c.key} className="inline-flex items-center gap-1.5">
            <span aria-hidden className="size-2.5 rounded-sm" style={{ background: c.color }} />
            {c.label}
          </li>
        ))}
        <li className="inline-flex items-center gap-1.5">
          <span aria-hidden className="h-0.5 w-4 bg-slate-900" />
          Netzlast
        </li>
        <li className="inline-flex items-center gap-1.5">
          <span aria-hidden className="w-4 border-t-2 border-dashed border-slate-900" />
          Last-Prognose
        </li>
        <li className="inline-flex items-center gap-1.5">
          <span aria-hidden className="w-4 border-t-2 border-dashed border-indigo-600" />
          Prognose Wind + PV
        </li>
      </ul>

      <div className="mt-4 h-[360px]">
        {!data ? error ? <CardError /> : <Skeleton className="h-full w-full" /> : <Chart data={data} window={window} />}
      </div>
      {data ? <MixTable data={data} /> : null}
      <p className="mt-4 text-xs text-slate-500">
        Quellen: Bundesnetzagentur | SMARD.de (CC BY 4.0). Gestrichelt: Day-Ahead-Prognosen der Übertragungsnetzbetreiber.
      </p>
    </Card>
  );
}

function Chart({ data, window }: { data: MixData; window: MixWindow }) {
  const rows = data.points.map((p) => {
    const r: Record<string, number | null> = { ts: p.ts };
    for (const c of CARRIERS) r[c.key] = gw(p[c.key]);
    r.load = gw(p.load);
    r.loadForecast = gw(p.loadForecast);
    r.reForecast = gw(p.reForecast);
    return r;
  });
  const ticks: number[] = [];
  for (let d = addBerlinDays(startOfBerlinDay(data.from), 1); d < data.to; d = addBerlinDays(d, 1)) ticks.push(d);
  const lastActual = data.nowTs;

  return (
    <div role="img" aria-label={`Gestapelte Flächen des Strommixes ${TITLES[window]} in Gigawatt mit Netzlast und Prognosen bis morgen.`} className="h-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 22, right: 8, bottom: 0, left: 0 }}>
          <XAxis
            dataKey="ts"
            type="number"
            scale="time"
            domain={[data.from, data.to]}
            ticks={ticks}
            tickFormatter={(t: number) => formatBerlin(t, window === "7d" ? "EEEEEE dd.MM." : "EEEEEE")}
            tick={{ fontSize: 12, fill: "#64748b" }}
            axisLine={{ stroke: "#e2e8f0" }}
            tickLine={false}
          />
          <YAxis
            width={44}
            tickFormatter={(v: number) => `${v}`}
            tick={{ fontSize: 12, fill: "#64748b" }}
            axisLine={false}
            tickLine={false}
            label={{ value: "GW", position: "insideTopLeft", offset: -18, fontSize: 12, fill: "#64748b" }}
          />
          {lastActual ? <ReferenceArea x1={lastActual} x2={data.to} fill="#f8fafc" fillOpacity={1} ifOverflow="extendDomain" /> : null}
          {CARRIERS.map((c) => (
            <Area
              key={c.key}
              dataKey={c.key}
              stackId="mix"
              type="monotone"
              stroke="none"
              fill={c.color}
              fillOpacity={0.95}
              isAnimationActive={false}
              connectNulls={false}
            />
          ))}
          <Line dataKey="load" stroke="#0f172a" strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={false} />
          <Line dataKey="loadForecast" stroke="#0f172a" strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
          <Line dataKey="reForecast" stroke="#4f46e5" strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
          {lastActual ? (
            <ReferenceLine
              x={lastActual}
              stroke="#4f46e5"
              strokeWidth={1.5}
              label={{ value: "jetzt · Prognose →", position: "insideTopLeft", fill: "#4f46e5", fontSize: 12, fontWeight: 500, offset: 6 }}
            />
          ) : null}
          <Tooltip content={<MixTooltip />} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

type TooltipProps = { active?: boolean; label?: number; payload?: { payload: Record<string, number | null> }[] };

function MixTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length || label == null) return null;
  const r = payload[0]!.payload;
  const total = CARRIERS.reduce((a, c) => a + (r[c.key] ?? 0), 0);
  const hasMix = CARRIERS.some((c) => r[c.key] != null);
  return (
    <div className="min-w-56 rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-md">
      <p className="mb-2 font-medium tabular-nums">
        {formatBerlin(label, "EEE dd.MM. HH:mm")}–{formatBerlin(label + 15 * 60_000, "HH:mm")}
      </p>
      <table className="w-full tabular-nums">
        <tbody>
          {hasMix
            ? [...CARRIERS].reverse().map((c) => (
                <tr key={c.key}>
                  <td className="py-0.5 pr-3">
                    <span aria-hidden className="mr-1.5 inline-block size-2 rounded-sm" style={{ background: c.color }} />
                    {c.label}
                  </td>
                  <td className="text-right">{formatNumber(r[c.key], 1)} GW</td>
                </tr>
              ))
            : null}
          {hasMix ? (
            <tr className="border-t border-slate-100 font-medium">
              <td className="pt-1 pr-3">Erzeugung</td>
              <td className="pt-1 text-right">{formatNumber(total, 1)} GW</td>
            </tr>
          ) : null}
          {r.load != null ? <Row label="Netzlast" v={r.load} /> : null}
          {r.loadForecast != null ? <Row label="Last-Prognose" v={r.loadForecast} /> : null}
          {r.reForecast != null ? <Row label="Prognose Wind + PV" v={r.reForecast} /> : null}
        </tbody>
      </table>
    </div>
  );
}

function Row({ label, v }: { label: string; v: number }) {
  return (
    <tr>
      <td className="py-0.5 pr-3 text-slate-600">{label}</td>
      <td className="text-right">{formatNumber(v, 1)} GW</td>
    </tr>
  );
}

/** Hourly table alternative (every 4th quarter hour) to keep it readable. */
function MixTable({ data }: { data: MixData }) {
  const hourly = data.points.filter((p) => new Date(p.ts).getUTCMinutes() === 0);
  const val = (p: MixPoint, k: keyof MixPoint) => formatNumber(gw(p[k] as number | undefined), 1);
  return (
    <TableDetails
      head={["Zeit", ...CARRIERS.map((c) => c.label), "Netzlast", "Last-Prognose", "Prognose Wind + PV"]}
      rows={hourly.map((p) => [
        formatBerlin(p.ts, "EEE HH:mm"),
        ...CARRIERS.map((c) => val(p, c.key)),
        val(p, "load"),
        val(p, "loadForecast"),
        val(p, "reForecast"),
      ])}
    />
  );
}
