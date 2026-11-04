import { cachedJson, sourceError } from "@/lib/api";
import { getMix, MIX_WINDOWS, type MixWindow } from "@/lib/queries/mix";

export const dynamic = "force-dynamic";

/** Generation mix of the last 24 h / 48 h / 7 days plus forecasts until tomorrow (for the "Aktuell" chart). */
export async function GET(request: Request) {
  const w = new URL(request.url).searchParams.get("window") ?? "48h";
  if (!(w in MIX_WINDOWS)) return Response.json({ error: "window must be 24h, 48h or 7d" }, { status: 400 });
  try {
    return cachedJson(await getMix(w as MixWindow), 60);
  } catch (err) {
    return sourceError(err);
  }
}
