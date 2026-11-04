import { cachedJson, sourceError } from "@/lib/api";
import { getHeatmap } from "@/lib/history/heatmap";
import { HEAT_METRICS, type HeatMetric } from "@/lib/history/query";
import { isPublicMode } from "@/lib/settings";

export const dynamic = "force-dynamic";

/** GET /api/heatmap?metric=residual&year=2025 – hour of day x calendar week. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const metric = (url.searchParams.get("metric") ?? "residual") as HeatMetric;
  if (!HEAT_METRICS.includes(metric)) return Response.json({ error: "unknown metric" }, { status: 400 });
  if (metric === "price" && (await isPublicMode())) return Response.json({ error: "Preise ausgeblendet" }, { status: 404 });
  const year = Number(url.searchParams.get("year") ?? new Date().getFullYear() - 1);
  if (!Number.isInteger(year) || year < 2015 || year > 2100) return Response.json({ error: "invalid year" }, { status: 400 });
  try {
    return cachedJson(await getHeatmap(metric, year), year < new Date().getFullYear() ? 600 : 300);
  } catch (err) {
    return sourceError(err);
  }
}
