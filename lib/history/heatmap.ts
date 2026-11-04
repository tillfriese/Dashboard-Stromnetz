import { pool } from "@/lib/db";
import { CO2_G_PER_KWH, GENERATION_METRICS } from "@/lib/energy";
import { PRICE_KEY } from "@/lib/sources/energy-charts";
import { smardSeriesKey } from "@/lib/sources/smard";
import { berlinDateToMs } from "@/lib/time";
import type { HeatMetric } from "./query";
import type { HeatmapResponse } from "./types";

const KEYS: Record<HeatMetric, string[]> = {
  residual: [smardSeriesKey("residual_load", "DE")],
  solar: [smardSeriesKey("solar", "DE")],
  wind: [smardSeriesKey("wind_onshore", "DE"), smardSeriesKey("wind_offshore", "DE")],
  price: [PRICE_KEY],
  co2: GENERATION_METRICS.map((m) => smardSeriesKey(m, "DE")),
};
const UNIT: Record<HeatMetric, string> = { residual: "GW", solar: "GW", wind: "GW", price: "€/MWh", co2: "g/kWh" };

/**
 * Hour of day (Berlin) x calendar week of a year: weekly mean per hour.
 * Week n = days 7(n-1)+1 … 7n of the year (week 53 holds the last 1–2 days), so every
 * year has the same grid regardless of ISO week rules.
 */
export async function getHeatmap(metric: HeatMetric, year: number): Promise<HeatmapResponse> {
  const keys = KEYS[metric];
  const { rows } = await pool().query<{ key: string; w: number; h: number; sum: number; count: number }>(
    `SELECT s.key,
            ((extract(doy FROM h.bucket AT TIME ZONE 'Europe/Berlin')::int - 1) / 7) AS w,
            extract(hour FROM h.bucket AT TIME ZONE 'Europe/Berlin')::int AS h,
            sum(h.sum) AS sum, sum(h.count)::int AS count
     FROM obs_hourly h JOIN series s ON s.id = h.series_id
     WHERE s.key = ANY($1::text[]) AND h.bucket >= to_timestamp($2 / 1000.0) AND h.bucket < to_timestamp($3 / 1000.0)
     GROUP BY 1, 2, 3`,
    [keys, berlinDateToMs(`${year}-01-01`), berlinDateToMs(`${year + 1}-01-01`)],
  );
  const cells = new Map<string, { sum: Record<string, number>; count: Record<string, number> }>();
  for (const r of rows) {
    const id = `${r.h}|${r.w}`;
    const c = cells.get(id) ?? { sum: {}, count: {} };
    c.sum[r.key] = Number(r.sum);
    c.count[r.key] = Number(r.count);
    cells.set(id, c);
  }
  const values: (number | null)[][] = Array.from({ length: 24 }, () => Array<number | null>(53).fill(null));
  for (const [id, c] of cells) {
    const [h, w] = id.split("|").map(Number) as [number, number];
    let v: number | null = null;
    if (metric === "co2") {
      const tot = GENERATION_METRICS.reduce((a, m) => a + (c.sum[smardSeriesKey(m, "DE")] ?? 0), 0);
      const em = GENERATION_METRICS.reduce((a, m) => a + (c.sum[smardSeriesKey(m, "DE")] ?? 0) * (CO2_G_PER_KWH[m] ?? 0), 0);
      v = tot > 0 ? em / tot : null;
    } else {
      // Sum of the mean values of all keys (wind = onshore + offshore).
      const parts = keys.filter((k) => c.count[k]).map((k) => c.sum[k]! / c.count[k]!);
      v = parts.length ? parts.reduce((a, b) => a + b, 0) : null;
      if (v != null && metric !== "price") v /= 1000; // MW -> GW
    }
    if (w < 53) values[h]![w] = v;
  }
  const flat = values.flat().filter((v): v is number => v != null);
  const years = await pool().query<{ y: number }>(
    `SELECT DISTINCT extract(year FROM d.bucket AT TIME ZONE 'Europe/Berlin')::int AS y
     FROM obs_daily d JOIN series s ON s.id = d.series_id WHERE s.key = $1 ORDER BY 1`,
    [keys[0]],
  );
  return {
    metric,
    year,
    unit: UNIT[metric],
    values,
    min: flat.length ? Math.min(...flat) : null,
    max: flat.length ? Math.max(...flat) : null,
    availableYears: years.rows.map((r) => r.y),
  };
}
