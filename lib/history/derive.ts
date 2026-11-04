/*
 * Turns the raw sums/counts of a TimeseriesResponse into display values. Shared by the
 * client (charts, table, KPIs) and the server (CSV export), so both always agree.
 */
import { CARRIERS, type CarrierKey } from "@/lib/carriers";
import { CO2_G_PER_KWH, GENERATION_METRICS, METRIC_TO_CARRIER, RENEWABLE_METRICS } from "@/lib/energy";
import { flowKey, NET_IMPORT_KEY, PRICE_KEY, smardSeriesKey } from "@/lib/sources/keys";
import { dataRegions, type HistoryQuery, showsEnergy } from "./query";
import type { SeriesBlock, Stat, TimeseriesResponse } from "./types";

export type Row = {
  ts: number;
  label: string;
  /** Per carrier: energy in MWh (day and coarser) or average power in MW (hour/15 min). */
  carriers: Partial<Record<CarrierKey, number | null>>;
  total: number | null;
  reShare: number | null;
  co2: number | null;
  loadMW: number | null;
  residualMW: number | null;
  price: number | null;
  flowMW: number | null;
  matchedHours: number | null;
  /** Quarter hours with generation data in this bucket (to detect partial buckets). */
  quarters: number;
};

const avg = (s: Stat) => (s && s[1] > 0 ? s[0] / s[1] : null);

/**
 * Combines one metric over several control areas: sums are added, the count is the number of
 * quarter hours (the same in every zone), so avg = summed power. Zones without the metric
 * (e.g. no lignite in TransnetBW) are skipped.
 */
function combined(block: SeriesBlock, metric: string, regions: readonly string[], i: number): Stat {
  let sum = 0;
  let count = 0;
  let any = false;
  for (const r of regions) {
    const s = block.series[smardSeriesKey(metric, r)]?.[i];
    if (!s) continue;
    any = true;
    sum += s[0];
    count = Math.max(count, s[1]);
  }
  return any ? [sum, count] : null;
}
const energy = (s: Stat) => (s ? s[0] * 0.25 : null); // MW per quarter hour -> MWh

export function deriveRows(
  block: SeriesBlock,
  regions: readonly string[],
  q: Pick<HistoryQuery, "carriers" | "flow">,
  res: TimeseriesResponse["res"],
): Row[] {
  const asEnergy = showsEnergy(res);
  const series = dataRegions(regions);
  return block.buckets.map((ts, i) => {
    const metric = (m: string) => combined(block, m, series, i);
    // Energy per SMARD metric (always energy-weighted for shares and CO2).
    const e: Record<string, number | null> = {};
    for (const m of GENERATION_METRICS) e[m] = energy(metric(m));
    const anyGen = GENERATION_METRICS.some((m) => e[m] != null);
    const totalE = GENERATION_METRICS.reduce((a, m) => a + (e[m] ?? 0), 0);
    // Average power per metric (sum / count) for sub-daily views.
    const counts = GENERATION_METRICS.map((m) => metric(m)?.[1] ?? 0);
    const n = Math.max(0, ...counts);

    const carriers: Partial<Record<CarrierKey, number | null>> = {};
    for (const c of CARRIERS) {
      if (!q.carriers.includes(c.key)) continue;
      const ms = GENERATION_METRICS.filter((m) => METRIC_TO_CARRIER[m] === c.key);
      const vals = ms.map((m) => e[m]).filter((v): v is number => v != null);
      if (!vals.length) {
        carriers[c.key] = null;
        continue;
      }
      const sumE = vals.reduce((a, b) => a + b, 0);
      carriers[c.key] = asEnergy ? sumE : n > 0 ? (sumE / 0.25) / n : null;
    }
    const selected = Object.values(carriers).filter((v): v is number => v != null);
    const flowStat = block.series[q.flow === "sum" ? NET_IMPORT_KEY : flowKey(q.flow)]?.[i] ?? null;
    return {
      ts,
      label: block.labels[i]!,
      carriers,
      total: selected.length ? selected.reduce((a, b) => a + b, 0) : null,
      reShare: anyGen && totalE > 0 ? (RENEWABLE_METRICS.reduce((a, m) => a + (e[m] ?? 0), 0) / totalE) * 100 : null,
      co2: anyGen && totalE > 0 ? GENERATION_METRICS.reduce((a, m) => a + (e[m] ?? 0) * (CO2_G_PER_KWH[m] ?? 0), 0) / totalE : null,
      loadMW: avg(combined(block, "load", series, i)),
      residualMW: avg(combined(block, "residual_load", series, i)),
      price: avg(block.series[PRICE_KEY]?.[i] ?? null),
      flowMW: avg(flowStat),
      matchedHours: block.matched ? block.matched[i]! / 4 : null,
      quarters: n,
    };
  });
}

/** Energy totals per carrier over all rows (MWh); for the sidebar numbers and KPIs. */
export function carrierTotals(block: SeriesBlock, regions: readonly string[]): Record<CarrierKey, number> {
  const out = Object.fromEntries(CARRIERS.map((c) => [c.key, 0])) as Record<CarrierKey, number>;
  for (const m of GENERATION_METRICS) {
    for (const region of dataRegions(regions)) {
      for (const s of block.series[smardSeriesKey(m, region)] ?? []) out[METRIC_TO_CARRIER[m]!] += energy(s) ?? 0;
    }
  }
  return out;
}

/** Unit info for carrier values of a given resolution. */
export function energyUnit(res: TimeseriesResponse["res"], maxMWh: number): { unit: string; factor: number } {
  if (!showsEnergy(res)) return { unit: "GW", factor: 1 / 1000 };
  if (maxMWh >= 5_000_000) return { unit: "TWh", factor: 1 / 1_000_000 };
  return { unit: "GWh", factor: 1 / 1000 };
}

/** CSV (semicolon separated, decimal comma, UTF-8 BOM) for spreadsheet programs in German locale. */
export function toCsv(resp: TimeseriesResponse, q: HistoryQuery): string {
  const asEnergy = showsEnergy(resp.res);
  const unit = asEnergy ? "MWh" : "MW (Mittel)";
  const num = (v: number | null, d = 2) => (v == null ? "" : v.toFixed(d).replace(".", ","));
  const carriers = CARRIERS.filter((c) => q.carriers.includes(c.key));
  const head = [
    "Zeitraum (Europe/Berlin)",
    "Regelzonen",
    ...carriers.map((c) => `${c.label} [${unit}]`),
    `Summe Auswahl [${unit}]`,
    "EE-Anteil [%]",
    "CO2-Intensität [g/kWh]",
    "Netzlast [MW Mittel]",
    "Residuallast [MW Mittel]",
    ...(resp.publicMode ? [] : ["Day-Ahead-Preis [EUR/MWh Mittel]"]),
    `Grenzfluss ${q.flow === "sum" ? "Saldo" : q.flow} [MW Mittel, + Import]`,
    ...(resp.main.matched ? ["Stunden mit erfüllten Bedingungen"] : []),
  ];
  const lines = [head.join(";")];
  const region = q.regions.join("+");
  {
    for (const r of deriveRows(resp.main, q.regions, q, resp.res)) {
      lines.push(
        [
          r.label,
          region,
          ...carriers.map((c) => num(r.carriers[c.key] ?? null, 1)),
          num(r.total, 1),
          num(r.reShare, 1),
          num(r.co2, 0),
          num(r.loadMW, 0),
          num(r.residualMW, 0),
          ...(resp.publicMode ? [] : [num(r.price, 2)]),
          num(r.flowMW, 0),
          ...(resp.main.matched ? [num(r.matchedHours, 2)] : []),
        ].join(";"),
      );
    }
  }
  const source = "Quellen: Bundesnetzagentur | SMARD.de (CC BY 4.0); Energy-Charts (Fraunhofer ISE)";
  return "﻿" + lines.join("\r\n") + `\r\n\r\n${source}\r\n`;
}

/**
 * Rows whose bucket is (nearly) complete: at least 95 % of the median number of quarter hours.
 * Partial first/last buckets (e.g. a week cut by the range start) would distort comparisons.
 */
export function completeRows(rows: Row[]): Row[] {
  const qs = rows.map((r) => r.quarters).filter((n) => n > 0).sort((a, b) => a - b);
  if (!qs.length) return [];
  const median = qs[Math.floor(qs.length / 2)]!;
  return rows.filter((r) => r.quarters >= median * 0.95);
}
