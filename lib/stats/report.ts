import { pool } from "@/lib/db";
import { getSetting } from "@/lib/settings";
import { addBerlinDays, berlinDateToMs } from "@/lib/time";

/*
 * Visitor statistics for the admin tab. Totals, time series, heatmap and rankings come from the
 * continuous aggregates (kept forever); session list, timeline, Web Vitals and errors come from
 * the raw tables (kept for the retention period only).
 */

export type Ranking = { label: string; count: number }[];

export type StatsReport = {
  from: string;
  to: string;
  retentionDays: number;
  kpis: { sessions: number; pageviews: number; avgDurationMs: number | null; bounceRate: number | null; activeNow: number };
  series: { bucket: string; sessions: number; pageviews: number }[];
  granularity: "hour" | "day";
  heatmap: number[][]; // [weekday 0=Mo..6=So][hour 0..23] sessions
  rankings: Record<"pages" | "referrers" | "countries" | "devices" | "browsers" | "zones" | "carriers" | "filters", Ranking>;
  savedViews: { name: string; createdAt: string }[];
  vitals: { path: string; metric: string; p75: number; samples: number; rating: "gut" | "mittel" | "schlecht" }[];
  errors: { ts: string; path: string; message: string }[];
};

const VITAL_THRESHOLDS: Record<string, [number, number]> = { LCP: [2500, 4000], INP: [200, 500], CLS: [100, 250] }; // CLS x1000

export function range(from: string, to: string) {
  return { start: berlinDateToMs(from), end: addBerlinDays(berlinDateToMs(to), 1) };
}

const ts = (ms: number) => new Date(ms).toISOString();

export async function getStatsReport(from: string, to: string): Promise<StatsReport> {
  const { start, end } = range(from, to);
  const p = [ts(start), ts(end)];
  const granularity = end - start <= 3 * 86_400_000 ? "hour" : "day";
  const q = <T extends object>(sql: string, params: unknown[] = p) => pool().query<T>(sql, params).then((r) => r.rows);

  const rank = (sql: string, params: unknown[] = p) => q<{ label: string; count: string }>(sql, params).then((rows) => rows.map((r) => ({ label: r.label, count: Number(r.count) })));

  const [kpi, active, series, heat, pages, referrers, countries, devices, browsers, zones, carriers, filters, views, vitals, errors, retention] =
    await Promise.all([
      q<{ sessions: string; pageviews: string; duration: string; bounces: string }>(
        `SELECT coalesce(sum(sessions),0) AS sessions, coalesce(sum(pageviews),0) AS pageviews,
                coalesce(sum(duration_ms),0) AS duration, coalesce(sum(bounces),0) AS bounces
         FROM visits_hourly WHERE bucket >= $1 AND bucket < $2`,
      ),
      q<{ n: string }>(`SELECT count(*) AS n FROM visits WHERE ended_at > now() - interval '5 minutes'`, []),
      q<{ bucket: string; sessions: string; pageviews: string }>(
        granularity === "hour"
          ? `SELECT to_char(bucket AT TIME ZONE 'Europe/Berlin', 'YYYY-MM-DD"T"HH24:00') AS bucket, sum(sessions) AS sessions, sum(pageviews) AS pageviews
             FROM visits_hourly WHERE bucket >= $1 AND bucket < $2 GROUP BY 1 ORDER BY 1`
          : `SELECT to_char(time_bucket('1 day', bucket, 'Europe/Berlin') AT TIME ZONE 'Europe/Berlin', 'YYYY-MM-DD') AS bucket,
                    sum(sessions) AS sessions, sum(pageviews) AS pageviews
             FROM visits_hourly WHERE bucket >= $1 AND bucket < $2 GROUP BY 1 ORDER BY 1`,
      ),
      q<{ dow: number; h: number; sessions: string }>(
        `SELECT extract(isodow FROM bucket AT TIME ZONE 'Europe/Berlin')::int AS dow,
                extract(hour FROM bucket AT TIME ZONE 'Europe/Berlin')::int AS h, sum(sessions) AS sessions
         FROM visits_hourly WHERE bucket >= $1 AND bucket < $2 GROUP BY 1, 2`,
      ),
      rank(`SELECT path AS label, sum(events) AS count FROM visit_events_daily WHERE type = 'pageview' AND bucket >= $1 AND bucket < $2 GROUP BY 1 ORDER BY 2 DESC LIMIT 10`),
      rank(`SELECT CASE WHEN referrer = '' THEN 'direkt / unbekannt' ELSE referrer END AS label, sum(sessions) AS count FROM visits_hourly WHERE bucket >= $1 AND bucket < $2 GROUP BY 1 ORDER BY 2 DESC LIMIT 10`),
      rank(`SELECT CASE WHEN country = '–' THEN 'unbekannt' ELSE country END AS label, sum(sessions) AS count FROM visits_hourly WHERE bucket >= $1 AND bucket < $2 GROUP BY 1 ORDER BY 2 DESC LIMIT 10`),
      rank(`SELECT device AS label, sum(sessions) AS count FROM visits_hourly WHERE bucket >= $1 AND bucket < $2 GROUP BY 1 ORDER BY 2 DESC`),
      rank(`SELECT browser AS label, sum(sessions) AS count FROM visits_hourly WHERE bucket >= $1 AND bucket < $2 GROUP BY 1 ORDER BY 2 DESC LIMIT 10`),
      rank(`SELECT label, sum(events) AS count FROM visit_events_daily WHERE type = 'event' AND name = 'zone_click' AND bucket >= $1 AND bucket < $2 GROUP BY 1 ORDER BY 2 DESC`),
      rank(`SELECT label, sum(events) AS count FROM visit_events_daily WHERE type = 'event' AND name = 'history_carrier' AND bucket >= $1 AND bucket < $2 GROUP BY 1 ORDER BY 2 DESC`),
      rank(
        `SELECT CASE name
                  WHEN 'history_period' THEN 'Zeitraum geändert'
                  WHEN 'history_resolution' THEN 'Auflösung: ' || label
                  WHEN 'history_chart' THEN 'Diagrammtyp: ' || label
                  WHEN 'history_metric' THEN 'Kenngröße: ' || label
                  WHEN 'history_regions' THEN 'Regionen geändert'
                  WHEN 'history_heatmap' THEN 'Heatmap: ' || label
                  WHEN 'history_compare' THEN 'Vorjahresvergleich'
                  WHEN 'condition_added' THEN 'Bedingung: ' || label
                  WHEN 'view_saved' THEN 'Ansicht gespeichert'
                  WHEN 'csv_exported' THEN 'CSV exportiert'
                  WHEN 'link_copied' THEN 'Link kopiert'
                  WHEN 'chart_zoom' THEN 'Zoom im Diagramm'
                  WHEN 'chart_drilldown' THEN 'Drill-down: ' || label
                  WHEN 'mix_window' THEN 'Strommix-Fenster: ' || label
                  ELSE name END AS label,
                sum(events) AS count
         FROM visit_events_daily
         WHERE type = 'event' AND name NOT IN ('zone_click', 'history_carrier') AND bucket >= $1 AND bucket < $2
         GROUP BY 1 ORDER BY 2 DESC LIMIT 15`,
      ),
      q<{ name: string; created_at: Date }>(`SELECT name, created_at FROM saved_views ORDER BY created_at DESC LIMIT 10`, []),
      q<{ path: string; metric: string; p75: number; samples: string }>(
        `SELECT path, name AS metric, percentile_cont(0.75) WITHIN GROUP (ORDER BY value) AS p75, count(*) AS samples
         FROM visit_events WHERE type = 'vital' AND ts >= $1 AND ts < $2 GROUP BY 1, 2 ORDER BY 1, 2`,
      ),
      q<{ ts: Date; path: string; message: string }>(
        `SELECT ts, path, coalesce(props->>'value', '') AS message FROM visit_events
         WHERE type = 'error' AND ts >= $1 AND ts < $2 ORDER BY ts DESC LIMIT 20`,
      ),
      getSetting("stats.retentionDays"),
    ]);

  const heatmap = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  for (const r of heat) heatmap[r.dow - 1]![r.h] = Number(r.sessions);
  const k = kpi[0]!;
  const sessions = Number(k.sessions);
  return {
    from,
    to,
    retentionDays: Number(retention ?? 90),
    kpis: {
      sessions,
      pageviews: Number(k.pageviews),
      avgDurationMs: sessions ? Number(k.duration) / sessions : null,
      bounceRate: sessions ? (Number(k.bounces) / sessions) * 100 : null,
      activeNow: Number(active[0]?.n ?? 0),
    },
    series: series.map((r) => ({ bucket: r.bucket, sessions: Number(r.sessions), pageviews: Number(r.pageviews) })),
    granularity,
    heatmap,
    rankings: { pages, referrers, countries, devices, browsers, zones, carriers, filters },
    savedViews: views.map((v) => ({ name: v.name, createdAt: new Date(v.created_at).toISOString() })),
    vitals: vitals.map((v) => {
      const [good, poor] = VITAL_THRESHOLDS[v.metric] ?? [Infinity, Infinity];
      return {
        path: v.path,
        metric: v.metric,
        p75: v.p75,
        samples: Number(v.samples),
        rating: v.p75 <= good ? "gut" : v.p75 <= poor ? "mittel" : "schlecht",
      };
    }),
    errors: errors.map((e) => ({ ts: new Date(e.ts).toISOString(), path: e.path, message: e.message })),
  };
}

export type SessionRow = {
  id: string;
  startedAt: string;
  durationMs: number;
  pageviews: number;
  device: string | null;
  browser: string | null;
  os: string | null;
  country: string | null;
  entryPath: string | null;
  exitPath: string | null;
  referrer: string | null;
};

export async function listSessions(from: string, to: string, limit = 50, offset = 0): Promise<{ total: number; rows: SessionRow[] }> {
  const { start, end } = range(from, to);
  const [count, rows] = await Promise.all([
    pool().query<{ n: string }>(`SELECT count(*) AS n FROM visits WHERE started_at >= $1 AND started_at < $2`, [ts(start), ts(end)]),
    pool().query<{
      id: string; started_ms: string; duration_ms: number; pageviews: number; device: string | null; browser: string | null;
      os: string | null; country: string | null; entry_path: string | null; exit_path: string | null; referrer_domain: string | null;
    }>(
      `SELECT id, (extract(epoch FROM started_at) * 1000)::bigint AS started_ms, duration_ms, pageviews, device, browser, os, country, entry_path, exit_path, referrer_domain
       FROM visits WHERE started_at >= $1 AND started_at < $2 ORDER BY started_at DESC LIMIT $3 OFFSET $4`,
      [ts(start), ts(end), limit, offset],
    ),
  ]);
  return {
    total: Number(count.rows[0]?.n ?? 0),
    rows: rows.rows.map((r) => ({
      id: r.id,
      startedAt: new Date(Number(r.started_ms)).toISOString(),
      durationMs: r.duration_ms,
      pageviews: r.pageviews,
      device: r.device,
      browser: r.browser,
      os: r.os,
      country: r.country,
      entryPath: r.entry_path,
      exitPath: r.exit_path,
      referrer: r.referrer_domain,
    })),
  };
}

/** All events of one session (visit ids are only valid for one day). */
export async function sessionTimeline(id: string, startedAt: string) {
  const { rows } = await pool().query<{ ts: Date; type: string; path: string; name: string | null; value: number | null; label: string | null }>(
    `SELECT ts, type, path, name, value, props->>'value' AS label FROM visit_events
     WHERE visit_id = $1 AND ts >= $2::timestamptz - interval '1 minute' AND ts < $2::timestamptz + interval '36 hours'
     ORDER BY ts`,
    [id, startedAt],
  );
  return rows.map((r) => ({ ...r, ts: new Date(r.ts).toISOString() }));
}

/** Changes the retention of raw visitor data (aggregates are kept). */
export async function setRetention(days: number) {
  for (const table of ["visits", "visit_events"]) {
    await pool().query(`SELECT remove_retention_policy($1, if_exists => TRUE)`, [table]);
    await pool().query(`SELECT add_retention_policy($1, make_interval(days => $2))`, [table, days]);
  }
}
