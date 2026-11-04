import { z } from "zod";
import { requireAdminApi } from "@/lib/auth/session";
import { setSettings } from "@/lib/settings";
import { setRetention } from "@/lib/stats/report";

export const dynamic = "force-dynamic";

/** PUT { days } – retention of raw visitor data (7–730 days). Aggregates are kept forever. */
export async function PUT(request: Request) {
  const { response } = await requireAdminApi(request);
  if (response) return response;
  const parsed = z.object({ days: z.number().int().min(7).max(730) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Aufbewahrung zwischen 7 und 730 Tagen" }, { status: 400 });
  await setRetention(parsed.data.days);
  await setSettings({ "stats.retentionDays": String(parsed.data.days) });
  return Response.json({ days: parsed.data.days }, { headers: { "Cache-Control": "no-store" } });
}
