import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  smallint,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

const tstz = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const seriesKind = pgEnum("series_kind", ["actual", "forecast"]);
export const runStatus = pgEnum("run_status", ["running", "success", "error"]);
export const backfillStatus = pgEnum("backfill_status", [
  "pending",
  "running",
  "paused",
  "cancelled",
  "done",
  "error",
]);

/** One row per time series, e.g. `smard:4067:DE` (wind onshore, Germany). */
export const series = pgTable("series", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  source: text("source").notNull(),
  region: text("region").notNull(),
  unit: text("unit").notNull(),
  label: text("label").notNull(),
  color: text("color"),
  kind: seriesKind("kind").notNull().default("actual"),
  createdAt: tstz("created_at").notNull().defaultNow(),
});

/**
 * Measurements. Converted to a TimescaleDB hypertable on `ts` (1-month chunks)
 * in a raw SQL migration. Gaps are never stored as 0 – missing values are simply absent.
 */
export const observations = pgTable(
  "observations",
  {
    seriesId: integer("series_id")
      .notNull()
      .references(() => series.id, { onDelete: "cascade" }),
    ts: tstz("ts").notNull(),
    value: doublePrecision("value").notNull(),
    fetchedAt: tstz("fetched_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.seriesId, t.ts] })],
);

export const ingestRuns = pgTable(
  "ingest_runs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    source: text("source").notNull(),
    job: text("job").notNull().default("scheduled"),
    startedAt: tstz("started_at").notNull().defaultNow(),
    finishedAt: tstz("finished_at"),
    status: runStatus("status").notNull().default("running"),
    rows: integer("rows").notNull().default(0),
    error: text("error"),
  },
  (t) => [index("ingest_runs_source_started_idx").on(t.source, t.startedAt.desc())],
);

/** Resumable backfill job; progress is tracked per source and month in `progress`. */
export const backfillJobs = pgTable("backfill_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  sources: text("sources").array().notNull(),
  rangeFrom: date("range_from", { mode: "string" }).notNull(),
  rangeTo: date("range_to", { mode: "string" }).notNull(),
  status: backfillStatus("status").notNull().default("pending"),
  /** `{ [source]: { done: string[] /* YYYY-MM *\/, total: number } }` */
  progress: jsonb("progress").notNull().default(sql`'{}'::jsonb`),
  currentChunk: text("current_chunk"),
  rows: bigint("rows", { mode: "number" }).notNull().default(0),
  error: text("error"),
  createdAt: tstz("created_at").notNull().defaultNow(),
  startedAt: tstz("started_at"),
  finishedAt: tstz("finished_at"),
});

/** Encrypted settings (AES-256-GCM, key from SETTINGS_ENCRYPTION_KEY). */
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  valueEncrypted: text("value_encrypted").notNull(),
  updatedAt: tstz("updated_at").notNull().defaultNow(),
});

export const savedViews = pgTable("saved_views", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  query: jsonb("query").notNull(),
  createdAt: tstz("created_at").notNull().defaultNow(),
});

/**
 * Visitor sessions (cookieless). `id` is a hash of IP + UA + daily salt; the IP
 * itself is never stored. Hypertable on `started_at` with a retention policy.
 */
export const visits = pgTable(
  "visits",
  {
    id: text("id").notNull(),
    startedAt: tstz("started_at").notNull(),
    endedAt: tstz("ended_at").notNull(),
    durationMs: integer("duration_ms").notNull().default(0),
    pageviews: smallint("pageviews").notNull().default(0),
    entryPath: text("entry_path"),
    exitPath: text("exit_path"),
    referrerDomain: text("referrer_domain"),
    utmSource: text("utm_source"),
    utmMedium: text("utm_medium"),
    utmCampaign: text("utm_campaign"),
    utmTerm: text("utm_term"),
    utmContent: text("utm_content"),
    country: text("country"),
    device: text("device"),
    browser: text("browser"),
    browserVersion: text("browser_version"),
    os: text("os"),
    osVersion: text("os_version"),
    screenClass: text("screen_class"),
    language: text("language"),
    timezone: text("timezone"),
    colorScheme: text("color_scheme"),
  },
  (t) => [primaryKey({ columns: [t.id, t.startedAt] })],
);

/** Page views and interactions. Hypertable on `ts` with a retention policy. */
export const visitEvents = pgTable(
  "visit_events",
  {
    ts: tstz("ts").notNull(),
    visitId: text("visit_id").notNull(),
    type: text("type").notNull(),
    path: text("path").notNull(),
    name: text("name"),
    value: doublePrecision("value"),
    props: jsonb("props"),
  },
  (t) => [index("visit_events_visit_ts_idx").on(t.visitId, t.ts)],
);

export * from "./auth-schema";
