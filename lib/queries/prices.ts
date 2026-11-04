import { PRICE_KEY } from "@/lib/sources/energy-charts";
import { addBerlinDays, QUARTER_HOUR_MS, startOfBerlinDay } from "@/lib/time";
import { loadSeries } from "./series";

export type PriceData = {
  points: [number, number][];
  dayStart: number;
  dayBoundaries: number[];
  now: { ts: number; price: number } | null;
  avgToday: number | null;
  avgTomorrow: number | null;
  tomorrowAvailable: boolean;
};

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** Day-ahead prices for today and the following days (15-minute resolution since Oct 2025). */
export async function getPrices(days = 2): Promise<PriceData> {
  const now = Date.now();
  const dayStart = startOfBerlinDay(now);
  const boundaries = Array.from({ length: days + 1 }, (_, i) => addBerlinDays(dayStart, i));
  const series = (await loadSeries([PRICE_KEY], dayStart, boundaries.at(-1)!)).get(PRICE_KEY)!;
  const points = [...series.entries()].sort((a, b) => a[0] - b[0]);
  const inDay = (i: number) => points.filter(([ts]) => ts >= boundaries[i]! && ts < boundaries[i + 1]!).map(([, v]) => v);
  const current = [...points].reverse().find(([ts]) => ts <= now && ts + QUARTER_HOUR_MS > now - 45 * 60_000);
  return {
    points,
    dayStart,
    dayBoundaries: boundaries,
    now: current ? { ts: current[0], price: current[1] } : null,
    avgToday: avg(inDay(0)),
    avgTomorrow: days > 1 ? avg(inDay(1)) : null,
    tomorrowAvailable: days > 1 && inDay(1).length > 0,
  };
}
