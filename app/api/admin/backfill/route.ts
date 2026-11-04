import { z } from "zod";
import { requireAdminApi } from "@/lib/auth/session";
import { BackfillError, createBackfill, defaultSources, getActiveJob, kickRunner, listJobs } from "@/lib/ingest/backfill";
import { STORED_SOURCES } from "@/lib/sources";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };

/** Current and recent import jobs (polled by the admin UI every 2 s while running). */
export async function GET(request: Request) {
  const { response } = await requireAdminApi(request);
  if (response) return response;
  const [jobs, active, defaults] = await Promise.all([listJobs(10), getActiveJob(), defaultSources()]);
  return Response.json({ jobs, activeId: active?.id ?? null, defaultSources: defaults, now: Date.now() }, { headers: noStore });
}

const schema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sources: z.array(z.enum(STORED_SOURCES as [string, ...string[]])).min(1),
});

/** Starts an import (initial import or "Zeitraum neu laden"). Only one runs at a time. */
export async function POST(request: Request) {
  const { response } = await requireAdminApi(request);
  if (response) return response;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Ungültige Eingabe" }, { status: 400, headers: noStore });
  try {
    const job = await createBackfill(parsed.data as Parameters<typeof createBackfill>[0]);
    kickRunner();
    return Response.json({ job }, { status: 201, headers: noStore });
  } catch (err) {
    if (err instanceof BackfillError) return Response.json({ error: err.message }, { status: err.status, headers: noStore });
    throw err;
  }
}
