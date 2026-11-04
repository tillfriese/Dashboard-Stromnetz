import { requireAdminApi } from "@/lib/auth/session";
import { parseRange } from "@/lib/stats/params";
import { listSessions } from "@/lib/stats/report";

export const dynamic = "force-dynamic";

/** CSV export of all sessions in the range (semicolon, UTF-8 BOM). */
export async function GET(request: Request) {
  const { response } = await requireAdminApi(request);
  if (response) return response;
  const r = parseRange(new URL(request.url));
  if (!r.success) return Response.json({ error: "Zeitraum ungültig" }, { status: 400 });
  const { rows } = await listSessions(r.data.from, r.data.to, 100_000, 0);
  const esc = (v: unknown) => (v == null ? "" : `"${String(v).replace(/"/g, '""')}"`);
  const head = ["Start (UTC)", "Dauer [s]", "Seitenaufrufe", "Einstieg", "Ausstieg", "Herkunft", "Gerät", "Browser", "Betriebssystem", "Land"];
  const lines = rows.map((s) =>
    [s.startedAt, Math.round(s.durationMs / 1000), s.pageviews, s.entryPath, s.exitPath, s.referrer, s.device, s.browser, s.os, s.country].map(esc).join(";"),
  );
  return new Response("﻿" + [head.join(";"), ...lines].join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="besucher_${r.data.from}_${r.data.to}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
