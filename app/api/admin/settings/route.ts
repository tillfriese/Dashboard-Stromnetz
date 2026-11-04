import { z } from "zod";
import { requireAdminApi } from "@/lib/auth/session";
import { getSettingsForUi, SOURCE_IDS, setSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  const { response } = await requireAdminApi(request);
  if (response) return response;
  return Response.json({ settings: await getSettingsForUi() }, { headers: noStore });
}

const token = z.string().trim().min(8).max(500).nullable().optional();
const updateSchema = z.object({
  entsoeToken: token,
  gridradarToken: token,
  stromgedachtZip: z.string().regex(/^\d{5}$/, "PLZ muss fünfstellig sein").nullable().optional(),
  publicMode: z.boolean().optional(),
  sources: z.partialRecord(z.enum(SOURCE_IDS), z.boolean()).optional(),
});

/** Updates settings. `null` removes a stored value (env fallback applies again). */
export async function PUT(request: Request) {
  const { response } = await requireAdminApi(request);
  if (response) return response;
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe" }, { status: 400, headers: noStore });
  }
  const p = parsed.data;
  const values: Record<string, string | null> = {};
  if (p.entsoeToken !== undefined) values["entsoe.token"] = p.entsoeToken;
  if (p.gridradarToken !== undefined) values["gridradar.token"] = p.gridradarToken;
  if (p.stromgedachtZip !== undefined) values["stromgedacht.zip"] = p.stromgedachtZip;
  if (p.publicMode !== undefined) values["app.publicMode"] = String(p.publicMode);
  for (const [id, enabled] of Object.entries(p.sources ?? {})) values[`source.${id}.enabled`] = String(enabled);
  await setSettings(values);
  return Response.json({ settings: await getSettingsForUi() }, { headers: noStore });
}
