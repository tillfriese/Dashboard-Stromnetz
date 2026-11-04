import { z } from "zod";
import { requireAdminApi } from "@/lib/auth/session";
import { SOURCE_IDS } from "@/lib/settings";
import { probeSource } from "@/lib/sources/probes";

export const dynamic = "force-dynamic";

const schema = z.object({
  source: z.enum(SOURCE_IDS),
  /** Optional unsaved value (token or zip) to test before saving. */
  value: z.string().trim().min(1).max(500).optional(),
});

/** Performs a real test request against the given source. */
export async function POST(request: Request) {
  const { response } = await requireAdminApi(request);
  if (response) return response;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Ungültige Eingabe" }, { status: 400 });
  const result = await probeSource(parsed.data.source, parsed.data.value);
  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
}
