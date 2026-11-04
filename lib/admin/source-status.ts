import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { SOURCE_IDS, type SourceId } from "@/lib/settings";

export type Gap = { series: string; from: string; to: string; missing: number };

export type SourceStatus = {
  source: SourceId;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastError: string | null;
  rows: number;
  oldest: string | null;
  newest: string | null;
  gaps: { missingQuarterHours: number; ranges: number; examples: Gap[] };
};

const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : null);

/**
 * Per-source status. Row counts and the oldest value come from the daily aggregate (fast even
 * for tens of millions of rows); the newest value uses the (series_id, ts) primary key.
 * Gaps: missing quarter hours between existing values of "actual" series in the last 60 days.
 */
export async function getSourceStatus(): Promise<SourceStatus[]> {
  const [runs, counts, newest, gaps] = await Promise.all([
    db().execute<{ source: string; last_success: Date | null; last_error_at: Date | null; last_error: string | null }>(sql`
      SELECT source,
        max(finished_at) FILTER (WHERE status = 'success') AS last_success,
        max(finished_at) FILTER (WHERE status = 'error') AS last_error_at,
        (array_agg(error ORDER BY finished_at DESC) FILTER (WHERE status = 'error'))[1] AS last_error
      FROM ingest_runs GROUP BY source`),
    db().execute<{ source: string; rows: string; oldest: Date | null }>(sql`
      SELECT s.source, coalesce(sum(d.count), 0)::bigint AS rows, min(d.bucket) AS oldest
      FROM series s LEFT JOIN obs_daily d ON d.series_id = s.id
      GROUP BY s.source`),
    db().execute<{ source: string; newest: Date | null }>(sql`
      SELECT s.source, max(l.ts) AS newest
      FROM series s
      CROSS JOIN LATERAL (SELECT max(ts) AS ts FROM observations o WHERE o.series_id = s.id) l
      WHERE s.kind = 'actual'
      GROUP BY s.source`),
    db().execute<{ source: string; label: string; region: string; prev: Date; ts: Date; missing: number }>(sql`
      SELECT s.source, s.label, s.region, x.prev, x.ts,
             (extract(epoch FROM x.ts - x.prev) / 900)::int - 1 AS missing
      FROM (
        SELECT series_id, ts, lag(ts) OVER (PARTITION BY series_id ORDER BY ts) AS prev
        FROM observations
        WHERE ts > now() - interval '60 days'
      ) x
      JOIN series s ON s.id = x.series_id
      WHERE s.kind = 'actual' AND x.ts - x.prev > interval '15 minutes'
      ORDER BY missing DESC`),
  ]);

  return SOURCE_IDS.map((source) => {
    const r = runs.rows.find((x) => x.source === source);
    const c = counts.rows.find((x) => x.source === source);
    const g = gaps.rows.filter((x) => x.source === source);
    return {
      source,
      lastSuccessAt: iso(r?.last_success),
      lastErrorAt: iso(r?.last_error_at),
      lastError: r?.last_error ?? null,
      rows: Number(c?.rows ?? 0),
      oldest: iso(c?.oldest),
      newest: iso(newest.rows.find((x) => x.source === source)?.newest),
      gaps: {
        missingQuarterHours: g.reduce((a, x) => a + x.missing, 0),
        ranges: g.length,
        examples: g.slice(0, 3).map((x) => ({ series: `${x.label} (${x.region})`, from: iso(x.prev)!, to: iso(x.ts)!, missing: x.missing })),
      },
    };
  });
}
