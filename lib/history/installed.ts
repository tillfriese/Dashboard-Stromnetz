import { z } from "zod";
import { fetchWithRetry } from "@/lib/http";

/*
 * Installed capacity per carrier from Energy-Charts (/v2/installed_power, Germany, GW).
 * Kept in memory (not in the database): loaded at startup and refreshed daily by the scheduler,
 * with patient retries because Energy-Charts rate limits per IP (HTTP 429 with Retry-After).
 * Page requests only read the cache; a failed refresh keeps the previous data.
 *
 * Energy-Charts publishes two series (timestamp_reference = period_end):
 *  - monthly: only wind, solar, biomass and batteries (from the Marktstammdatenregister),
 *    value = installed power at the END of the labelled month;
 *  - yearly:  all carriers incl. coal, gas, nuclear, hydro, value = installed power at the END of
 *    the labelled year (the current year: latest known state).
 * Both are combined into one monthly series: monthly values where available, otherwise the last
 * known year-end value (so conventional plants change in steps at the turn of the year).
 */

const MAP: Record<string, string[]> = {
  hydro: ["hydro"],
  biomass: ["biomass"],
  wind: ["wind_onshore", "wind_offshore"],
  solar: ["solar_dc"],
  lignite: ["fossil_brown_coal_lignite"],
  hardcoal: ["fossil_hard_coal"],
  gas: ["fossil_gas"],
  nuclear: ["nuclear"],
  other: ["fossil_oil", "other_non_renewable", "hydro_pumped_storage"],
};

const schema = z.object({
  data: z.array(z.object({ timestamp: z.string(), values: z.record(z.string(), z.number().nullable()) })),
});

type Values = Record<string, number | null>;
export type InstalledPoint = { ts: number; values: Values };
type Cache = { at: number; complete: boolean; points: InstalledPoint[] };
const g = globalThis as unknown as { netzlageInstalled?: Cache; netzlageInstalledLoad?: Promise<void>; netzlageInstalledFail?: number };

/** Sums the Energy-Charts ids of each carrier; a carrier is null only if none of its ids has a value. */
function toCarriers(row: Record<string, number | null>): Values {
  const values: Values = {};
  for (const [carrier, ids] of Object.entries(MAP)) {
    const parts = ids.map((id) => row[id]).filter((v): v is number => v != null);
    values[carrier] = parts.length ? parts.reduce((a, b) => a + b, 0) : null;
  }
  return values;
}

function parseRows(json: unknown) {
  return schema
    .parse(json)
    .data.map((row) => ({ ts: Date.parse(row.timestamp), values: toCarriers(row.values) }))
    .filter((p) => Object.values(p.values).some((v) => v != null));
}

/** Year (Europe/Berlin) of a timestamp; Energy-Charts labels periods at local midnight. */
const berlinYear = (ts: number) => Number(new Date(ts).toLocaleString("en-CA", { timeZone: "Europe/Berlin", year: "numeric" }));

/**
 * Combines the monthly and the yearly series. For a month of year Y a carrier without monthly
 * value takes the year-end value of Y-1 (the last known state), except for December and the latest
 * month, which already take the value of Y.
 */
export function combineInstalled(monthlyJson: unknown, yearlyJson: unknown | null): InstalledPoint[] {
  const monthly = parseRows(monthlyJson);
  const yearly = new Map<number, Values>();
  if (yearlyJson != null) for (const p of parseRows(yearlyJson)) yearly.set(berlinYear(p.ts), p.values);
  const lastTs = monthly.at(-1)?.ts;

  return monthly.map((p) => {
    const year = berlinYear(p.ts);
    const month = new Date(p.ts).toLocaleString("en-CA", { timeZone: "Europe/Berlin", month: "numeric" });
    const sameYear = month === "12" || p.ts === lastTs;
    const fallback = yearly.get(sameYear ? year : year - 1) ?? yearly.get(year - 1) ?? null;
    const values: Values = {};
    for (const carrier of Object.keys(MAP)) values[carrier] = p.values[carrier] ?? fallback?.[carrier] ?? null;
    return { ts: p.ts, values };
  });
}

const URL_BASE = "https://api.energy-charts.info/v2/installed_power?country=de&installation_decommission=false&time_step=";

const FULL_TTL_MS = 12 * 3600_000;
/** Incomplete result (yearly series failed) or failure: retried after a short pause only. */
const RETRY_TTL_MS = 10 * 60_000;
/** A page request without any cached data waits at most this long for the download. */
const REQUEST_WAIT_MS = 20_000;

async function load(): Promise<void> {
  // Patient: Energy-Charts answers bursts with 429 and Retry-After (seconds); this runs in the background.
  const opts = { timeoutMs: 60_000, retries: 6, minIntervalMs: 1_000 };
  const [monthlyRes, yearlyRes] = await Promise.all([
    fetchWithRetry(`${URL_BASE}monthly`, opts),
    fetchWithRetry(`${URL_BASE}yearly`, opts).catch(() => null),
  ]);
  if (!monthlyRes.ok) throw new Error(`installed_power monthly HTTP ${monthlyRes.status}`);
  const monthlyJson = await monthlyRes.json();
  const yearlyJson = yearlyRes?.ok ? await yearlyRes.json() : null;
  // Without the yearly series only wind, solar and biomass have values; kept, but refreshed soon.
  g.netzlageInstalled = { at: Date.now(), complete: yearlyJson != null, points: combineInstalled(monthlyJson, yearlyJson) };
}

/** Downloads the installed capacity (shared by concurrent callers). On failure the old data stays. */
export function refreshInstalledPower(): Promise<void> {
  g.netzlageInstalledLoad ??= load()
    .then(() => {
      g.netzlageInstalledFail = undefined;
    })
    .catch((err) => {
      g.netzlageInstalledFail = Date.now();
      console.error("[installed]", (err as Error).message);
    })
    .finally(() => {
      g.netzlageInstalledLoad = undefined;
    });
  return g.netzlageInstalledLoad;
}

export async function fetchInstalledPower(from: number, to: number): Promise<InstalledPoint[]> {
  const c = g.netzlageInstalled;
  const recentlyFailed = g.netzlageInstalledFail != null && Date.now() - g.netzlageInstalledFail < RETRY_TTL_MS;
  const stale = !c || Date.now() - c.at > (c.complete ? FULL_TTL_MS : RETRY_TTL_MS);
  if (stale && !recentlyFailed) {
    const loading = refreshInstalledPower();
    // With old data: answer at once and refresh in the background. Without: wait a little.
    if (!c) await Promise.race([loading, new Promise((r) => setTimeout(r, REQUEST_WAIT_MS))]);
  }
  if (!g.netzlageInstalled) throw new Error("installed_power unavailable");
  return slice(g.netzlageInstalled.points, from, to);
}

function slice(points: InstalledPoint[], from: number, to: number) {
  // Include the last value before the range so the step line starts at `from`.
  const before = points.filter((p) => p.ts < from).at(-1);
  return [...(before ? [before] : []), ...points.filter((p) => p.ts >= from && p.ts < to)];
}
