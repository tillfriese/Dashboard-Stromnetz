import { z } from "zod";
import { fetchWithRetry } from "@/lib/http";
import { getSetting } from "@/lib/settings";
import { QUARTER_HOUR_MS } from "@/lib/time";
import { type FetchContext, type Observation, type SourceAdapter, SourceError } from "./types";

/*
 * StromGedacht (TransnetBW), OpenAPI at https://api.stromgedacht.de/openapi/v1.json.
 *   /v1/statesRelative?zip&hoursInFuture&hoursInPast   state ranges around now
 *   /v1/states?zip&from&to                              state ranges for a period
 * States: -1 = supergrün, 1 = grün, 3 = orange, 4 = rot. Max. ~6 requests per minute.
 * Only zip codes in Baden-Württemberg return data. /v1/states accepts at most 4 days into
 * the past and 2 days into the future, so there is no historical backfill for this source.
 */

const MAX_PAST_MS = 4 * 24 * 3600_000 - 3600_000; // keep a safety margin
const MAX_FUTURE_MS = 2 * 24 * 3600_000 - 3600_000;

const BASE = "https://api.stromgedacht.de/v1";
export const STROMGEDACHT_KEY = "stromgedacht:state:BW";
export const GRID_STATES = { [-1]: "supergruen", 1: "gruen", 3: "orange", 4: "rot" } as const;

const schema = z.object({
  states: z.array(z.object({ from: z.string(), to: z.string(), state: z.number().int() })),
});

/** Expands state ranges onto the quarter-hour grid (one observation per quarter hour). */
export function parseStates(json: unknown): Observation[] {
  const parsed = schema.safeParse(json);
  if (!parsed.success) throw new SourceError("stromgedacht", `unexpected format: ${parsed.error.issues[0]?.message}`);
  const out: Observation[] = [];
  for (const s of parsed.data.states) {
    const from = Date.parse(s.from);
    const to = Date.parse(s.to);
    if (!Number.isFinite(from) || !Number.isFinite(to)) continue;
    // A range starting mid-quarter covers the quarter it starts in.
    for (let t = Math.floor(from / QUARTER_HOUR_MS) * QUARTER_HOUR_MS; t < to; t += QUARTER_HOUR_MS) {
      out.push({ seriesKey: STROMGEDACHT_KEY, ts: t, value: s.state });
    }
  }
  // Later ranges win if ranges overlap at the boundary.
  return [...new Map(out.map((o) => [o.ts, o])).values()];
}

async function get(path: string, ctx?: FetchContext) {
  const res = await fetchWithRetry(`${BASE}${path}`, { minIntervalMs: 10_000, signal: ctx?.signal });
  if (!res.ok) throw new SourceError("stromgedacht", `HTTP ${res.status}: ${(await res.text()).slice(0, 120)}`);
  return res.json();
}

async function zip() {
  return (await getSetting("stromgedacht.zip")) ?? "70173";
}

/** Current state plus 48 h outlook. */
export async function fetchStromGedachtOutlook(ctx?: FetchContext) {
  return parseStates(await get(`/statesRelative?zip=${await zip()}&hoursInFuture=48&hoursInPast=24`, ctx));
}

export const stromGedachtAdapter: SourceAdapter = {
  id: "stromgedacht",
  earliest: "2026-01-01", // effectively: last 4 days (API limit)
  series() {
    return [{ key: STROMGEDACHT_KEY, source: "stromgedacht", region: "BW", unit: "state", label: "Netzampel BW", kind: "actual" }];
  },
  async fetchRange(from, to, ctx) {
    const now = Date.now();
    const start = Math.max(from, now - MAX_PAST_MS);
    const end = Math.min(to, now + MAX_FUTURE_MS);
    if (start >= end) return []; // outside the window the API serves
    const iso = (ms: number) => new Date(ms).toISOString();
    const obs = parseStates(await get(`/states?zip=${await zip()}&from=${iso(start)}&to=${iso(end)}`, ctx));
    return obs.filter((o) => o.ts >= start && o.ts < end);
  },
};
