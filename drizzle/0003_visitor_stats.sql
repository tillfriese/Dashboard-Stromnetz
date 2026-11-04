-- Visitor statistics: long-lived aggregates. Raw rows in visits / visit_events are removed by the
-- retention policy (default 90 days); these continuous aggregates are only refreshed for the last
-- few days, so their older buckets survive the deletion of the raw data ("Tagesaggregate bleiben").

-- Lookup of today's visit by its (daily) id.
CREATE INDEX IF NOT EXISTS visits_id_started_idx ON visits (id, started_at DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS visit_events_type_ts_idx ON visit_events (type, ts DESC);
--> statement-breakpoint

-- Sessions per hour and dimension (hour buckets allow the weekday x hour heatmap).
CREATE MATERIALIZED VIEW visits_hourly
WITH (timescaledb.continuous, timescaledb.materialized_only = false) AS
SELECT
  time_bucket(INTERVAL '1 hour', started_at) AS bucket,
  coalesce(device, '–') AS device,
  coalesce(browser, '–') AS browser,
  coalesce(os, '–') AS os,
  coalesce(country, '–') AS country,
  coalesce(referrer_domain, '') AS referrer,
  count(*) AS sessions,
  sum(pageviews) AS pageviews,
  sum(duration_ms) AS duration_ms,
  count(*) FILTER (WHERE pageviews <= 1) AS bounces
FROM visits
GROUP BY 1, 2, 3, 4, 5, 6
WITH NO DATA;
--> statement-breakpoint

-- Events per day (Europe/Berlin), type, name and path: pages and interactions.
CREATE MATERIALIZED VIEW visit_events_daily
WITH (timescaledb.continuous, timescaledb.materialized_only = false) AS
SELECT
  time_bucket(INTERVAL '1 day', ts, 'Europe/Berlin') AS bucket,
  type,
  coalesce(name, '') AS name,
  path,
  coalesce(props->>'value', '') AS label,
  count(*) AS events
FROM visit_events
GROUP BY 1, 2, 3, 4, 5
WITH NO DATA;
--> statement-breakpoint

-- Visits are updated while the session is running (ended_at, pageviews), so the last 3 days
-- are re-materialised regularly. Older buckets stay untouched.
SELECT add_continuous_aggregate_policy('visits_hourly',
  start_offset => INTERVAL '3 days', end_offset => INTERVAL '5 minutes',
  schedule_interval => INTERVAL '10 minutes', if_not_exists => TRUE);
--> statement-breakpoint
SELECT add_continuous_aggregate_policy('visit_events_daily',
  start_offset => INTERVAL '3 days', end_offset => INTERVAL '5 minutes',
  schedule_interval => INTERVAL '10 minutes', if_not_exists => TRUE);
