import { z } from "zod";
import { fetchWithRetry } from "@/lib/http";

/*
 * Installed capacity per carrier from Energy-Charts (/v2/installed_power, monthly for Germany, GW,
 * value = installed power at the END of the labelled month). Fetched on demand and cached in
 * memory for 12 h; not stored in the database.
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

type Point = { ts: number; values: Record<string, number | null> };
const g = globalThis as unknown as { netzlageInstalled?: { at: number; points: Point[] } };

export function parseInstalled(json: unknown): Point[] {
  return schema.parse(json).data.map((row) => {
    const values: Record<string, number | null> = {};
    for (const [carrier, ids] of Object.entries(MAP)) {
      const parts = ids.map((id) => row.values[id]).filter((v): v is number => v != null);
      values[carrier] = parts.length ? parts.reduce((a, b) => a + b, 0) : null;
    }
    return { ts: Date.parse(row.timestamp), values };
  });
}

export async function fetchInstalledPower(from: number, to: number): Promise<Point[]> {
  if (!g.netzlageInstalled || Date.now() - g.netzlageInstalled.at > 12 * 3600_000) {
    const res = await fetchWithRetry("https://api.energy-charts.info/v2/installed_power?country=de&time_step=monthly&installation_decommission=false", {
      timeoutMs: 30_000,
    });
    if (!res.ok) throw new Error(`installed_power HTTP ${res.status}`);
    g.netzlageInstalled = { at: Date.now(), points: parseInstalled(await res.json()) };
  }
  const pts = g.netzlageInstalled.points.filter((p) => Object.values(p.values).some((v) => v != null));
  // Include the last value before the range so the step line starts at `from`.
  const before = pts.filter((p) => p.ts < from).at(-1);
  return [...(before ? [before] : []), ...pts.filter((p) => p.ts >= from && p.ts < to)];
}
