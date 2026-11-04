import { z } from "zod";
import { requireAdminApi } from "@/lib/auth/session";
import { BackfillError, cancelBackfill, kickRunner, resumeBackfill } from "@/lib/ingest/backfill";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };

/** { action: "cancel" | "resume" } */
export async function POST(request: Request, { params }: RouteContext<"/api/admin/backfill/[id]">) {
  const { response } = await requireAdminApi(request);
  if (response) return response;
  const { id } = await params;
  const parsed = z.object({ action: z.enum(["cancel", "resume"]) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success || !z.uuid().safeParse(id).success) {
    return Response.json({ error: "Ungültige Eingabe" }, { status: 400, headers: noStore });
  }
  try {
    if (parsed.data.action === "cancel") {
      const ok = await cancelBackfill(id);
      return Response.json({ ok }, { status: ok ? 200 : 409, headers: noStore });
    }
    await resumeBackfill(id);
    kickRunner();
    return Response.json({ ok: true }, { headers: noStore });
  } catch (err) {
    if (err instanceof BackfillError) return Response.json({ error: err.message }, { status: err.status, headers: noStore });
    throw err;
  }
}
