import { cachedJson, sourceError } from "@/lib/api";
import { getTimeseries } from "@/lib/history/data";
import { toCsv } from "@/lib/history/derive";
import { parseQuery, today } from "@/lib/history/query";

export const dynamic = "force-dynamic";

/**
 * GET /api/timeseries?from&to&res&regions&carriers&metrics&flow&cond…&format=csv
 * Same parameters as the "Historie" page URL. Never more than ~5000 points per series.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = parseQuery(url.searchParams);
  try {
    const data = await getTimeseries(q);
    // Past periods change only through revisions; the current day changes every 15 minutes.
    const maxAge = q.to >= today() ? 60 : 300;
    if (url.searchParams.get("format") === "csv") {
      return new Response(toCsv(data, q), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="netzlage_${q.from}_${q.to}_${data.res}.csv"`,
          "Cache-Control": `public, max-age=${maxAge}`,
        },
      });
    }
    return cachedJson(data, maxAge);
  } catch (err) {
    return sourceError(err);
  }
}
