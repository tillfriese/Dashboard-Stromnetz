import { CARRIERS, type CarrierKey } from "@/lib/carriers";
import { byCarrier, GENERATION_METRICS, type GenerationSnapshot, isComplete } from "@/lib/energy";
import { smardSeriesKey } from "@/lib/sources/smard";
import { addBerlinDays, startOfBerlinDay } from "@/lib/time";
import { latestCompleteQuarter } from "./now";
import { loadSeries } from "./series";

export type MixPoint = { ts: number } & Partial<Record<CarrierKey | "load" | "loadForecast" | "reForecast", number>>;
export type MixData = { from: number; to: number; nowTs: number | null; points: MixPoint[] };

export const MIX_WINDOWS = { "24h": 24, "48h": 48, "7d": 168 } as const;
export type MixWindow = keyof typeof MIX_WINDOWS;

/**
 * Generation mix (MW per carrier) for the last N hours up to the latest actual value, plus
 * day-ahead forecasts (grid load, wind + PV) until the end of tomorrow.
 */
export async function getMix(window: MixWindow): Promise<MixData> {
  const genKeys = GENERATION_METRICS.map((m) => smardSeriesKey(m, "DE"));
  const loadKey = smardSeriesKey("load", "DE");
  const lfKey = smardSeriesKey("load_forecast", "DE");
  const reKey = smardSeriesKey("wind_solar_forecast", "DE");
  // Actual values end at the latest complete quarter hour (carriers arrive with different delays).
  const latest = await latestCompleteQuarter();
  const anchor = latest ?? Date.now();
  const from = anchor - MIX_WINDOWS[window] * 3600_000;
  const to = addBerlinDays(startOfBerlinDay(Date.now()), 2);
  const data = await loadSeries([...genKeys, loadKey, lfKey, reKey], from, to);

  const all = new Set<number>();
  for (const m of data.values()) for (const ts of m.keys()) all.add(ts);
  const points: MixPoint[] = [...all]
    .sort((a, b) => a - b)
    .map((ts) => {
      const p: MixPoint = { ts };
      if (latest == null || ts <= latest) {
        const g: GenerationSnapshot = {};
        for (const m of GENERATION_METRICS) {
          const v = data.get(smardSeriesKey(m, "DE"))?.get(ts);
          if (v != null) g[m] = v;
        }
        // Incomplete quarter hours are left out (shown as a gap) instead of a misleading dip.
        if (isComplete(g)) {
          const c = byCarrier(g);
          for (const x of CARRIERS) p[x.key] = c[x.key];
        }
        const l = data.get(loadKey)?.get(ts);
        if (l != null) p.load = l;
      }
      // Forecasts are shown from the latest actual value onwards.
      if (latest == null || ts >= latest) {
        const lf = data.get(lfKey)?.get(ts);
        const re = data.get(reKey)?.get(ts);
        if (lf != null) p.loadForecast = lf;
        if (re != null) p.reForecast = re;
      }
      return p;
    });
  return { from, to, nowTs: latest, points };
}
