import { z } from "zod";
import { CARRIERS } from "@/lib/carriers";
import { fetchWithRetry } from "@/lib/http";
import { berlinWeeks, QUARTER_HOUR_MS } from "@/lib/time";
import { type FetchContext, type Observation, type SeriesDef, type SourceAdapter, SourceError } from "./types";
import { smardSeriesKey } from "./keys";

/*
 * SMARD (Bundesnetzagentur), licence CC BY 4.0 – "Bundesnetzagentur | SMARD.de".
 * Endpoints (no key):
 *   /app/chart_data/{filter}/{region}/index_quarterhour.json
 *   /app/chart_data/{filter}/{region}/{filter}_{region}_quarterhour_{ts}.json
 * Chunk files cover one Berlin week, starting Monday 00:00 local time.
 * Values are MWh per quarter hour -> multiplied by 4 to get average power in MW.
 */

const BASE = "https://www.smard.de/app/chart_data";
export const SMARD_REGIONS = ["DE", "50Hertz", "Amprion", "TenneT", "TransnetBW"] as const;
type Region = (typeof SMARD_REGIONS)[number];

const color = (key: string) => CARRIERS.find((c) => c.key === key)?.color;

/**
 * Filter IDs verified against the live API (2026-11-04). `regions` lists where SMARD
 * publishes the series (checked via index files).
 */
export const SMARD_FILTERS: {
  id: number;
  metric: string;
  label: string;
  kind: "actual" | "forecast";
  color?: string;
  regions?: readonly Region[];
}[] = [
  { id: 1223, metric: "lignite", label: "Braunkohle", kind: "actual", color: color("lignite"), regions: ["DE", "50Hertz", "Amprion", "TenneT"] },
  { id: 1224, metric: "nuclear", label: "Kernenergie", kind: "actual", color: color("nuclear"), regions: ["DE", "Amprion", "TenneT", "TransnetBW"] },
  { id: 1225, metric: "wind_offshore", label: "Wind Offshore", kind: "actual", color: color("wind"), regions: ["DE", "50Hertz", "TenneT"] },
  { id: 1226, metric: "hydro", label: "Wasserkraft", kind: "actual", color: color("hydro") },
  { id: 1227, metric: "other_conventional", label: "Sonstige Konventionelle", kind: "actual", color: color("other") },
  { id: 1228, metric: "other_renewable", label: "Sonstige Erneuerbare", kind: "actual", color: color("other") },
  { id: 4066, metric: "biomass", label: "Biomasse", kind: "actual", color: color("biomass") },
  { id: 4067, metric: "wind_onshore", label: "Wind Onshore", kind: "actual", color: color("wind") },
  { id: 4068, metric: "solar", label: "Photovoltaik", kind: "actual", color: color("solar") },
  { id: 4069, metric: "hardcoal", label: "Steinkohle", kind: "actual", color: color("hardcoal") },
  { id: 4070, metric: "pumped_storage", label: "Pumpspeicher (Erzeugung)", kind: "actual", color: color("hydro") },
  { id: 4071, metric: "gas", label: "Erdgas", kind: "actual", color: color("gas") },
  { id: 410, metric: "load", label: "Netzlast", kind: "actual" },
  { id: 4359, metric: "residual_load", label: "Residuallast", kind: "actual" },
  { id: 4387, metric: "pumped_storage_consumption", label: "Pumpspeicher (Verbrauch)", kind: "actual" },
  // Day-ahead forecasts of the TSOs
  { id: 411, metric: "load_forecast", label: "Prognose Netzlast", kind: "forecast" },
  { id: 122, metric: "generation_forecast", label: "Prognose Erzeugung gesamt", kind: "forecast" },
  { id: 5097, metric: "wind_solar_forecast", label: "Prognose Wind und PV", kind: "forecast" },
  { id: 123, metric: "wind_onshore_forecast", label: "Prognose Wind Onshore", kind: "forecast" },
  { id: 3791, metric: "wind_offshore_forecast", label: "Prognose Wind Offshore", kind: "forecast", regions: ["DE", "50Hertz", "TenneT"] },
  { id: 125, metric: "solar_forecast", label: "Prognose Photovoltaik", kind: "forecast" },
  { id: 715, metric: "other_forecast", label: "Prognose sonstige Erzeugung", kind: "forecast" },
];

export { smardSeriesKey };

const chunkSchema = z.object({
  series: z.array(z.tuple([z.number(), z.number().nullable()])),
});

/** Parses a SMARD quarter-hour chunk. Null values are dropped (gaps stay gaps). */
export function parseSmardChunk(json: unknown, seriesKey: string): Observation[] {
  const parsed = chunkSchema.safeParse(json);
  if (!parsed.success) throw new SourceError("smard", `unexpected chunk format: ${parsed.error.issues[0]?.message}`);
  const out: Observation[] = [];
  for (const [ts, v] of parsed.data.series) {
    if (v == null || !Number.isFinite(v)) continue;
    if (ts % QUARTER_HOUR_MS !== 0) throw new SourceError("smard", `timestamp not on quarter-hour grid: ${ts}`);
    out.push({ seriesKey, ts, value: v * 4 });
  }
  return out;
}

const indexSchema = z.object({ timestamps: z.array(z.number()) });
export function parseSmardIndex(json: unknown): number[] {
  return indexSchema.parse(json).timestamps;
}

function combos() {
  return SMARD_FILTERS.flatMap((f) => (f.regions ?? SMARD_REGIONS).map((region) => ({ filter: f, region })));
}

async function fetchChunk(filter: number, region: string, week: number, ctx?: FetchContext): Promise<unknown | null> {
  const url = `${BASE}/${filter}/${region}/${filter}_${region}_quarterhour_${week}.json`;
  const res = await fetchWithRetry(url, { minIntervalMs: 120, signal: ctx?.signal });
  if (res.status === 404) return null; // week not (yet) published
  if (!res.ok) throw new SourceError("smard", `HTTP ${res.status} for ${filter}/${region}/${week}`);
  return res.json();
}

export const smardAdapter: SourceAdapter = {
  id: "smard",
  earliest: "2015-01-01",
  series(): SeriesDef[] {
    return combos().map(({ filter, region }) => ({
      key: smardSeriesKey(filter.metric, region),
      source: "smard",
      region,
      unit: "MW",
      label: filter.label,
      color: filter.color,
      kind: filter.kind,
    }));
  },
  async fetchRange(from, to, ctx) {
    const weeks = berlinWeeks(from, to);
    const out: Observation[] = [];
    // Small worker pool: polite (per-host spacing in fetchWithRetry) but not strictly serial.
    const tasks = combos().flatMap((c) => weeks.map((w) => ({ ...c, week: w })));
    let next = 0;
    async function worker() {
      while (next < tasks.length) {
        const t = tasks[next++]!;
        const json = await fetchChunk(t.filter.id, t.region, t.week, ctx);
        if (!json) continue;
        for (const o of parseSmardChunk(json, smardSeriesKey(t.filter.metric, t.region))) {
          if (o.ts >= from && o.ts < to) out.push(o);
        }
      }
    }
    await Promise.all([worker(), worker(), worker()]);
    return out;
  },
};
