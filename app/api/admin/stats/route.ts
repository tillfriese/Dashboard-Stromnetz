import { requireAdminApi } from "@/lib/auth/session";
import { parseRange } from "@/lib/stats/params";
import { getStatsReport } from "@/lib/stats/report";

export const dynamic = "force-dynamic";

/** GET /api/admin/stats?from=YYYY-MM-DD&to=YYYY-MM-DD – visitor statistics report. */
export async function GET(request: Request) {
  const { response } = await requireAdminApi(request);
  if (response) return response;
  const r = parseRange(new URL(request.url));
  if (!r.success) return Response.json({ error: "Zeitraum ungültig" }, { status: 400 });
  return Response.json(await getStatsReport(r.data.from, r.data.to), { headers: { "Cache-Control": "no-store" } });
}
