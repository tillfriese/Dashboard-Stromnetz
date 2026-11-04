import { and, desc, eq, inArray } from "drizzle-orm";
import { db, pool } from "@/lib/db";
import { backfillJobs } from "@/lib/db/schema";
import { getSetting, isSourceEnabled } from "@/lib/settings";
import { ADAPTERS, STORED_SOURCES, type StoredSourceId } from "@/lib/sources";
import { addBerlinDays, berlinDateToMs, berlinMonths } from "@/lib/time";
import { errorMessage, recordRun } from "./runs";
import { refreshAggregates, writeObservations } from "./store";

/*
 * Resumable backfill. A job covers [from, to] (Berlin calendar days) for several sources and
 * is processed source by source, one Berlin month at a time. Completed months are stored in
 * `progress`, so a cancelled or interrupted job continues where it stopped.
 * Only one job runs at a time across all processes (app and CLI): a Postgres advisory lock.
 */

const RUNNER_LOCK_ID = 727_003;

export type SourceProgress = {
  total: number;
  done: string[];
  failed: { month: string; error: string }[];
  rows: number;
  /** Accumulated processing time and processed chunks, for the ETA. */
  ms: number;
  chunks: number;
};
export type Progress = Partial<Record<StoredSourceId, SourceProgress>>;
export type BackfillJob = typeof backfillJobs.$inferSelect;

export class BackfillError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

const ACTIVE = ["pending", "running"] as const;

function rangeMs(job: { rangeFrom: string; rangeTo: string }) {
  return { from: berlinDateToMs(job.rangeFrom), to: addBerlinDays(berlinDateToMs(job.rangeTo), 1) };
}

/** Sources selected by default: all enabled ones; ENTSO-E only with a token. */
export async function defaultSources(): Promise<StoredSourceId[]> {
  const out: StoredSourceId[] = [];
  for (const s of STORED_SOURCES) {
    if (!(await isSourceEnabled(s))) continue;
    if (s === "entsoe" && !(await getSetting("entsoe.token"))) continue;
    out.push(s);
  }
  return out;
}

export async function getActiveJob(): Promise<BackfillJob | null> {
  const rows = await db().select().from(backfillJobs).where(inArray(backfillJobs.status, [...ACTIVE])).limit(1);
  return rows[0] ?? null;
}

export async function listJobs(limit = 10) {
  return db().select().from(backfillJobs).orderBy(desc(backfillJobs.createdAt)).limit(limit);
}

/** Creates a job. Refused while another import is pending or running. */
export async function createBackfill(input: { from: string; to: string; sources: StoredSourceId[] }): Promise<BackfillJob> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.from) || !/^\d{4}-\d{2}-\d{2}$/.test(input.to)) {
    throw new BackfillError("Datum im Format JJJJ-MM-TT angeben.");
  }
  if (input.from > input.to) throw new BackfillError("Das Startdatum liegt nach dem Enddatum.");
  if (input.sources.length === 0) throw new BackfillError("Mindestens eine Quelle wählen.");
  if (await getActiveJob()) throw new BackfillError("Es läuft bereits ein Import.", 409);

  const { from, to } = rangeMs({ rangeFrom: input.from, rangeTo: input.to });
  const total = berlinMonths(from, to).length;
  const progress: Progress = Object.fromEntries(
    input.sources.map((s) => [s, { total, done: [], failed: [], rows: 0, ms: 0, chunks: 0 } satisfies SourceProgress]),
  );
  const [job] = await db()
    .insert(backfillJobs)
    .values({ sources: input.sources, rangeFrom: input.from, rangeTo: input.to, progress })
    .returning();
  return job!;
}

export async function cancelBackfill(id: string) {
  const res = await db()
    .update(backfillJobs)
    .set({ status: "cancelled", currentChunk: null, finishedAt: new Date() })
    .where(and(eq(backfillJobs.id, id), inArray(backfillJobs.status, [...ACTIVE])))
    .returning({ id: backfillJobs.id });
  return res.length > 0;
}

/** Resumes a cancelled, failed or interrupted job; done months are skipped. */
export async function resumeBackfill(id: string) {
  const active = await getActiveJob();
  if (active && active.id !== id) throw new BackfillError("Es läuft bereits ein anderer Import.", 409);
  const res = await db()
    .update(backfillJobs)
    .set({ status: "pending", error: null, finishedAt: null })
    .where(and(eq(backfillJobs.id, id), inArray(backfillJobs.status, ["cancelled", "error", "paused"])))
    .returning({ id: backfillJobs.id });
  if (res.length === 0) throw new BackfillError("Dieser Import kann nicht fortgesetzt werden.", 409);
}

/** Starts the runner in the background (no-op if a runner is already active anywhere). */
export function kickRunner() {
  void runPendingJobs().catch((err) => console.error("[backfill] runner failed:", err));
}

/**
 * Processes pending jobs until none is left. Also picks up jobs left in "running" by a
 * crashed process – safe because the advisory lock proves no other runner is alive.
 */
export async function runPendingJobs(onProgress?: (job: BackfillJob) => void): Promise<void> {
  const client = await pool().connect();
  try {
    const { rows } = await client.query<{ ok: boolean }>("SELECT pg_try_advisory_lock($1) AS ok", [RUNNER_LOCK_ID]);
    if (!rows[0]?.ok) return;
    try {
      for (;;) {
        const [job] = await db()
          .select()
          .from(backfillJobs)
          .where(inArray(backfillJobs.status, [...ACTIVE]))
          .orderBy(backfillJobs.createdAt)
          .limit(1);
        if (!job) break;
        await runJob(job, onProgress);
      }
    } finally {
      await client.query("SELECT pg_advisory_unlock($1)", [RUNNER_LOCK_ID]);
    }
  } finally {
    client.release();
  }
}

async function runJob(initial: BackfillJob, onProgress?: (job: BackfillJob) => void) {
  const id = initial.id;
  const [started] = await db()
    .update(backfillJobs)
    .set({ status: "running", startedAt: initial.startedAt ?? new Date() })
    .where(and(eq(backfillJobs.id, id), inArray(backfillJobs.status, [...ACTIVE])))
    .returning();
  if (!started) return; // cancelled in the meantime

  const controller = new AbortController();
  // Cancellation is requested via the DB (admin UI or CLI) – poll it.
  const watcher = setInterval(async () => {
    const rows = await db().select({ status: backfillJobs.status }).from(backfillJobs).where(eq(backfillJobs.id, id));
    if (rows[0]?.status !== "running") controller.abort();
  }, 2_000);
  watcher.unref();

  const progress = structuredClone(started.progress as Progress);
  let totalRows = started.rows;
  const { from, to } = rangeMs(started);
  const months = berlinMonths(from, to);

  const save = async (currentChunk: string | null) => {
    const [row] = await db()
      .update(backfillJobs)
      .set({ progress, rows: totalRows, currentChunk })
      .where(eq(backfillJobs.id, id))
      .returning();
    if (row) onProgress?.(row);
  };

  try {
    for (const source of started.sources as StoredSourceId[]) {
      const p = (progress[source] ??= { total: months.length, done: [], failed: [], rows: 0, ms: 0, chunks: 0 });
      p.failed = []; // failed months are retried on resume
      const todo = months.filter((m) => !p.done.includes(m.label));
      if (todo.length === 0) continue;

      await recordRun(source, "backfill", async () => {
        let rows = 0;
        for (const month of todo) {
          if (controller.signal.aborted) break;
          await save(`${source} ${month.label}`);
          const t0 = Date.now();
          try {
            const obs = await ADAPTERS[source].fetchRange(month.from, month.to, { signal: controller.signal });
            const written = await writeObservations(obs);
            // Older months lie outside the aggregates' refresh window -> refresh them explicitly.
            await refreshAggregates(month.from, month.to);
            rows += written;
            p.rows += written;
            totalRows += written;
            p.done.push(month.label);
          } catch (err) {
            if (controller.signal.aborted) break;
            p.failed.push({ month: month.label, error: errorMessage(err).slice(0, 300) });
          } finally {
            p.ms += Date.now() - t0;
            p.chunks += 1;
          }
        }
        await save(null);
        if (p.failed.length > 0 && !controller.signal.aborted) {
          throw new Error(`${p.failed.length} Monat(e) fehlgeschlagen, z. B. ${p.failed[0]!.month}: ${p.failed[0]!.error}`);
        }
        return { rows };
      }).catch(() => {
        /* recorded in ingest_runs; the job continues with the next source */
      });
      if (controller.signal.aborted) break;
    }
  } finally {
    clearInterval(watcher);
  }

  if (controller.signal.aborted) {
    // Status was already set to "cancelled" by whoever requested the stop.
    await db().update(backfillJobs).set({ progress, rows: totalRows, currentChunk: null }).where(eq(backfillJobs.id, id));
    return;
  }
  const failures = Object.entries(progress).flatMap(([s, p]) => (p?.failed ?? []).map((f) => `${s} ${f.month}`));
  await db()
    .update(backfillJobs)
    .set({
      status: failures.length ? "error" : "done",
      error: failures.length ? `Fehlgeschlagen: ${failures.slice(0, 10).join(", ")}${failures.length > 10 ? " …" : ""}` : null,
      progress,
      rows: totalRows,
      currentChunk: null,
      finishedAt: new Date(),
    })
    .where(eq(backfillJobs.id, id));
}

/** Months in the job range, for the UI. */
export function jobMonths(job: Pick<BackfillJob, "rangeFrom" | "rangeTo">) {
  const { from, to } = rangeMs(job);
  return berlinMonths(from, to).map((m) => m.label);
}

