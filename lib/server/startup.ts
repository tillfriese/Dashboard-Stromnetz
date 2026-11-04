import { pool } from "@/lib/db";
import { runMigrations, waitForDatabase } from "@/lib/db/migrate";
import { ensureSeries } from "@/lib/ingest/store";
import { startScheduler } from "@/lib/ingest/scheduler";

type StartupState = {
  phase: "pending" | "ready" | "failed";
  error?: string;
  startedAt: number;
};

const g = globalThis as unknown as { netzlageStartup?: StartupState };

export function startupState(): StartupState {
  return g.netzlageStartup ?? { phase: "pending", startedAt: Date.now() };
}

/**
 * Runs once per server process (from instrumentation.ts):
 * wait for the DB, apply migrations, then start the scheduler (phase 3).
 */
export async function startup() {
  if (g.netzlageStartup) return;
  g.netzlageStartup = { phase: "pending", startedAt: Date.now() };

  if (!process.env.DATABASE_URL) {
    g.netzlageStartup = { ...g.netzlageStartup, phase: "failed", error: "DATABASE_URL not set" };
    console.warn("[startup] DATABASE_URL not set – skipping migrations");
    return;
  }

  try {
    await waitForDatabase(pool());
    await runMigrations(pool());
    console.info("[startup] migrations applied");
    await ensureSeries();
    g.netzlageStartup = { ...g.netzlageStartup, phase: "ready" };
    startScheduler();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    g.netzlageStartup = { ...g.netzlageStartup, phase: "failed", error: message };
    console.error("[startup] failed:", err);
  }
}
