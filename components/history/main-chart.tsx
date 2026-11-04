"use client";

import { useRef, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardTitle } from "@/components/ui/card";
import { Segmented } from "@/components/ui/segmented";
import { TableDetails } from "@/components/ui/table-details";
import { CARRIERS } from "@/lib/carriers";
import { formatNumber } from "@/lib/format";
import { energyUnit, type Row } from "@/lib/history/derive";
import { type ChartType, drillDown, type HistoryQuery, regionLabel, type Resolution, showsEnergy } from "@/lib/history/query";
import { bucketLabel } from "./format";

const TYPES = [
  { value: "stacked", label: "Gestapelt" },
  { value: "percent", label: "100 %" },
  { value: "lines", label: "Linien" },
] as const;

type ChartRow = Record<string, number | string | null>;

export function MainChart({
  rows,
  prevRows,
  res,
  query: q,
  update,
  onTrack,
}: {
  rows: Row[];
  prevRows: Row[] | null;
  res: Resolution;
  query: HistoryQuery;
  update: (p: Partial<HistoryQuery>) => void;
  onTrack?: (name: string, props?: Record<string, unknown>) => void;
}) {
  const carriers = CARRIERS.filter((c) => q.carriers.includes(c.key));
  const energy = showsEnergy(res);
  const max = Math.max(0, ...rows.map((r) => r.total ?? 0));
  const { unit, factor } = energyUnit(res, max);
  const percent = q.chart === "percent";
  const data: ChartRow[] = rows.map((r, i) => {
    const out: ChartRow = { label: r.label };
    for (const c of carriers) out[c.key] = r.carriers[c.key] == null ? null : r.carriers[c.key]! * factor;
    if (prevRows) out.prev = prevRows[i]?.total == null ? null : prevRows[i]!.total! * factor;
    return out;
  });

  // Zoom by dragging across the chart; a plain click on a bucket drills down one level.
  // Drag to zoom. The ref holds the live selection (Recharts dispatches mouse events in animation
  // frames, and at mousedown its tooltip may not be active yet, so the start can come from the
  // first mousemove). Drill-down on click is handled by the bars / the chart's onClick.
  const [drag, setDrag] = useState<{ a: string; b: string } | null>(null);
  const dragRef = useRef<{ a: string | null; b: string | null } | null>(null);
  const label = (s: { activeLabel?: string | number } | null | undefined) => (s?.activeLabel == null ? null : String(s.activeLabel));
  const drill = (l: string | null) => {
    if (!l) return;
    const next = drillDown(l.slice(0, 10), res);
    if (next) {
      update(next);
      onTrack?.("chart_drilldown", { res: next.res });
    }
  };
  const handlers = {
    onMouseDown: (s: { activeLabel?: string | number }) => {
      dragRef.current = { a: label(s), b: label(s) };
    },
    onMouseMove: (s: { activeLabel?: string | number }) => {
      const cur = dragRef.current;
      const l = label(s);
      if (!cur || !l) return;
      cur.a ??= l;
      if (l !== cur.b) {
        cur.b = l;
        if (cur.a !== cur.b) setDrag({ a: cur.a, b: cur.b });
      }
    },
    onMouseUp: () => {
      const sel = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      if (!sel?.a || !sel.b || sel.a === sel.b) return;
      const [a, b] = [sel.a, sel.b].sort();
      update({ from: a!.slice(0, 10), to: b!.slice(0, 10), res: "auto" });
      onTrack?.("chart_zoom");
    },
    onMouseLeave: () => {
      dragRef.current = null;
      setDrag(null);
    },
  };

  const common = {
    data,
    margin: { top: 8, right: 8, bottom: 0, left: 0 },
    stackOffset: percent ? ("expand" as const) : ("none" as const),
    ...handlers,
  };
  const axis = (
    <>
      <CartesianGrid vertical={false} stroke="var(--color-slate-100)" />
      <XAxis
        dataKey="label"
        tickFormatter={(l: string) => bucketLabel(l, res, true)}
        tick={{ fontSize: 12, fill: "var(--color-slate-500)" }}
        tickLine={false}
        axisLine={{ stroke: "var(--color-slate-200)" }}
        minTickGap={24}
      />
      <YAxis
        width={52}
        tick={{ fontSize: 12, fill: "var(--color-slate-500)" }}
        tickLine={false}
        axisLine={false}
        tickFormatter={(v: number) => (percent ? `${Math.round(v * 100)} %` : formatNumber(v, v >= 100 ? 0 : 1))}
      />
      <Tooltip content={<RowTooltip res={res} unit={percent ? "%" : unit} percent={percent} />} isAnimationActive={false} />
      {drag && drag.a !== drag.b ? <ReferenceArea x1={drag.a} x2={drag.b} fill="#6366f1" fillOpacity={0.1} /> : null}
    </>
  );

  const chart =
    q.chart === "lines" ? (
      <LineChart {...common} onClick={(st: { activeLabel?: string | number }) => drill(label(st))}>
        {axis}
        {carriers.map((c) => (
          <Line key={c.key} dataKey={c.key} name={c.label} stroke={c.color} strokeWidth={2} dot={false} isAnimationActive={false} />
        ))}
        {prevRows ? <Line dataKey="prev" name="Vorjahr (Summe)" stroke="var(--color-slate-900)" strokeDasharray="5 4" dot={false} isAnimationActive={false} /> : null}
      </LineChart>
    ) : energy ? (
      <ComposedChart {...common} barCategoryGap="18%">
        {axis}
        {carriers.map((c) => (
          <Bar
            key={c.key}
            dataKey={c.key}
            name={c.label}
            stackId="mix"
            fill={c.color}
            isAnimationActive={false}
            className="cursor-pointer"
            onClick={(d: { payload?: { label?: string } }) => drill(d?.payload?.label ?? null)}
          />
        ))}
        {prevRows && !percent ? <Line dataKey="prev" name="Vorjahr (Summe)" stroke="var(--color-slate-900)" strokeDasharray="5 4" dot={false} isAnimationActive={false} /> : null}
      </ComposedChart>
    ) : (
      <AreaChart {...common} onClick={(st: { activeLabel?: string | number }) => drill(label(st))}>
        {axis}
        {carriers.map((c) => (
          <Area key={c.key} dataKey={c.key} name={c.label} stackId="mix" type="monotone" stroke="none" fill={c.color} fillOpacity={0.95} isAnimationActive={false} />
        ))}
      </AreaChart>
    );

  const regionName = regionLabel(q.regions);
  const what = energy ? `Erzeugung je ${bucketLabelUnit(res)} in ${unit}` : `mittlere Leistung in ${unit}`;
  return (
    <Card labelledBy="main-chart">
      <CardTitle
        id="main-chart"
        sub={`${what}, ${percent ? "Anteile (100 %)" : q.chart === "lines" ? "als Linien" : "gestapelt"} · ${regionName}`}
        right={
          <Segmented
            label="Diagrammtyp"
            value={q.chart}
            options={TYPES}
            onChange={(chart: ChartType) => {
              update({ chart });
              onTrack?.("chart_type", { chart });
            }}
          />
        }
      >
        Nettoerzeugung nach Energieträger
      </CardTitle>
      <ul className="mt-5 flex flex-wrap gap-x-4 gap-y-2 text-sm text-slate-600" aria-label="Legende">
        {carriers.map((c) => (
          <li key={c.key} className="inline-flex items-center gap-1.5">
            <span aria-hidden className="size-2.5 rounded-sm" style={{ background: c.color }} />
            {c.label}
          </li>
        ))}
        {prevRows ? (
          <li className="inline-flex items-center gap-1.5">
            <span aria-hidden className="w-4 border-t-2 border-dashed border-slate-900" />
            Vorjahreszeitraum (Summe)
          </li>
        ) : null}
      </ul>
      <div
        className="mt-4 h-[380px] select-none"
        role="img"
        aria-label={`Diagramm: Nettoerzeugung ${regionName}, ${rows.length} Abschnitte, ${what}. Ziehen zoomt, Klick auf einen Abschnitt öffnet die nächstfeinere Auflösung.`}
      >
        {carriers.length === 0 ? (
          <p className="grid h-full place-items-center text-sm text-slate-500">Keine Energieträger ausgewählt.</p>
        ) : rows.length === 0 ? (
          <p className="grid h-full place-items-center text-sm text-slate-500">Keine Daten für diese Auswahl.</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            {chart}
          </ResponsiveContainer>
        )}
      </div>
      <p className="mt-3 text-xs text-slate-500">
        Ziehen über das Diagramm zoomt in den Zeitraum{res !== "15min" ? ", Klick auf einen Abschnitt springt eine Auflösung tiefer" : ""}. Quelle:
        Bundesnetzagentur | SMARD.de (CC BY 4.0)
      </p>
      <TableDetails
        head={["Zeitraum", ...carriers.map((c) => `${c.label} [${unit}]`)]}
        rows={data.slice(-500).map((r) => [bucketLabel(String(r.label), res), ...carriers.map((c) => formatNumber(r[c.key] as number | null, 2))])}
      />
    </Card>
  );
}

function bucketLabelUnit(res: Resolution) {
  return { year: "Jahr", month: "Monat", week: "Woche", day: "Tag", hour: "Stunde", "15min": "Viertelstunde" }[res];
}

type TooltipProps = {
  active?: boolean;
  label?: string;
  payload?: { dataKey: string; name: string; value: number | null; color?: string; fill?: string; stroke?: string; payload: ChartRow }[];
  res: Resolution;
  unit: string;
  percent: boolean;
};

function RowTooltip({ active, payload, label, res, unit, percent }: TooltipProps) {
  if (!active || !payload?.length || !label) return null;
  const row = payload[0]!.payload;
  const items = payload.filter((p) => p.dataKey !== "prev" && p.value != null);
  const total = items.reduce((a, p) => a + Number(row[p.dataKey] ?? 0), 0);
  return (
    <div className="min-w-56 rounded-xl border border-slate-200 bg-surface p-3 text-sm shadow-md">
      <p className="mb-2 font-medium">{bucketLabel(label, res)}</p>
      <table className="w-full tabular-nums">
        <tbody>
          {[...items].reverse().map((p) => {
            const v = Number(row[p.dataKey] ?? 0);
            return (
              <tr key={p.dataKey}>
                <td className="py-0.5 pr-3">
                  <span aria-hidden className="mr-1.5 inline-block size-2 rounded-sm" style={{ background: p.fill ?? p.stroke ?? p.color }} />
                  {p.name}
                </td>
                <td className="text-right">{percent ? `${formatNumber((v / total) * 100, 1)} %` : `${formatNumber(v, 2)} ${unit}`}</td>
              </tr>
            );
          })}
          {!percent ? (
            <tr className="border-t border-slate-100 font-medium">
              <td className="pt-1 pr-3">Summe</td>
              <td className="pt-1 text-right">
                {formatNumber(total, 2)} {unit}
              </td>
            </tr>
          ) : null}
          {row.prev != null ? (
            <tr>
              <td className="pr-3 text-slate-600">Vorjahr</td>
              <td className="text-right">
                {formatNumber(Number(row.prev), 2)} {unit}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
