import { and, desc, eq, type SQL } from "drizzle-orm";
import { requireAdminApi } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { ingestRuns } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

/** Last 100 ingest runs, optionally filtered by source and status. */
export async function GET(request: Request) {
  const { response } = await requireAdminApi(request);
  if (response) return response;
  const url = new URL(request.url);
  const source = url.searchParams.get("source");
  const status = url.searchParams.get("status");
  const where: SQL[] = [];
  if (source) where.push(eq(ingestRuns.source, source));
  if (status === "running" || status === "success" || status === "error") where.push(eq(ingestRuns.status, status));
  const runs = await db()
    .select()
    .from(ingestRuns)
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(ingestRuns.startedAt))
    .limit(100);
  return Response.json({ runs }, { headers: { "Cache-Control": "no-store" } });
}
