import { requireAdminApi } from "@/lib/auth/session";
import { sessionTimeline } from "@/lib/stats/report";

export const dynamic = "force-dynamic";

/** GET /api/admin/stats/session?id=…&start=ISO – timeline of one session. */
export async function GET(request: Request) {
  const { response } = await requireAdminApi(request);
  if (response) return response;
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const start = url.searchParams.get("start");
  if (!id || !start || Number.isNaN(Date.parse(start))) return Response.json({ error: "id und start angeben" }, { status: 400 });
  return Response.json({ events: await sessionTimeline(id, start) }, { headers: { "Cache-Control": "no-store" } });
}
