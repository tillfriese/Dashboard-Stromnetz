import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { ingestRuns } from "@/lib/db/schema";

/** Records a run in ingest_runs (shown in the admin status and log). */
export async function recordRun<T extends { rows: number }>(source: string, job: string, fn: () => Promise<T>): Promise<T> {
  const [run] = await db().insert(ingestRuns).values({ source, job }).returning({ id: ingestRuns.id });
  try {
    const result = await fn();
    await db()
      .update(ingestRuns)
      .set({ status: "success", rows: result.rows, finishedAt: new Date() })
      .where(eq(ingestRuns.id, run!.id));
    return result;
  } catch (err) {
    await db()
      .update(ingestRuns)
      .set({ status: "error", error: errorMessage(err).slice(0, 1000), finishedAt: new Date() })
      .where(eq(ingestRuns.id, run!.id));
    throw err;
  }
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.name === "TimeoutError" ? "Zeitüberschreitung" : err.message;
  return String(err);
}
