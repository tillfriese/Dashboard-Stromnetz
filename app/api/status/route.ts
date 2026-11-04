import { cachedJson, sourceError } from "@/lib/api";
import { pool } from "@/lib/db";
import { latestCompleteQuarter } from "@/lib/queries/now";
import { freshnessBySource } from "@/lib/queries/series";

export const dynamic = "force-dynamic";

/** Data freshness per source (used by the header on every page). */
export async function GET() {
  try {
    const [freshness, asOf, coverage] = await Promise.all([
      freshnessBySource(),
      latestCompleteQuarter(),
      // Local data stock (first day with grid load data), for the "Historie" header.
      pool()
        .query<{ first: string | null }>(
          `SELECT to_char(min(d.bucket) AT TIME ZONE 'Europe/Berlin', 'YYYY-MM-DD') AS first
           FROM obs_daily d JOIN series s ON s.id = d.series_id WHERE s.key = 'smard:load:DE'`,
        )
        .then((r) => r.rows[0]?.first ?? null),
    ]);
    return cachedJson({ freshness, asOf, coverageFrom: coverage, now: Date.now() }, 30);
  } catch (err) {
    return sourceError(err);
  }
}
