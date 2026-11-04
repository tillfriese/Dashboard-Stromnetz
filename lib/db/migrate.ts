import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type { Pool } from "pg";

const MIGRATION_LOCK_ID = 727_001; // arbitrary, app-wide advisory lock key

/** Waits until Postgres accepts connections (DB container may still be starting). */
export async function waitForDatabase(pool: Pool, { attempts = 30, delayMs = 2_000 } = {}) {
  for (let i = 1; i <= attempts; i++) {
    try {
      await pool.query("SELECT 1");
      return;
    } catch (err) {
      if (i === attempts) throw err;
      console.warn(`[db] not ready (attempt ${i}/${attempts}): ${(err as Error).message}`);
      await sleep(delayMs);
    }
  }
}

/** Applies pending SQL migrations under an advisory lock so parallel starts are safe. */
export async function runMigrations(pool: Pool) {
  const folder = process.env.MIGRATIONS_DIR ?? path.join(process.cwd(), "drizzle");
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK_ID]);
    await migrate(drizzle(client), { migrationsFolder: folder });
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK_ID]).catch(() => {});
    client.release();
  }
}
