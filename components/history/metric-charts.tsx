"use client";

import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardTitle } from "@/components/ui/card";
import { TableDetails } from "@/components/ui/table-details";
import { CARRIERS } from "@/lib/carriers";
import { formatBerlin, formatNumber } from "@/lib/format";
import type { Row } from "@/lib/history/derive";
import { type HistoryQuery, regionLabel, type Resolution } from "@/lib/history/query";
import type { TimeseriesResponse } from "@/lib/history/types";
import { bucketLabel } from "./format";

type Series = { key: string; name: string; color: string; dashed?: boolean };

/** One chart per unit: load (GW), price, CO2, import/export, installed power. Never two y-axes. */
export function MetricCharts({ data, rows: base, query: q }: { data: TimeseriesResponse; rows: Row[]; query: HistoryQuery }) {
  const res = data.res;
  const charts: React.ReactNode[] = [];

  if (q.metrics.includes("load") || q.metrics.includes("residual")) {
    const rows = base.map((r) => ({
      label: r.label,
      load: r.loadMW == null ? null : r.loadMW / 1000,
      res: r.residualMW == null ? null : r.residualMW / 1000,
    }));
    const series: Series[] = [
      ...(q.metrics.includes("load") ? [{ key: "load", name: "Netzlast", color: "#0f172a" }] : []),
      ...(q.metrics.includes("residual") ? [{ key: "res", name: "Residuallast", color: "#d97706", dashed: true }] : []),
    ];
    charts.push(
      <LineCard key="load" id="m-load" title="Netzlast und Residuallast" sub={`Mittlere Leistung in GW · ${regionLabel(q.regions)}`} unit="GW" rows={rows} series={series} res={res} zeroLine />,
    );
  }

  if (q.metrics.includes("price") && !data.publicMode) {
    const rows = base.map((r) => ({ label: r.label, price: r.price }));
    charts.push(
      <LineCard
        key="price"
        id="m-price"
        title="Day-Ahead-Preis"
        sub="Mittelwert in €/MWh (DE-LU) · Quelle: Energy-Charts"
        unit="€/MWh"
        rows={rows}
        series={[{ key: "price", name: "Day-Ahead-Preis", color: "#0f172a" }]}
        res={res}
        zeroLine
      />,
    );
  }

  if (q.metrics.includes("co2")) {
    const rows = base.map((r) => ({ label: r.label, co2: r.co2 }));
    charts.push(
      <LineCard
        key="co2"
        id="m-co2"
        title="CO₂-Intensität der Erzeugung"
        sub="g CO₂/kWh, direkte Emissionen (Faktoren: Umweltbundesamt)"
        unit="g/kWh"
        rows={rows}
        series={[{ key: "co2", name: `CO₂-Intensität (${regionLabel(q.regions)})`, color: "#0f172a" }]}
        res={res}
      />,
    );
  }

  if (q.metrics.includes("netImport")) {
    const rows = base.map((r) => ({ label: r.label, flow: r.flowMW == null ? null : r.flowMW / 1000 }));
    charts.push(
      <Card key="flow" labelledBy="m-flow">
        <CardTitle id="m-flow" sub="Mittlere physikalische Leistung in GW · Amber = Import nach Deutschland, Indigo = Export · Quelle: Energy-Charts">
          Import/Export-Saldo {q.flow === "sum" ? "aller Nachbarländer" : `mit ${q.flow}`}
        </CardTitle>
        <div className="mt-4 h-56" role="img" aria-label={`Säulendiagramm Import/Export-Saldo ${q.flow === "sum" ? "aller Nachbarländer" : q.flow}`}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="label" tickFormatter={(l: string) => bucketLabel(l, res, true)} tick={{ fontSize: 12, fill: "#64748b" }} tickLine={false} minTickGap={24} />
              <YAxis width={52} tick={{ fontSize: 12, fill: "#64748b" }} tickLine={false} axisLine={false} />
              <ReferenceLine y={0} stroke="#94a3b8" />
              <Tooltip content={<SimpleTooltip res={res} unit="GW" />} isAnimationActive={false} />
              <Bar dataKey="flow" name="Saldo (+ Import)" isAnimationActive={false}>
                {rows.map((r) => (
                  <Cell key={r.label} fill={(r.flow ?? 0) >= 0 ? "#f59e0b" : "#6366f1"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <TableDetails head={["Zeitraum", "Saldo [GW]"]} rows={rows.map((r) => [bucketLabel(r.label, res), formatNumber(r.flow, 2)])} />
      </Card>,
    );
  }

  if (q.metrics.includes("installed")) {
    const carriers = CARRIERS.filter((c) => q.carriers.includes(c.key));
    const rows = (data.installed ?? []).map((p) => {
      const out: Record<string, number | string | null> = { label: new Date(p.ts).toISOString() };
      for (const c of carriers) out[c.key] = p.values[c.key] ?? null;
      return out;
    });
    charts.push(
      <LineCard
        key="installed"
        id="m-installed"
        title="Installierte Leistung"
        sub="GW am Monatsende, Deutschland · Quelle: Energy-Charts (CC BY 4.0)"
        unit="GW"
        rows={rows}
        series={carriers.map((c) => ({ key: c.key, name: c.label, color: c.color }))}
        res={null}
        step
        empty={data.installed == null ? "Installierte Leistung derzeit nicht verfügbar." : undefined}
      />,
    );
  }
  return <>{charts}</>;
}

function LineCard(props: {
  id: string;
  title: string;
  sub: string;
  unit: string;
  rows: Record<string, number | string | null>[];
  series: Series[];
  res: Resolution | null;
  zeroLine?: boolean;
  step?: boolean;
  empty?: string;
}) {
  const fmt = (l: string, short = true) => (props.res ? bucketLabel(l, props.res, short) : formatBerlin(Date.parse(l), "MM/yyyy"));
  return (
    <Card labelledBy={props.id}>
      <CardTitle id={props.id} sub={props.sub}>
        {props.title}
      </CardTitle>
      <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600" aria-label="Legende">
        {props.series.map((s) => (
          <li key={s.key} className="inline-flex items-center gap-1.5">
            <span aria-hidden className={`w-4 border-t-2 ${s.dashed ? "border-dashed" : ""}`} style={{ borderColor: s.color }} />
            {s.name}
          </li>
        ))}
      </ul>
      <div className="mt-3 h-56" role="img" aria-label={`Liniendiagramm ${props.title} in ${props.unit}`}>
        {props.empty || props.rows.length === 0 ? (
          <p className="grid h-full place-items-center text-sm text-slate-500">{props.empty ?? "Keine Daten für diese Auswahl."}</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={props.rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="label" tickFormatter={(l: string) => fmt(l)} tick={{ fontSize: 12, fill: "#64748b" }} tickLine={false} minTickGap={24} />
              <YAxis width={52} tick={{ fontSize: 12, fill: "#64748b" }} tickLine={false} axisLine={false} tickFormatter={(v: number) => formatNumber(v, Math.abs(v) >= 100 ? 0 : 1)} />
              {props.zeroLine ? <ReferenceLine y={0} stroke="#cbd5e1" /> : null}
              <Tooltip content={<SimpleTooltip res={props.res} unit={props.unit} />} isAnimationActive={false} />
              {props.series.map((s) => (
                <Line
                  key={s.key}
                  dataKey={s.key}
                  name={s.name}
                  stroke={s.color}
                  strokeWidth={2}
                  strokeDasharray={s.dashed ? "5 4" : undefined}
                  type={props.step ? "stepAfter" : "linear"}
                  dot={false}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
      <TableDetails
        head={["Zeitraum", ...props.series.map((s) => `${s.name} [${props.unit}]`)]}
        rows={props.rows.slice(-500).map((r) => [fmt(String(r.label), false), ...props.series.map((s) => formatNumber(r[s.key] as number | null, 2))])}
      />
    </Card>
  );
}

function SimpleTooltip({
  active,
  payload,
  label,
  res,
  unit,
}: {
  active?: boolean;
  label?: string;
  payload?: { name: string; value: number | null; stroke?: string; fill?: string; dataKey: string }[];
  res: Resolution | null;
  unit: string;
}) {
  if (!active || !payload?.length || !label) return null;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-md">
      <p className="mb-1.5 font-medium">{res ? bucketLabel(label, res) : formatBerlin(Date.parse(label), "MMMM yyyy")}</p>
      {payload.map((p) => (
        <p key={p.dataKey} className="tabular-nums">
          <span aria-hidden className="mr-1.5 inline-block size-2 rounded-sm" style={{ background: p.stroke ?? p.fill }} />
          {p.name}: {formatNumber(p.value, 2)} {unit}
        </p>
      ))}
    </div>
  );
}
