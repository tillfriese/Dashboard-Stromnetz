import { cachedJson, sourceError } from "@/lib/api";
import { getPrices } from "@/lib/queries/prices";
import { isPublicMode } from "@/lib/settings";

export const dynamic = "force-dynamic";

/** Day-ahead prices today and tomorrow in 15-minute resolution. Hidden in PUBLIC_MODE. */
export async function GET(request: Request) {
  if (await isPublicMode()) {
    return Response.json({ hidden: true }, { status: 404, headers: { "Cache-Control": "public, max-age=60" } });
  }
  const days = Math.min(3, Math.max(1, Number(new URL(request.url).searchParams.get("days") ?? 2) || 2));
  try {
    return cachedJson(await getPrices(days), 60);
  } catch (err) {
    return sourceError(err);
  }
}
