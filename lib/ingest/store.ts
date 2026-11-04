import { pool } from "@/lib/db";
import { allSeriesDefs } from "@/lib/sources";
import type { Observation, SeriesDef } from "@/lib/sources/types";

const g = globalThis as unknown as { netzlageSeriesIds?: Map<string, number> };

/** Registers series metadata (idempotent) and returns key -> id. */
export async function ensureSeries(defs: SeriesDef[] = allSeriesDefs()): Promise<Map<string, number>> {
  const ids = (g.netzlageSeriesIds ??= new Map());
  const missing = defs.filter((d) => !ids.has(d.key));
  if (missing.length === 0) return ids;
  // Arrays are passed as single parameters via pg directly (Drizzle's sql`` would expand them).
  const res = await pool().query<{ id: number; key: string }>(
    `INSERT INTO series (key, source, region, unit, label, color, kind)
     SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::series_kind[])
     ON CONFLICT (key) DO UPDATE SET
       source = EXCLUDED.source, region = EXCLUDED.region, unit = EXCLUDED.unit,
       label = EXCLUDED.label, color = EXCLUDED.color, kind = EXCLUDED.kind
     RETURNING id, key`,
    [
      missing.map((d) => d.key),
      missing.map((d) => d.source),
      missing.map((d) => d.region),
      missing.map((d) => d.unit),
      missing.map((d) => d.label),
      missing.map((d) => d.color ?? null),
      missing.map((d) => d.kind),
    ],
  );
  for (const r of res.rows) ids.set(r.key, r.id);
  return ids;
}

const BATCH = 5_000;

/**
 * Upserts observations. Revisions overwrite older values; unchanged rows are not rewritten.
 * Returns the number of inserted or changed rows.
 */
export async function writeObservations(obs: Observation[]): Promise<number> {
  if (obs.length === 0) return 0;
  const ids = await ensureSeries();
  // De-duplicate (last value wins) so one statement never touches a row twice.
  const unique = new Map<string, Observation>();
  for (const o of obs) unique.set(`${o.seriesKey}|${o.ts}`, o);
  const rows = [...unique.values()];

  let written = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const seriesIds = chunk.map((o) => {
      const id = ids.get(o.seriesKey);
      if (id == null) throw new Error(`unknown series ${o.seriesKey}`);
      return id;
    });
    const res = await pool().query(
      `INSERT INTO observations (series_id, ts, value, fetched_at)
       SELECT s, to_timestamp(t / 1000.0), v, now()
       FROM unnest($1::int[], $2::float8[], $3::float8[]) AS u(s, t, v)
       ON CONFLICT (series_id, ts) DO UPDATE
         SET value = EXCLUDED.value, fetched_at = EXCLUDED.fetched_at
         WHERE observations.value IS DISTINCT FROM EXCLUDED.value`,
      [seriesIds, chunk.map((o) => o.ts), chunk.map((o) => o.value)],
    );
    written += res.rowCount ?? 0;
  }
  return written;
}

/**
 * Materialises the continuous aggregates for [from, to). Needed after backfills: the refresh
 * policies only cover the last 60 days, so older imported data would otherwise never show up
 * in obs_hourly / obs_daily. Must run outside a transaction.
 */
export async function refreshAggregates(from: number, to: number): Promise<void> {
  for (const view of ["obs_hourly", "obs_daily"]) {
    await pool().query(`CALL refresh_continuous_aggregate($1, to_timestamp($2 / 1000.0), to_timestamp($3 / 1000.0))`, [view, from, to]);
  }
}
