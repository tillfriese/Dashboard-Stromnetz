import { getAuthenticatorName } from "@better-auth/passkey";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { passkey } from "@/lib/db/auth-schema";
import { scheduledJobs } from "@/lib/ingest/scheduler";

export async function listPasskeys(userId: string) {
  const rows = await db().select().from(passkey).where(eq(passkey.userId, userId)).orderBy(desc(passkey.createdAt));
  return rows.map((p) => ({
    id: p.id,
    name: p.name ?? "Passkey",
    device: getAuthenticatorName(p.aaguid) ?? (p.deviceType === "multiDevice" ? "Synchronisierter Passkey" : "Gerätegebundener Passkey"),
    backedUp: p.backedUp,
    createdAt: p.createdAt?.toISOString() ?? null,
    lastUsedAt: p.lastUsedAt?.toISOString() ?? null,
  }));
}

export async function systemInfo() {
  const [size, tables, compression, caggs, tsJobs] = await Promise.all([
    db().execute<{ size: string }>(sql`SELECT pg_size_pretty(pg_database_size(current_database())) AS size`),
    db().execute<{ name: string; bytes: string; pretty: string }>(sql`
      SELECT name, bytes, pg_size_pretty(bytes) AS pretty FROM (
        SELECT hypertable_name AS name, hypertable_size(format('%I.%I', hypertable_schema, hypertable_name)::regclass) AS bytes
        FROM timescaledb_information.hypertables
        UNION ALL
        SELECT c.relname, pg_total_relation_size(c.oid)
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r'
          AND c.relname NOT IN (SELECT hypertable_name FROM timescaledb_information.hypertables)
      ) t ORDER BY bytes DESC NULLS LAST LIMIT 12`),
    db().execute<{ total_chunks: string; compressed: string; before: string | null; after: string | null }>(sql`
      SELECT total_chunks, number_compressed_chunks AS compressed,
             before_compression_total_bytes AS before, after_compression_total_bytes AS after
      FROM hypertable_compression_stats('observations')`),
    db().execute<{ view_name: string; last_run: Date | null; last_status: string | null; next_start: Date | null; watermark: Date | null }>(sql`
      SELECT ca.view_name, js.last_run_started_at AS last_run, js.last_run_status AS last_status, js.next_start,
             _timescaledb_functions.to_timestamp(_timescaledb_functions.cagg_watermark(cg.mat_hypertable_id)) AS watermark
      FROM timescaledb_information.continuous_aggregates ca
      JOIN _timescaledb_catalog.continuous_agg cg ON cg.user_view_name = ca.view_name
      LEFT JOIN timescaledb_information.jobs j ON j.hypertable_name = ca.view_name
      LEFT JOIN timescaledb_information.job_stats js ON js.job_id = j.job_id
      ORDER BY ca.view_name`),
    db().execute<{ application_name: string; hypertable_name: string; next_start: Date | null; last_run_status: string | null }>(sql`
      SELECT j.application_name, j.hypertable_name, js.next_start, js.last_run_status
      FROM timescaledb_information.jobs j LEFT JOIN timescaledb_information.job_stats js ON js.job_id = j.job_id
      WHERE j.job_id >= 1000 ORDER BY js.next_start`),
  ]);
  const c = compression.rows[0];
  const before = Number(c?.before ?? 0);
  const after = Number(c?.after ?? 0);
  return {
    version: process.env.APP_VERSION ?? process.env.npm_package_version ?? "dev",
    uptimeS: Math.round(process.uptime()),
    dbSize: size.rows[0]?.size ?? "–",
    tables: tables.rows.map((t) => ({ name: t.name, pretty: t.pretty })),
    compression: {
      chunks: Number(c?.total_chunks ?? 0),
      compressed: Number(c?.compressed ?? 0),
      ratio: before > 0 && after > 0 ? before / after : null,
    },
    caggs: caggs.rows.map((r) => ({
      name: r.view_name,
      lastRun: r.last_run ? new Date(r.last_run).toISOString() : null,
      status: r.last_status,
      nextStart: r.next_start ? new Date(r.next_start).toISOString() : null,
      watermark: r.watermark ? new Date(r.watermark).toISOString() : null,
    })),
    dbJobs: tsJobs.rows.map((j) => ({
      name: `${j.application_name.replace(/ \[\d+\]$/, "")} (${j.hypertable_name ?? ""})`,
      nextRun: j.next_start ? new Date(j.next_start).toISOString() : null,
      status: j.last_run_status,
    })),
    appJobs: scheduledJobs(),
  };
}
