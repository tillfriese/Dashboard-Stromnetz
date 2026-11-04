import { z } from "zod";
import { fetchWithRetry } from "@/lib/http";
import { type FetchContext, type Observation, type SeriesDef, type SourceAdapter, SourceError } from "./types";
import { flowKey, NET_IMPORT_KEY, PRICE_KEY } from "./keys";

/*
 * Energy-Charts (Fraunhofer ISE), documented at https://api.energy-charts.info/ (OpenAPI).
 * Used endpoints (v2):
 *   /v2/price?bzn=DE-LU&start&end      day-ahead price, EUR/MWh, PT15M (hourly before Oct 2025)
 *   /v2/cbpf?country=de&start&end      cross-border physical flows in GW, positive = import
 *   /v2/frequency?region=DE-Freiburg   grid frequency, 1 s, max. 3 days per request
 * The licence of each response is stated in its `license` field.
 */

const BASE = "https://api.energy-charts.info/v2";

const v2Schema = z.object({
  series: z.array(z.object({ id: z.string() })),
  data: z.array(z.object({ timestamp: z.string(), values: z.record(z.string(), z.number().nullable()) })),
  license: z.string().optional(),
});

/** Parses a v2 response into `{ id -> [ts, value][] }`, skipping nulls. */
export function parseEnergyChartsV2(json: unknown): Map<string, [number, number][]> {
  const parsed = v2Schema.safeParse(json);
  if (!parsed.success) throw new SourceError("energycharts", `unexpected format: ${parsed.error.issues[0]?.message}`);
  const out = new Map<string, [number, number][]>(parsed.data.series.map((s) => [s.id, []]));
  for (const row of parsed.data.data) {
    const ts = Date.parse(row.timestamp);
    if (!Number.isFinite(ts)) throw new SourceError("energycharts", `invalid timestamp ${row.timestamp}`);
    for (const [id, v] of Object.entries(row.values)) {
      if (v == null || !Number.isFinite(v)) continue;
      (out.get(id) ?? out.set(id, []).get(id)!).push([ts, v]);
    }
  }
  return out;
}

/** Energy-Charts country names -> ISO codes used in our series keys. */
export const CBPF_COUNTRIES: Record<string, string> = {
  austria: "AT",
  belgium: "BE",
  czech_republic: "CZ",
  denmark: "DK",
  france: "FR",
  luxembourg: "LU",
  netherlands: "NL",
  norway: "NO",
  poland: "PL",
  sweden: "SE",
  switzerland: "CH",
};

export { flowKey, NET_IMPORT_KEY, PRICE_KEY };

export function parsePrices(json: unknown): Observation[] {
  return (parseEnergyChartsV2(json).get("day_ahead_price") ?? []).map(([ts, value]) => ({ seriesKey: PRICE_KEY, ts, value }));
}

/** Flows are converted from GW to MW. Positive = import into Germany. */
export function parseFlows(json: unknown): Observation[] {
  const out: Observation[] = [];
  for (const [id, points] of parseEnergyChartsV2(json)) {
    const key = id === "sum" ? NET_IMPORT_KEY : CBPF_COUNTRIES[id] ? flowKey(CBPF_COUNTRIES[id]) : null;
    if (!key) continue;
    for (const [ts, gw] of points) out.push({ seriesKey: key, ts, value: gw * 1000 });
  }
  return out;
}

export function parseFrequency(json: unknown): { ts: number; hz: number }[] {
  return (parseEnergyChartsV2(json).get("frequency") ?? []).map(([ts, hz]) => ({ ts, hz }));
}

const iso = (ms: number) => new Date(ms).toISOString().slice(0, 19) + "Z";

async function getJson(path: string, ctx?: FetchContext, timeoutMs = 60_000): Promise<unknown> {
  const res = await fetchWithRetry(`${BASE}${path}`, { timeoutMs, minIntervalMs: 500, signal: ctx?.signal });
  if (res.status === 404) return { series: [], data: [] }; // no data for the period
  if (!res.ok) throw new SourceError("energycharts", `HTTP ${res.status} for ${path.split("?")[0]}`);
  return res.json();
}

const inRange = (from: number, to: number) => (o: Observation) => o.ts >= from && o.ts < to;

export async function fetchPrices(from: number, to: number, ctx?: FetchContext) {
  return parsePrices(await getJson(`/price?bzn=DE-LU&start=${iso(from)}&end=${iso(to)}`, ctx)).filter(inRange(from, to));
}

export async function fetchFlows(from: number, to: number, ctx?: FetchContext) {
  return parseFlows(await getJson(`/cbpf?country=de&start=${iso(from)}&end=${iso(to)}`, ctx)).filter(inRange(from, to));
}

/** Frequency since `from` (exclusive) up to now; Energy-Charts allows at most 3 days. */
export async function fetchFrequency(from: number, ctx?: FetchContext) {
  const json = await getJson(`/frequency?region=DE-Freiburg&start=${iso(from)}&end=${iso(Date.now())}`, ctx, 10_000);
  return parseFrequency(json).filter((p) => p.ts > from);
}

export const energyChartsAdapter: SourceAdapter = {
  id: "energycharts",
  earliest: "2015-01-01",
  series(): SeriesDef[] {
    return [
      { key: PRICE_KEY, source: "energycharts", region: "DE-LU", unit: "EUR/MWh", label: "Day-Ahead-Preis DE-LU", kind: "actual" },
      { key: NET_IMPORT_KEY, source: "energycharts", region: "DE", unit: "MW", label: "Netto-Import (physikalisch)", kind: "actual" },
      ...Object.values(CBPF_COUNTRIES).map(
        (cc): SeriesDef => ({ key: flowKey(cc), source: "energycharts", region: cc, unit: "MW", label: `Grenzfluss ${cc}`, kind: "actual" }),
      ),
    ];
  },
  async fetchRange(from, to, ctx) {
    // Monthly requests at most, so payloads stay small.
    return [...(await fetchPrices(from, to, ctx)), ...(await fetchFlows(from, to, ctx))];
  },
};
