import { pool } from "@/lib/db";

/** Values of the given series in [from, to), as key -> (ts -> value). */
export async function loadSeries(keys: string[], from: number, to: number): Promise<Map<string, Map<number, number>>> {
  const out = new Map<string, Map<number, number>>(keys.map((k) => [k, new Map()]));
  if (keys.length === 0) return out;
  const { rows } = await pool().query<{ key: string; ts: string; value: number }>(
    `SELECT s.key, (extract(epoch FROM o.ts) * 1000)::bigint AS ts, o.value
     FROM observations o JOIN series s ON s.id = o.series_id
     WHERE s.key = ANY($1::text[]) AND o.ts >= to_timestamp($2 / 1000.0) AND o.ts < to_timestamp($3 / 1000.0)`,
    [keys, from, to],
  );
  for (const r of rows) out.get(r.key)!.set(Number(r.ts), r.value);
  return out;
}

/** Latest timestamp (<= now) per series key among the given keys. */
export async function latestTimestamps(keys: string[], maxTs = Date.now()): Promise<Map<string, number>> {
  const { rows } = await pool().query<{ key: string; ts: string | null }>(
    `SELECT s.key, (extract(epoch FROM l.ts) * 1000)::bigint AS ts
     FROM series s
     CROSS JOIN LATERAL (
       SELECT max(o.ts) AS ts FROM observations o
       WHERE o.series_id = s.id AND o.ts <= to_timestamp($2 / 1000.0) AND o.ts > to_timestamp($2 / 1000.0) - interval '14 days'
     ) l
     WHERE s.key = ANY($1::text[])`,
    [keys, maxTs],
  );
  return new Map(rows.filter((r) => r.ts != null).map((r) => [r.key, Number(r.ts)]));
}

/** Newest "actual" value per source (data freshness). */
export async function freshnessBySource(): Promise<Record<string, number | null>> {
  const { rows } = await pool().query<{ source: string; ts: string | null }>(
    `SELECT s.source, (extract(epoch FROM max(l.ts)) * 1000)::bigint AS ts
     FROM series s
     CROSS JOIN LATERAL (
       SELECT max(o.ts) AS ts FROM observations o
       WHERE o.series_id = s.id AND o.ts <= now() AND o.ts > now() - interval '14 days'
     ) l
     WHERE s.kind = 'actual'
     GROUP BY s.source`,
  );
  return Object.fromEntries(rows.map((r) => [r.source, r.ts == null ? null : Number(r.ts)]));
}
