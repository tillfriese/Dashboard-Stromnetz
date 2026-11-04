import { addDays, format, parseISO } from "date-fns";
import type { PoolClient } from "pg";
import { pool } from "@/lib/db";
import { CO2_G_PER_KWH, GENERATION_METRICS, RENEWABLE_METRICS } from "@/lib/energy";
import { ensureSeries } from "@/lib/ingest/store";
import { isPublicMode } from "@/lib/settings";
import { flowKey, NET_IMPORT_KEY, PRICE_KEY } from "@/lib/sources/energy-charts";
import { smardSeriesKey } from "@/lib/sources/smard";
import { berlinDateToMs } from "@/lib/time";
import { fetchInstalledPower } from "./installed";
import { type Condition, effectiveResolution, type HistoryQuery, previousYear, type Resolution } from "./query";
import type { SeriesBlock, Stat, TimeseriesResponse } from "./types";

/*
 * Aggregation for the "Historie" page.
 * Without conditions the continuous aggregates are used (hour -> obs_hourly; day/week/month/year
 * -> obs_daily, re-bucketed in Europe/Berlin). With conditions, a quarter-hour mask is computed
 * from raw data first and only matching quarter hours are aggregated.
 */

const INTERVAL: Record<Exclude<Resolution, "15min">, string> = {
  hour: "1 hour",
  day: "1 day",
  week: "1 week",
  month: "1 month",
  year: "1 year",
};
const SQL_OP = { lt: "<", le: "<=", gt: ">", ge: ">=" } as const;

/** Series keys needed for a query. */
export function seriesKeysFor(q: HistoryQuery, publicMode: boolean): string[] {
  const keys = new Set<string>();
  for (const r of q.regions) {
    for (const m of GENERATION_METRICS) keys.add(smardSeriesKey(m, r));
    if (q.metrics.includes("load")) keys.add(smardSeriesKey("load", r));
    if (q.metrics.includes("residual")) keys.add(smardSeriesKey("residual_load", r));
  }
  if (q.metrics.includes("price") && !publicMode) keys.add(PRICE_KEY);
  if (q.metrics.includes("netImport")) keys.add(q.flow === "sum" ? NET_IMPORT_KEY : flowKey(q.flow));
  return [...keys];
}

type Params = unknown[];
const p = (params: Params, v: unknown) => `$${params.push(v)}`;

/**
 * CTEs ending in "mask(ts)": all quarter hours in [from, to) that satisfy every condition
 * (Germany-wide values). All needed series are pivoted in ONE pass over `observations`
 * (GROUP BY ts), which avoids join mis-estimates over the many hypertable chunks.
 */
function maskSql(conds: Condition[], ids: Map<string, number>, from: number, to: number, params: Params): string {
  const id = (k: string) => {
    const v = ids.get(k);
    if (v == null) throw new Error(`series ${k} not registered`);
    return v;
  };
  const loadId = id(smardSeriesKey("load", "DE"));
  const needGen = conds.some((c) => c.kind === "re" || c.kind === "co2");
  const needPrice = conds.some((c) => c.kind === "price");
  const needResidual = conds.some((c) => c.kind === "residual");

  const genIds = GENERATION_METRICS.map((m) => id(smardSeriesKey(m, "DE")));
  const reIds = RENEWABLE_METRICS.map((m) => id(smardSeriesKey(m, "DE")));
  const seriesIds = [loadId, ...(needGen ? genIds : []), ...(needPrice ? [id(PRICE_KEY)] : []), ...(needResidual ? [id(smardSeriesKey("residual_load", "DE"))] : [])];

  // Integer ids and constant factors are inlined (not user input); values below are parameters.
  const cols = [`max(o.value) FILTER (WHERE o.series_id = ${loadId}) AS load`];
  if (needResidual) cols.push(`max(o.value) FILTER (WHERE o.series_id = ${id(smardSeriesKey("residual_load", "DE"))}) AS residual`);
  if (needPrice) cols.push(`max(o.value) FILTER (WHERE o.series_id = ${id(PRICE_KEY)}) AS price`);
  if (needGen) {
    const factor = GENERATION_METRICS.map((m) => `WHEN ${id(smardSeriesKey(m, "DE"))} THEN ${CO2_G_PER_KWH[m] ?? 0}`).join(" ");
    cols.push(`sum(o.value) FILTER (WHERE o.series_id IN (${genIds.join(",")})) AS tot`);
    cols.push(`sum(o.value) FILTER (WHERE o.series_id IN (${reIds.join(",")})) AS re`);
    cols.push(`sum(o.value * CASE o.series_id ${factor} ELSE 0 END) FILTER (WHERE o.series_id IN (${genIds.join(",")})) AS em`);
  }

  const where: string[] = ["b.load IS NOT NULL"]; // quarter-hour grid of Germany's grid load
  for (const c of conds) {
    switch (c.kind) {
      case "price":
        where.push(`b.price_q ${SQL_OP[c.op]} ${p(params, c.value)}`);
        break;
      case "residual":
        where.push(`b.residual ${SQL_OP[c.op]} ${p(params, c.value * 1000)}`);
        break;
      case "load":
        where.push(`b.load ${SQL_OP[c.op]} ${p(params, c.value * 1000)}`);
        break;
      case "re":
        where.push(`b.re / nullif(b.tot, 0) * 100 ${SQL_OP[c.op]} ${p(params, c.value)}`);
        break;
      case "co2":
        where.push(`b.em / nullif(b.tot, 0) ${SQL_OP[c.op]} ${p(params, c.value)}`);
        break;
      case "dow":
        where.push(`extract(isodow FROM b.ts AT TIME ZONE 'Europe/Berlin')::int = ANY(${p(params, c.days)}::int[])`);
        break;
      case "hour":
        where.push(`extract(hour FROM b.ts AT TIME ZONE 'Europe/Berlin')::int BETWEEN ${p(params, c.from)} AND ${p(params, c.to)}`);
        break;
    }
  }

  const f = p(params, from);
  const t = p(params, to);
  // Hourly prices (before Oct 2025) apply to all four quarter hours of their hour.
  const priceQ = needPrice ? ", coalesce(price, max(price) OVER (PARTITION BY date_trunc('hour', ts))) AS price_q" : "";
  return `base AS MATERIALIZED (
      SELECT o.ts, ${cols.join(", ")}
      FROM observations o
      WHERE o.series_id = ANY(${p(params, seriesIds)}::int[])
        AND o.ts >= to_timestamp(${f} / 1000.0) AND o.ts < to_timestamp(${t} / 1000.0)
      GROUP BY o.ts),
    b AS (SELECT *${priceQ} FROM base),
    mask AS (SELECT b.ts FROM b WHERE ${where.join(" AND ")})`;
}

const bucketExpr = (res: Resolution, col: string) =>
  res === "15min" ? col : res === "hour" ? `time_bucket('1 hour', ${col})` : `time_bucket('${INTERVAL[res]}', ${col}, 'Europe/Berlin')`;

const labelExpr = (col: string, res: Resolution) =>
  res === "15min" || res === "hour"
    ? `to_char(${col} AT TIME ZONE 'Europe/Berlin', 'YYYY-MM-DD"T"HH24:MI')`
    : `to_char(${col} AT TIME ZONE 'Europe/Berlin', 'YYYY-MM-DD')`;

async function aggregate(
  client: PoolClient,
  keys: string[],
  from: number,
  to: number,
  res: Resolution,
  conds: Condition[],
  ids: Map<string, number>,
): Promise<SeriesBlock> {
  const params: Params = [];
  const seriesIds = keys.map((k) => ids.get(k)).filter((x): x is number => x != null);
  let sql: string;
  let matchedSql: string | null = null;
  const matchedParams: Params = [];

  if (conds.length > 0) {
    // Evaluate the quarter-hour mask once into a temporary table (dropped at commit), then use it
    // for both the aggregation and the count of matching quarter hours.
    const maskParams: Params = [];
    const mask = maskSql(conds, ids, from, to, maskParams);
    await client.query("DROP TABLE IF EXISTS pg_temp.mask_q");
    await client.query(`CREATE TEMP TABLE mask_q ON COMMIT DROP AS WITH ${mask} SELECT ts FROM mask`, maskParams);
    await client.query("ANALYZE mask_q");
    sql = `SELECT o.series_id, ${bucketExpr(res, "o.ts")} AS b, sum(o.value) AS sum, count(*)::int AS count
      FROM mask_q m JOIN observations o ON o.ts = m.ts
      WHERE o.series_id = ANY(${p(params, seriesIds)}::int[])
        AND o.ts >= to_timestamp(${p(params, from)} / 1000.0) AND o.ts < to_timestamp(${p(params, to)} / 1000.0)
      GROUP BY 1, 2`;
    matchedSql = `SELECT ${bucketExpr(res, "m.ts")} AS b, count(*)::int AS n FROM mask_q m GROUP BY 1`;
  } else if (res === "15min") {
    sql = `SELECT o.series_id, o.ts AS b, o.value AS sum, 1 AS count FROM observations o
      WHERE o.series_id = ANY(${p(params, seriesIds)}::int[])
        AND o.ts >= to_timestamp(${p(params, from)} / 1000.0) AND o.ts < to_timestamp(${p(params, to)} / 1000.0)`;
  } else if (res === "hour") {
    sql = `SELECT h.series_id, h.bucket AS b, h.sum, h.count::int FROM obs_hourly h
      WHERE h.series_id = ANY(${p(params, seriesIds)}::int[])
        AND h.bucket >= to_timestamp(${p(params, from)} / 1000.0) AND h.bucket < to_timestamp(${p(params, to)} / 1000.0)`;
  } else {
    sql = `SELECT d.series_id, ${res === "day" ? "d.bucket" : bucketExpr(res, "d.bucket")} AS b, sum(d.sum) AS sum, sum(d.count)::int AS count
      FROM obs_daily d
      WHERE d.series_id = ANY(${p(params, seriesIds)}::int[])
        AND d.bucket >= to_timestamp(${p(params, from)} / 1000.0) AND d.bucket < to_timestamp(${p(params, to)} / 1000.0)
      GROUP BY 1, 2`;
  }

  const wrapped = `SELECT x.series_id, (extract(epoch FROM x.b) * 1000)::bigint AS ts, ${labelExpr("x.b", res)} AS label, x.sum, x.count
    FROM (${sql}) x`;
  const { rows } = await client.query<{ series_id: number; ts: string; label: string; sum: number; count: number }>(wrapped, params);
  const matched = matchedSql
    ? (await client.query<{ ts: string; n: number }>(`SELECT (extract(epoch FROM y.b) * 1000)::bigint AS ts, y.n FROM (${matchedSql}) y`, matchedParams)).rows
    : null;

  const keyById = new Map([...ids].map(([k, v]) => [v, k]));
  const labelByTs = new Map<number, string>();
  for (const r of rows) labelByTs.set(Number(r.ts), r.label);
  const buckets = [...labelByTs.keys()].sort((a, b) => a - b);
  const index = new Map(buckets.map((b, i) => [b, i]));
  const series: Record<string, Stat[]> = Object.fromEntries(keys.map((k) => [k, buckets.map(() => null)]));
  for (const r of rows) {
    const k = keyById.get(r.series_id);
    if (k && series[k]) series[k][index.get(Number(r.ts))!] = [Number(r.sum), Number(r.count)];
  }
  const matchedArr = matched ? buckets.map((b) => matched.find((m) => Number(m.ts) === b)?.n ?? 0) : null;
  return { buckets, labels: buckets.map((b) => labelByTs.get(b)!), series, matched: matchedArr };
}

/** Hours with negative day-ahead prices (hourly before Oct 2025, quarter-hourly afterwards). */
async function negativePriceHours(client: PoolClient, priceId: number, from: number, to: number): Promise<number> {
  const { rows } = await client.query<{ h: number | null }>(
    `SELECT sum(extract(epoch FROM least(coalesce(nx - ts, interval '15 minutes'), interval '1 hour')) / 3600)::float AS h
     FROM (SELECT ts, value, lead(ts) OVER (ORDER BY ts) AS nx FROM observations
           WHERE series_id = $1 AND ts >= to_timestamp($2 / 1000.0) AND ts < to_timestamp($3 / 1000.0)) x
     WHERE value < 0`,
    [priceId, from, to],
  );
  return rows[0]?.h ?? 0;
}

const endExclusive = (to: string) => berlinDateToMs(format(addDays(parseISO(to), 1), "yyyy-MM-dd"));

export async function getTimeseries(q: HistoryQuery): Promise<TimeseriesResponse> {
  const publicMode = await isPublicMode();
  const { res, coarsened } = effectiveResolution(q);
  const keys = seriesKeysFor(q, publicMode);
  const ids = await ensureSeries();
  const from = berlinDateToMs(q.from);
  const to = endExclusive(q.to);
  // Price conditions are not allowed in public mode (prices are hidden there).
  const conds = publicMode ? q.conditions.filter((c) => c.kind !== "price") : q.conditions;

  const client = await pool().connect();
  try {
    // Not READ ONLY: condition queries create a temporary mask table (no persistent writes).
    await client.query("BEGIN");
    await client.query("SET LOCAL statement_timeout = '45s'");
    // Condition masks aggregate millions of rows; avoid spilling the hash aggregate to disk.
    await client.query("SET LOCAL work_mem = '128MB'");
    const main = await aggregate(client, keys, from, to, res, conds, ids);
    let compare: SeriesBlock | null = null;
    if (q.compare) {
      const prev = previousYear(q);
      compare = await aggregate(client, keys, berlinDateToMs(prev.from), endExclusive(prev.to), res, conds, ids);
    }
    const priceId = ids.get(PRICE_KEY);
    const negative = !publicMode && priceId != null ? await negativePriceHours(client, priceId, from, to) : null;
    await client.query("COMMIT");

    const installed = q.metrics.includes("installed") ? await fetchInstalledPower(from, to).catch(() => null) : null;
    return {
      from: q.from,
      to: q.to,
      res,
      coarsened,
      publicMode,
      main,
      compare,
      kpi: {
        negativePriceHours: negative,
        matchedHours: main.matched ? main.matched.reduce((a, b) => a + b, 0) / 4 : null,
        totalHours: (to - from) / 3600_000,
      },
      installed,
    };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
