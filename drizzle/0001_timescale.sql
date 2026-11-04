-- TimescaleDB setup: hypertables, continuous aggregates, compression and retention.
-- Kept as raw SQL because Drizzle has no notion of Timescale objects.
-- Continuous aggregates are created WITH NO DATA so this runs inside the migration transaction;
-- the refresh policies fill them in the background.

CREATE EXTENSION IF NOT EXISTS timescaledb;
--> statement-breakpoint

-- observations: 1-month chunks on ts
SELECT create_hypertable('observations', by_range('ts', INTERVAL '1 month'), if_not_exists => TRUE);
--> statement-breakpoint

-- Compression for chunks older than 90 days (revisions only touch the last 60 days).
ALTER TABLE observations SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'series_id',
  timescaledb.compress_orderby = 'ts'
);
--> statement-breakpoint
SELECT add_compression_policy('observations', INTERVAL '90 days', if_not_exists => TRUE);
--> statement-breakpoint

-- Hourly aggregate (UTC hour buckets; every German local hour maps to exactly one UTC hour).
CREATE MATERIALIZED VIEW obs_hourly
WITH (timescaledb.continuous, timescaledb.materialized_only = false) AS
SELECT
  series_id,
  time_bucket(INTERVAL '1 hour', ts) AS bucket,
  avg(value)   AS avg,
  min(value)   AS min,
  max(value)   AS max,
  sum(value)   AS sum,
  count(value) AS count
FROM observations
GROUP BY series_id, bucket
WITH NO DATA;
--> statement-breakpoint

-- Daily aggregate with calendar days in Europe/Berlin (23/25-hour days at DST switches).
-- Months and years are derived from obs_daily at query time.
CREATE MATERIALIZED VIEW obs_daily
WITH (timescaledb.continuous, timescaledb.materialized_only = false) AS
SELECT
  series_id,
  time_bucket(INTERVAL '1 day', ts, 'Europe/Berlin') AS bucket,
  avg(value)   AS avg,
  min(value)   AS min,
  max(value)   AS max,
  sum(value)   AS sum,
  count(value) AS count
FROM observations
GROUP BY series_id, bucket
WITH NO DATA;
--> statement-breakpoint

-- Refresh the last 60 days regularly so that late revisions propagate.
SELECT add_continuous_aggregate_policy('obs_hourly',
  start_offset => INTERVAL '60 days',
  end_offset => INTERVAL '1 hour',
  schedule_interval => INTERVAL '15 minutes',
  if_not_exists => TRUE);
--> statement-breakpoint
SELECT add_continuous_aggregate_policy('obs_daily',
  start_offset => INTERVAL '62 days',
  end_offset => INTERVAL '1 hour',
  schedule_interval => INTERVAL '1 hour',
  if_not_exists => TRUE);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS obs_hourly_series_bucket_idx ON obs_hourly (series_id, bucket DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS obs_daily_series_bucket_idx ON obs_daily (series_id, bucket DESC);
--> statement-breakpoint

-- Visitor statistics: raw data is kept for 90 days (adjustable in the admin area later).
SELECT create_hypertable('visits', by_range('started_at', INTERVAL '7 days'), if_not_exists => TRUE);
--> statement-breakpoint
SELECT create_hypertable('visit_events', by_range('ts', INTERVAL '7 days'), if_not_exists => TRUE);
--> statement-breakpoint
SELECT add_retention_policy('visits', INTERVAL '90 days', if_not_exists => TRUE);
--> statement-breakpoint
SELECT add_retention_policy('visit_events', INTERVAL '90 days', if_not_exists => TRUE);
