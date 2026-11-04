import { requireAdminApi } from "@/lib/auth/session";
import { parseRange } from "@/lib/stats/params";
import { listSessions } from "@/lib/stats/report";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { response } = await requireAdminApi(request);
  if (response) return response;
  const url = new URL(request.url);
  const r = parseRange(url);
  if (!r.success) return Response.json({ error: "Zeitraum ungültig" }, { status: 400 });
  const offset = Math.max(0, Number(url.searchParams.get("offset") ?? 0) || 0);
  return Response.json(await listSessions(r.data.from, r.data.to, 50, offset), { headers: { "Cache-Control": "no-store" } });
}
