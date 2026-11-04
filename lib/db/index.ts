import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "@/lib/env";
import * as schema from "./schema";

const g = globalThis as unknown as { pgPool?: Pool; drizzleDb?: NodePgDatabase<typeof schema> };

/** Single shared pool per process (survives hot reload in dev). */
export function pool(): Pool {
  g.pgPool ??= new Pool({
    connectionString: env().DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
  return g.pgPool;
}

export function db(): NodePgDatabase<typeof schema> {
  g.drizzleDb ??= drizzle(pool(), { schema });
  return g.drizzleDb;
}

export { schema };
