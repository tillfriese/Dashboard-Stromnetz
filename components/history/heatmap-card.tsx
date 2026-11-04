"use client";

import { scaleLinear } from "d3-scale";
import { Card, CardError, CardTitle } from "@/components/ui/card";
import { Heatmap } from "@/components/ui/heatmap";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber } from "@/lib/format";
import { useJson } from "@/lib/hooks/use-json";
import { HEAT_METRICS, type HeatMetric, type HistoryQuery } from "@/lib/history/query";
import type { HeatmapResponse } from "@/lib/history/types";

const LABEL: Record<HeatMetric, string> = {
  residual: "Residuallast",
  solar: "Photovoltaik",
  wind: "Wind",
  price: "Day-Ahead-Preis",
  co2: "CO₂-Intensität",
};
const SUB: Record<HeatMetric, string> = {
  residual: "Wochenmittel je Stunde in GW · PV-Mittagsdelle im Sommer, Dunkelflauten im Winter",
  solar: "Wochenmittel je Stunde in GW",
  wind: "Wochenmittel je Stunde in GW (Onshore + Offshore)",
  price: "Wochenmittel je Stunde in €/MWh",
  co2: "Wochenmittel je Stunde in g/kWh der Erzeugung",
};
const MONTHS = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

/** Week index (0-based, 7-day blocks from Jan 1) at which each month starts. */
function monthTicks(year: number) {
  const m = new Map<number, string>();
  for (let i = 0; i < 12; i++) {
    const doy = Math.round((Date.UTC(year, i, 1) - Date.UTC(year, 0, 1)) / 86_400_000);
    m.set(Math.floor(doy / 7), MONTHS[i]!);
  }
  return m;
}

function colorFor(metric: HeatMetric, max: number, min: number): (v: number) => string {
  const amber = scaleLinear<string>().domain([0, Math.max(1, max)]).range(["#fef3c7", "#b45309"]).clamp(true);
  const indigo = scaleLinear<string>().domain([0, Math.max(1, max)]).range(["#eef2ff", "#4338ca"]).clamp(true);
  switch (metric) {
    case "residual":
    case "price":
      // <= 0: surplus of renewables / negative prices (indigo); above: amber scale.
      return (v) => (v <= 0 ? "#6366f1" : amber(v));
    case "co2":
      return scaleLinear<string>().domain([min, Math.max(min + 1, max)]).range(["#fef3c7", "#b45309"]).clamp(true);
    default:
      return (v) => indigo(v);
  }
}

export function HeatmapCard({ query: q, publicMode, update }: { query: HistoryQuery; publicMode: boolean; update: (p: Partial<HistoryQuery>) => void }) {
  const metric = publicMode && q.heat === "price" ? "residual" : q.heat;
  const year = q.heatYear ?? Number(q.to.slice(0, 4));
  const { data, error, loading } = useJson<HeatmapResponse>(`/api/heatmap?metric=${metric}&year=${year}`);
  const years = data?.availableYears.length ? data.availableYears : [year];
  const unit = data?.unit ?? "";
  const digits = metric === "price" || metric === "co2" ? 0 : 1;

  return (
    <Card labelledBy="heat-title">
      <CardTitle
        id="heat-title"
        sub={SUB[metric]}
        right={
          <div className="flex items-center gap-2 text-sm">
            <label htmlFor="heat-metric" className="text-slate-500">
              Größe
            </label>
            <select id="heat-metric" value={metric} onChange={(e) => update({ heat: e.target.value as HeatMetric })} className="rounded-xl border border-slate-200 bg-white px-2.5 py-1.5">
              {HEAT_METRICS.filter((m) => !(publicMode && m === "price")).map((m) => (
                <option key={m} value={m}>
                  {LABEL[m]}
                </option>
              ))}
            </select>
            <label htmlFor="heat-year" className="sr-only">
              Jahr
            </label>
            <select id="heat-year" value={year} onChange={(e) => update({ heatYear: Number(e.target.value) })} className="rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 tabular-nums">
              {[...new Set([...years, year])].sort().map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
        }
      >
        {LABEL[metric]} nach Uhrzeit und Kalenderwoche · {year}
      </CardTitle>
      <div className={`mt-5 transition-opacity ${loading ? "opacity-60" : ""}`}>
        {!data ? (
          error ? <CardError /> : <Skeleton className="h-72 w-full" />
        ) : data.min == null ? (
          <p className="py-16 text-center text-sm text-slate-500">Für {year} liegen noch keine Daten vor.</p>
        ) : (
          <>
            <Heatmap
              values={data.values}
              rowLabels={Array.from({ length: 24 }, (_, h) => `${h} Uhr`)}
              colLabels={Array.from({ length: 53 }, (_, w) => `KW-Block ${w + 1}`)}
              colTicks={monthTicks(year)}
              rowTickEvery={6}
              color={colorFor(metric, data.max ?? 1, data.min ?? 0)}
              format={(v) => (v == null ? "–" : `${formatNumber(v, digits)} ${unit}`)}
              ariaLabel={`Heatmap ${LABEL[metric]} ${year}: Stunde des Tages gegen Kalenderwoche, Werte von ${formatNumber(data.min, digits)} bis ${formatNumber(data.max, digits)} ${unit}`}
            />
            <Legend metric={metric} min={data.min} max={data.max ?? 0} unit={unit} digits={digits} />
          </>
        )}
      </div>
    </Card>
  );
}

function Legend({ metric, min, max, unit, digits }: { metric: HeatMetric; min: number; max: number; unit: string; digits: number }) {
  const c = colorFor(metric, max, min);
  const steps = Array.from({ length: 6 }, (_, i) => (metric === "co2" ? min : 0) + ((max - (metric === "co2" ? min : 0)) * (i + 1)) / 6);
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-600">
      {metric === "residual" || metric === "price" ? (
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-3 rounded-sm bg-indigo-500" />
          {metric === "residual" ? "≤ 0 GW · Überschuss Erneuerbare" : "≤ 0 €/MWh"}
        </span>
      ) : null}
      <span className="inline-flex items-center gap-1">
        <span className="tabular-nums">{formatNumber(metric === "co2" ? min : 0, digits)}</span>
        {steps.map((s) => (
          <span key={s} aria-hidden className="h-3 w-5 rounded-sm" style={{ background: c(s) }} />
        ))}
        <span className="tabular-nums">
          {formatNumber(max, digits)} {unit}
        </span>
        {metric === "residual" ? <span className="ml-1">Bedarf an konventioneller Erzeugung</span> : null}
      </span>
    </div>
  );
}
