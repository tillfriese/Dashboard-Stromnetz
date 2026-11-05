import { requireAdminApi } from "@/lib/auth/session";
import { resetStats } from "@/lib/stats/report";

export const dynamic = "force-dynamic";

/** DELETE – removes all visitor statistics (sessions, events and aggregates). */
export async function DELETE(request: Request) {
  const { response } = await requireAdminApi(request);
  if (response) return response;
  await resetStats();
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
