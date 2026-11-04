import { cachedJson, sourceError } from "@/lib/api";
import { getNowData } from "@/lib/queries/now";

export const dynamic = "force-dynamic";

/** Current figures: KPIs, mix per control area, cross-border flows, RE share, CO2, grid state, freshness. */
export async function GET() {
  try {
    return cachedJson(await getNowData(), 30);
  } catch (err) {
    return sourceError(err);
  }
}
