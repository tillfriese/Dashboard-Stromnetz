// CLI: apply migrations against DATABASE_URL (local development).
import pg from "pg";
import { runMigrations, waitForDatabase } from "../lib/db/migrate";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
await waitForDatabase(pool, { attempts: 5 });
await runMigrations(pool);
console.info("Migrations applied.");
await pool.end();
