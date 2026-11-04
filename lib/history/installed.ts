import { z } from "zod";
import { fetchWithRetry } from "@/lib/http";

/*
 * Installed capacity per carrier from Energy-Charts (/v2/installed_power, Germany, GW).
 * Fetched on demand and cached in memory for 12 h; not stored in the database.
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
const g = globalThis as unknown as { netzlageInstalled?: { at: number; points: InstalledPoint[] } };

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
const gi = globalThis as unknown as { netzlageInstalledLoad?: Promise<void>; netzlageInstalledFail?: number };

async function load(): Promise<void> {
  // Few retries: this runs during page rendering; Energy-Charts rate limits (HTTP 429) quickly.
  const opts = { timeoutMs: 15_000, retries: 1, minIntervalMs: 1_000 };
  const [monthlyRes, yearlyRes] = await Promise.all([
    fetchWithRetry(`${URL_BASE}monthly`, opts),
    fetchWithRetry(`${URL_BASE}yearly`, opts).catch(() => null),
  ]);
  if (!monthlyRes.ok) throw new Error(`installed_power monthly HTTP ${monthlyRes.status}`);
  const monthlyJson = await monthlyRes.json();
  const yearlyJson = yearlyRes?.ok ? await yearlyRes.json() : null;
  // Without the yearly series only wind, solar and biomass have values; kept briefly, then retried.
  const ttl = yearlyJson != null ? FULL_TTL_MS : RETRY_TTL_MS;
  g.netzlageInstalled = { at: Date.now() - (FULL_TTL_MS - ttl), points: combineInstalled(monthlyJson, yearlyJson) };
}

export async function fetchInstalledPower(from: number, to: number): Promise<InstalledPoint[]> {
  const stale = !g.netzlageInstalled || Date.now() - g.netzlageInstalled.at > FULL_TTL_MS;
  const recentlyFailed = gi.netzlageInstalledFail != null && Date.now() - gi.netzlageInstalledFail < RETRY_TTL_MS;
  if (stale && !recentlyFailed) {
    // Concurrent requests share one download.
    gi.netzlageInstalledLoad ??= load()
      .catch((err) => {
        gi.netzlageInstalledFail = Date.now();
        if (!g.netzlageInstalled) throw err;
      })
      .finally(() => {
        gi.netzlageInstalledLoad = undefined;
      });
    await gi.netzlageInstalledLoad;
  }
  if (!g.netzlageInstalled) throw new Error("installed_power unavailable");
  return slice(g.netzlageInstalled.points, from, to);
}

function slice(points: InstalledPoint[], from: number, to: number) {
  // Include the last value before the range so the step line starts at `from`.
  const before = points.filter((p) => p.ts < from).at(-1);
  return [...(before ? [before] : []), ...points.filter((p) => p.ts >= from && p.ts < to)];
}
